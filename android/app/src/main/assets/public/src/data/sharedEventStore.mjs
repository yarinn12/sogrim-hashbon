import { readCloudState, saveCloudState } from "./cloudStore.mjs";
import {
  applyClientSpaceToConfig,
  createClientSpaceId,
  createClientSpaceKey,
  normalizeSpaceId,
  normalizeSpaceKey
} from "../domain/cloudSpace.mjs";
import { mergeSharedStates } from "../domain/sharedStateMerge.mjs";

export const EVENT_SPACE_ID_FIELD = "sharedSpaceId";
export const EVENT_SPACE_KEY_FIELD = "sharedSpaceKey";

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

export function buildSharedEventState(state, eventId) {
  const event = state?.events?.find((item) => item.id === eventId);
  if (!event) return null;

  const participantIds = referencedParticipantIds(event);
  const participants = (state.participants ?? [])
    .filter((participant) => participantIds.has(participant.id))
    .map(sanitizeParticipant);
  const sharedEvent = clone(event);
  delete sharedEvent[EVENT_SPACE_ID_FIELD];
  delete sharedEvent[EVENT_SPACE_KEY_FIELD];
  delete sharedEvent.groupId;

  return {
    currentParticipantId: "",
    participants,
    groups: [],
    events: [sharedEvent]
  };
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
  const mergedPayload = remote ? mergeSharedStates(remote, payload) : payload;

  try {
    await saveCloudState(config, mergedPayload, fetchImpl);
  } catch (error) {
    if (error?.code !== "CLOUD_STATE_CONFLICT") throw error;
    const latest = await readCloudState(config, fetchImpl);
    await saveCloudState(
      config,
      latest ? mergeSharedStates(latest, mergedPayload) : mergedPayload,
      fetchImpl
    );
  }

  return mergeSharedEventIntoState(state, mergedPayload, credentials);
}

export async function syncSharedEvents(runtimeConfig, state, fetchImpl = fetch) {
  if (runtimeConfig?.storage?.mode !== "supabase") return state;

  let nextState = state;
  for (const deletedEvent of state.deletedEvents ?? []) {
    await saveSharedEventDeletion(runtimeConfig, deletedEvent, fetchImpl);
  }

  const sharedEventIds = (state.events ?? [])
    .filter((event) => eventShareCredentials(event))
    .map((event) => event.id);

  for (const eventId of sharedEventIds) {
    nextState = await saveSharedEventState(runtimeConfig, nextState, eventId, fetchImpl);
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
  const mergedPayload = remote ? mergeSharedStates(remote, payload) : payload;

  try {
    await saveCloudState(config, mergedPayload, fetchImpl);
  } catch (error) {
    if (error?.code !== "CLOUD_STATE_CONFLICT") throw error;
    const latest = await readCloudState(config, fetchImpl);
    await saveCloudState(
      config,
      latest ? mergeSharedStates(latest, mergedPayload) : mergedPayload,
      fetchImpl
    );
  }

  return true;
}

export async function refreshSharedEvents(runtimeConfig, state, fetchImpl = fetch) {
  if (runtimeConfig?.storage?.mode !== "supabase") return state;

  let nextState = state;
  for (const event of state.events ?? []) {
    const credentials = eventShareCredentials(event);
    if (!credentials) continue;
    const remote = await readSharedEventState(
      runtimeConfig,
      credentials,
      event.id,
      fetchImpl
    );
    if (remote) nextState = mergeSharedEventIntoState(nextState, remote, credentials);
  }

  return nextState;
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
  const eventOnlyState = {
    currentParticipantId: state.currentParticipantId,
    participants: (sharedState.participants ?? []).filter((participant) =>
      allowedParticipantIds.has(participant.id)
    ),
    groups: [],
    events: [sharedEvent]
  };
  const merged = mergeSharedStates(state, eventOnlyState);
  return {
    ...merged,
    currentParticipantId: state.currentParticipantId,
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
  return applyClientSpaceToConfig(runtimeConfig, id, key);
}

function sanitizeParticipant(participant) {
  return {
    id: String(participant.id),
    displayName: String(participant.displayName ?? ""),
    kind: participant.kind === "guest" ? "guest" : "user"
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
  ids.delete(undefined);
  ids.delete("");
  return ids;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
