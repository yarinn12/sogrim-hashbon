import {
  readAccessibleSharedCloudStates,
  readCloudState,
  RECOVERED_MEMBER_SPACE_KEY,
  saveCloudState
} from "./cloudStore.mjs";
import {
  applyClientSpaceToConfig,
  createClientSpaceId,
  createClientSpaceKey,
  normalizeSpaceId,
  normalizeSpaceKey
} from "../domain/cloudSpace.mjs";
import { mergeSharedStates } from "../domain/sharedStateMerge.mjs";
import {
  normalizeAvatarImage,
  normalizeAvatarPreset
} from "../domain/avatarPresets.mjs";
import { normalizeProfileUpdatedAt } from "../domain/userProfile.mjs";
import { EVENT_OPEN_INVITE_TOKEN_FIELD } from "./eventInvites.mjs";
import { saveCloudStateWithConflictRetry } from "./cloudConflictRetry.mjs";
import { fetchWithTimeout } from "./fetchTimeout.mjs";

export const EVENT_SPACE_ID_FIELD = "sharedSpaceId";
export const EVENT_SPACE_KEY_FIELD = "sharedSpaceKey";
const SHARED_EVENT_READ_CONCURRENCY = 6;
const SHARED_EVENT_WRITE_CONCURRENCY = 3;

export function ensureEventShareCredentials(event, {
  createId = createClientSpaceId,
  createKey = createClientSpaceKey
} = {}) {
  if (!event) return null;

  const existing = eventShareCredentials(event);
  if (existing) return existing;

  const id = normalizeSpaceId(createId());
  const key = normalizeSpaceKey(createKey());
  if (!id || !key) throw new Error("Unable to create event share credentials.");

  event[EVENT_SPACE_ID_FIELD] = id;
  event[EVENT_SPACE_KEY_FIELD] = key;
  return { id, key };
}

export function eventShareCredentials(event) {
  const id = normalizeSpaceId(event?.[EVENT_SPACE_ID_FIELD]);
  const key = normalizeSpaceKey(event?.[EVENT_SPACE_KEY_FIELD]);
  return id && key ? { id, key } : null;
}

export function attachSharedEventCredentials(state, eventId, credentials) {
  const id = normalizeSpaceId(credentials?.id);
  const key = normalizeSpaceKey(credentials?.key);
  if (!state || !eventId || !id || !key) return state;

  let attached = false;
  const events = (state.events ?? []).map((event) => {
    if (event?.id !== eventId) return event;
    attached = true;
    return {
      ...event,
      [EVENT_SPACE_ID_FIELD]: id,
      [EVENT_SPACE_KEY_FIELD]: key
    };
  });

  return attached ? { ...state, events } : state;
}

export function buildSharedEventState(state, eventId) {
  const event = state?.events?.find((item) => item.id === eventId);
  if (!event) return null;

  const participantIds = referencedParticipantIds(event);
  const participants = (state.participants ?? [])
    .filter((participant) => participantIds.has(participant.id))
    .map(sanitizeParticipant);
  const deletedParticipants = relevantParticipantMergeDeletions(
    state.deletedParticipants,
    participantIds
  );
  const sharedEvent = clone(event);
  delete sharedEvent[EVENT_SPACE_ID_FIELD];
  delete sharedEvent[EVENT_SPACE_KEY_FIELD];
  delete sharedEvent[EVENT_OPEN_INVITE_TOKEN_FIELD];
  delete sharedEvent.groupId;

  return {
    currentParticipantId: "",
    participants,
    groups: [],
    events: [sharedEvent],
    deletedParticipants
  };
}

export function buildSharedEventSyncSelection(
  previousState,
  nextState,
  { forceParticipantIds = [] } = {}
) {
  const previousEvents = new Map(
    (previousState?.events ?? []).map((event) => [event?.id, event])
  );
  const forcedParticipantIds = new Set(forceParticipantIds.filter(Boolean));
  const eventIds = [];

  for (const event of nextState?.events ?? []) {
    if (!eventShareCredentials(event)) continue;
    const previousEvent = previousEvents.get(event.id);
    if (
      !previousEvent ||
      sharedEventFingerprint(previousState, event.id) !==
        sharedEventFingerprint(nextState, event.id) ||
      [...forcedParticipantIds].some((participantId) =>
        referencedParticipantIds(event).has(participantId)
      )
    ) {
      eventIds.push(event.id);
    }
  }

  const previousDeletions = new Map(
    (previousState?.deletedEvents ?? []).map((deletion) => [
      deletion?.id,
      deletion
    ])
  );
  const deletedEventIds = (nextState?.deletedEvents ?? [])
    .filter((deletion) => {
      if (!eventShareCredentials(deletion)) return false;
      return (
        JSON.stringify(previousDeletions.get(deletion.id) ?? null) !==
        JSON.stringify(deletion)
      );
    })
    .map((deletion) => deletion.id);

  return { eventIds, deletedEventIds };
}

export async function readSharedEventState(
  runtimeConfig,
  credentials,
  expectedEventId = "",
  fetchImpl = fetch
) {
  const config = eventCloudConfig(runtimeConfig, credentials);
  if (!config) return null;
  const sharedState = await readCloudState(config, fetchImpl);
  const expectedEventWasDeleted = Boolean(
    expectedEventId &&
      sharedState?.deletedEvents?.some((item) => item.id === expectedEventId)
  );
  if (
    expectedEventId &&
    sharedState?.events?.[0]?.id !== expectedEventId &&
    !expectedEventWasDeleted
  ) {
    return null;
  }
  return sharedState;
}

export async function saveSharedEventState(
  runtimeConfig,
  state,
  eventId,
  fetchImpl = fetch
) {
  const event = state?.events?.find((item) => item.id === eventId);
  const credentials = eventShareCredentials(event);
  const payload = buildSharedEventState(state, eventId);
  const config = eventCloudConfig(runtimeConfig, credentials);
  if (!config || !payload) return state;

  const remote = await readCloudState(config, fetchImpl);
  if (!remote) {
    await createSharedEventSnapshot(
      runtimeConfig,
      credentials,
      payload,
      fetchImpl
    );
    const created = await readCloudState(config, fetchImpl);
    if (!created) {
      const error = new Error("The shared event was created but could not be verified");
      error.code = "SHARED_EVENT_CREATE_UNVERIFIED";
      throw error;
    }
    return mergeSharedEventIntoState(state, created, credentials);
  }

  await ensureSharedEventMembership(runtimeConfig, credentials, fetchImpl);
  const mergedPayload = buildSharedEventState(
    mergeSharedStates(remote, payload),
    eventId
  );
  const saved = await saveCloudStateWithConflictRetry({
    state: mergedPayload,
    loadLatest: () => readCloudState(config, fetchImpl),
    save: (candidate) => saveCloudState(
      config,
      buildSharedEventState(candidate, eventId),
      fetchImpl
    )
  });

  return mergeSharedEventIntoState(state, saved.state, credentials);
}

export async function syncSharedEvents(
  runtimeConfig,
  state,
  fetchImpl = fetch,
  selection = null
) {
  if (runtimeConfig?.storage?.mode !== "supabase") return state;

  let nextState = state;
  const selectedDeletedEventIds = selectedIds(selection?.deletedEventIds);
  const deletedEvents = (state.deletedEvents ?? []).filter(
    (deletedEvent) =>
      !selectedDeletedEventIds || selectedDeletedEventIds.has(deletedEvent.id)
  );
  const deletionResults = await mapSettledWithConcurrency(
    deletedEvents,
    (deletedEvent) =>
      saveSharedEventDeletion(runtimeConfig, deletedEvent, fetchImpl),
    SHARED_EVENT_WRITE_CONCURRENCY
  );

  const selectedEventIds = selectedIds(selection?.eventIds);
  const sharedEventIds = (state.events ?? [])
    .filter(
      (event) =>
        eventShareCredentials(event) &&
        (!selectedEventIds || selectedEventIds.has(event.id))
    )
    .map((event) => event.id);

  const eventResults = await mapSettledWithConcurrency(
    sharedEventIds,
    async (eventId) => {
      try {
        return await saveSharedEventState(runtimeConfig, state, eventId, fetchImpl);
      } catch (error) {
        const event = state.events?.find((item) => item.id === eventId);
        const credentials = eventShareCredentials(event);
        if (credentials && await sharedEventMembershipWasRevoked(
          runtimeConfig,
          credentials,
          fetchImpl
        )) {
          return revokeSharedEventAccess(state, eventId, runtimeConfig);
        }
        throw error;
      }
    },
    SHARED_EVENT_WRITE_CONCURRENCY
  );
  for (const result of eventResults) {
    if (result.status === "fulfilled") {
      const eventId = result.item;
      const revokedEvent = result.value?.events?.find(
        (event) => event.id === eventId && !eventShareCredentials(event)
      );
      if (revokedEvent) {
        nextState = revokeSharedEventAccess(nextState, eventId, runtimeConfig);
        continue;
      }
      const syncedEvent = result.value?.events?.find((event) => event.id === eventId);
      if (syncedEvent) {
        nextState = mergeSharedEventIntoState(
          nextState,
          buildSharedEventState(result.value, eventId),
          eventShareCredentials(syncedEvent)
        );
      }
    }
  }

  const failures = [...deletionResults, ...eventResults]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  if (failures.length) {
    const error = new Error(
      failures.length === 1
        ? "A shared event could not be synced"
        : `${failures.length} shared events could not be synced`
    );
    error.code = "SHARED_EVENT_SYNC_FAILED";
    error.cause = failures[0];
    error.failures = failures;
    throw error;
  }

  return nextState;
}

export async function saveSharedEventDeletion(
  runtimeConfig,
  deletedEvent,
  fetchImpl = fetch
) {
  const credentials = eventShareCredentials(deletedEvent);
  const config = eventCloudConfig(runtimeConfig, credentials);
  if (!config || !deletedEvent?.id) return false;

  const payload = {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: [],
    deletedEvents: [
      {
        id: deletedEvent.id,
        deletedAt: deletedEvent.deletedAt ?? new Date().toISOString()
      }
    ]
  };
  const remote = await readCloudState(config, fetchImpl);
  if (remote) {
    await ensureSharedEventMembership(runtimeConfig, credentials, fetchImpl);
  }
  const mergedPayload = remote ? mergeSharedStates(remote, payload) : payload;
  await saveCloudStateWithConflictRetry({
    state: mergedPayload,
    loadLatest: () => readCloudState(config, fetchImpl),
    save: (candidate) => saveCloudState(config, candidate, fetchImpl)
  });

  return true;
}

export async function ensureSharedEventMembership(
  runtimeConfig,
  credentials,
  fetchImpl = fetch
) {
  const storage = runtimeConfig?.storage;
  const id = normalizeSpaceId(credentials?.id);
  const key = normalizeSpaceKey(credentials?.key);
  const accessToken = storage?.account?.accessToken;
  if (storage?.mode !== "supabase" || !id || !key) return false;
  if (!accessToken || !storage?.account?.userId) {
    const error = new Error("A signed-in account is required to update a shared event");
    error.code = "SHARED_EVENT_ACCOUNT_REQUIRED";
    error.status = 401;
    throw error;
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${storage.url}/rest/v1/rpc/join_shared_event`,
    {
      method: "POST",
      headers: {
        apikey: storage.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ p_snapshot_id: id })
    }
  );

  if (!response.ok) {
    const error = new Error(
      response.status === 401 || response.status === 403
        ? "Shared event membership is no longer active"
        : "Shared event membership could not be verified"
    );
    error.code =
      response.status === 401 || response.status === 403
        ? "SHARED_EVENT_MEMBERSHIP_REVOKED"
        : "SHARED_EVENT_MEMBERSHIP_FAILED";
    error.status = Number(response.status ?? 0) || 0;
    throw error;
  }

  return true;
}

async function createSharedEventSnapshot(
  runtimeConfig,
  credentials,
  payload,
  fetchImpl = fetch
) {
  const storage = runtimeConfig?.storage;
  const id = normalizeSpaceId(credentials?.id);
  const key = normalizeSpaceKey(credentials?.key);
  const accessToken = storage?.account?.accessToken;
  if (storage?.mode !== "supabase" || !id || !key) return false;
  if (!accessToken || !storage?.account?.userId) {
    const error = new Error("A signed-in account is required to create a shared event");
    error.code = "SHARED_EVENT_ACCOUNT_REQUIRED";
    error.status = 401;
    throw error;
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${storage.url}/rest/v1/rpc/create_shared_event_snapshot`,
    {
      method: "POST",
      headers: {
        apikey: storage.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        p_snapshot_id: id,
        p_space_key: key,
        p_state: payload
      })
    }
  );
  if (!response.ok) {
    const error = new Error("Shared event creation failed");
    error.code = response.status === 401 || response.status === 403
      ? "SHARED_EVENT_CREATE_NOT_ALLOWED"
      : "SHARED_EVENT_CREATE_FAILED";
    error.status = Number(response.status ?? 0) || 0;
    throw error;
  }

  return true;
}

export async function refreshSharedEvents(runtimeConfig, state, fetchImpl = fetch) {
  if (runtimeConfig?.storage?.mode !== "supabase") return state;

  const sharedEvents = (state.events ?? [])
    .map((event) => ({
      event,
      credentials: eventShareCredentials(event)
    }))
    .filter(({ credentials }) => credentials);
  const remoteEvents = await mapSettledWithConcurrency(
    sharedEvents,
    async ({ event, credentials }) => {
      const remote = await readSharedEventState(
        runtimeConfig,
        credentials,
        event.id,
        fetchImpl
      );
      const revoked = !remote && await sharedEventMembershipWasRevoked(
        runtimeConfig,
        credentials,
        fetchImpl
      );
      return { credentials, eventId: event.id, remote, revoked };
    },
    SHARED_EVENT_READ_CONCURRENCY
  );

  let nextState = state;
  for (const result of remoteEvents) {
    if (result.status !== "fulfilled") continue;
    const { credentials, eventId, remote, revoked } = result.value;
    if (revoked) {
      nextState = revokeSharedEventAccess(nextState, eventId, runtimeConfig);
    } else if (remote) {
      nextState = mergeSharedEventIntoState(nextState, remote, credentials);
    }
  }

  return nextState;
}

export async function recoverAccessibleSharedEvents(
  runtimeConfig,
  state,
  fetchImpl = fetch
) {
  if (runtimeConfig?.storage?.mode !== "supabase") return state;
  const rows = await readAccessibleSharedCloudStates(runtimeConfig, fetchImpl);
  let nextState = state;
  for (const row of rows) {
    const eventId = row.state?.events?.[0]?.id;
    if (!eventId) continue;
    nextState = mergeSharedEventIntoState(nextState, row.state, {
      id: row.id,
      key: RECOVERED_MEMBER_SPACE_KEY
    });
  }
  return nextState;
}

export function revokeSharedEventAccess(state, eventId, runtimeConfig = null) {
  const accountParticipantId = runtimeConfig?.storage?.account?.userId
    ? `account-${runtimeConfig.storage.account.userId}`
    : "";
  const currentParticipantId = String(state?.currentParticipantId ?? "");

  return {
    ...state,
    events: (state?.events ?? []).map((event) => {
      if (event?.id !== eventId) return event;
      const participantId = [accountParticipantId, currentParticipantId].find((candidate) =>
        candidate && event.participantIds?.includes(candidate)
      );
      const nextEvent = {
        ...event,
        inactiveParticipantIds: participantId
          ? [...new Set([...(event.inactiveParticipantIds ?? []), participantId])]
          : [...(event.inactiveParticipantIds ?? [])]
      };
      delete nextEvent[EVENT_SPACE_ID_FIELD];
      delete nextEvent[EVENT_SPACE_KEY_FIELD];
      delete nextEvent[EVENT_OPEN_INVITE_TOKEN_FIELD];
      return nextEvent;
    })
  };
}

async function sharedEventMembershipWasRevoked(runtimeConfig, credentials, fetchImpl) {
  try {
    await ensureSharedEventMembership(runtimeConfig, credentials, fetchImpl);
    return false;
  } catch (error) {
    return error?.code === "SHARED_EVENT_MEMBERSHIP_REVOKED";
  }
}

function sharedEventFingerprint(state, eventId) {
  return JSON.stringify(buildSharedEventState(state, eventId));
}

function selectedIds(values) {
  return Array.isArray(values) ? new Set(values) : null;
}

async function mapSettledWithConcurrency(items, worker, concurrency) {
  const input = Array.isArray(items) ? items : [];
  const results = new Array(input.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < input.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = input[index];
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(item, index),
          item
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason, item };
      }
    }
  }

  const workerCount = Math.min(
    input.length,
    Math.max(1, Number(concurrency) || 1)
  );
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

export function mergeSharedEventIntoState(state, sharedState, credentials) {
  const deletedEvent = sharedState?.deletedEvents?.find((item) => item?.id);
  if (deletedEvent) {
    const merged = mergeSharedStates(state, {
      currentParticipantId: state.currentParticipantId,
      participants: [],
      groups: [],
      events: [],
      deletedEvents: [
        {
          ...deletedEvent,
          [EVENT_SPACE_ID_FIELD]: credentials.id,
          [EVENT_SPACE_KEY_FIELD]: credentials.key
        }
      ]
    });
    return {
      ...merged,
      currentParticipantId: state.currentParticipantId
    };
  }

  if (!sharedState?.events?.length) return state;
  const sharedEvent = sharedState.events[0];
  const eventId = sharedEvent?.id;
  if (!eventId) return state;

  const allowedParticipantIds = referencedParticipantIds(sharedEvent);
  const deletedParticipants = relevantParticipantMergeDeletions(
    sharedState.deletedParticipants,
    allowedParticipantIds
  );
  const eventOnlyState = {
    currentParticipantId: state.currentParticipantId,
    participants: (sharedState.participants ?? []).filter((participant) =>
      allowedParticipantIds.has(participant.id)
    ),
    groups: [],
    events: [sharedEvent],
    deletedParticipants
  };
  const merged = mergeSharedStates(state, eventOnlyState);
  return {
    ...merged,
    currentParticipantId:
      merged.currentParticipantId || state.currentParticipantId,
    events: merged.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            [EVENT_SPACE_ID_FIELD]: credentials.id,
            [EVENT_SPACE_KEY_FIELD]: credentials.key
          }
        : event
    )
  };
}

function eventCloudConfig(runtimeConfig, credentials) {
  if (runtimeConfig?.storage?.mode !== "supabase") return null;
  const id = normalizeSpaceId(credentials?.id);
  const key = normalizeSpaceKey(credentials?.key);
  if (!id || !key) return null;
  const config = applyClientSpaceToConfig(runtimeConfig, id, key);
  return {
    ...config,
    storage: {
      ...config.storage,
      snapshotKind: "shared_event"
    }
  };
}

function sanitizeParticipant(participant) {
  const avatarPreset = normalizeAvatarPreset(participant?.avatarPreset);
  const avatarImage = normalizeAvatarImage(participant?.avatarImage);
  const profileUpdatedAt = normalizeProfileUpdatedAt(participant?.profileUpdatedAt);
  const avatarImageUpdatedAt = normalizeProfileUpdatedAt(
    participant?.avatarImageUpdatedAt ||
      (avatarImage ? participant?.profileUpdatedAt : "")
  );
  return {
    id: String(participant.id),
    displayName: String(participant.displayName ?? ""),
    kind: participant.kind === "guest" ? "guest" : "user",
    ...(avatarPreset ? { avatarPreset } : {}),
    ...(avatarImage ? { avatarImage } : {}),
    ...(avatarImageUpdatedAt ? { avatarImageUpdatedAt } : {}),
    ...(profileUpdatedAt ? { profileUpdatedAt } : {}),
    accountLinked:
      participant.accountLinked === true ||
      (
        ["google", "apple", "email"].includes(participant.authProvider) &&
        Boolean(participant.authSubject)
      )
  };
}

function referencedParticipantIds(event) {
  const ids = new Set(event.participantIds ?? []);
  for (const id of event.adminIds ?? []) ids.add(id);
  if (event.createdByParticipantId) ids.add(event.createdByParticipantId);
  for (const expense of event.expenses ?? []) {
    if (expense.createdByParticipantId) ids.add(expense.createdByParticipantId);
    for (const id of expense.sharedByParticipantIds ?? []) ids.add(id);
    for (const payer of expense.payers ?? []) ids.add(payer.participantId);
  }
  for (const transfer of event.transfers ?? []) {
    ids.add(transfer.fromParticipantId);
    ids.add(transfer.toParticipantId);
    if (transfer.markedPaidByParticipantId) ids.add(transfer.markedPaidByParticipantId);
  }
  for (const activity of event.activityLog ?? []) {
    if (activity.actorParticipantId) ids.add(activity.actorParticipantId);
    if (activity.subjectParticipantId) ids.add(activity.subjectParticipantId);
    if (activity.fromParticipantId) ids.add(activity.fromParticipantId);
    if (activity.toParticipantId) ids.add(activity.toParticipantId);
  }
  ids.delete(undefined);
  ids.delete("");
  return ids;
}

function relevantParticipantMergeDeletions(deletions, participantIds) {
  return (deletions ?? [])
    .filter(
      (deletion) =>
        deletion?.reason === "merged" &&
        deletion?.targetParticipantId &&
        (
          participantIds.has(deletion.id) ||
          participantIds.has(deletion.targetParticipantId)
        )
    )
    .map(clone);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
