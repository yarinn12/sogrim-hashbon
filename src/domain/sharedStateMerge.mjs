import { remapParticipantPairKeys } from "./participantIdentity.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent
} from "./settlement.mjs";
import { mergeEventActivityLogs } from "./eventActivityLog.mjs";
import { resolveProfileAvatar } from "./profileAvatarSync.mjs";
import { mergeEventNotes } from "./eventNotes.mjs";
import { sumMoneyAmounts } from "./money.mjs";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ENTITY_COLLECTION_KEYS = [
  "participants",
  "friendContacts",
  "groups",
  "events",
  "deletedEvents",
  "deletedParticipants"
];
const SENSITIVE_KEY_FIELDS = new Set(["spaceKey", "sharedSpaceKey"]);

export function mergeSharedStates(remoteState, localState) {
  assertSafeSharedStateIdentifiers(remoteState, "remoteState");
  assertSafeSharedStateIdentifiers(localState, "localState");

  const remote = objectOrEmpty(remoteState);
  const local = objectOrEmpty(localState);
  const deletedEvents = mergeEntities(
    remote.deletedEvents,
    local.deletedEvents,
    chooseNewerDeletion
  );
  const deletedEventIds = new Set(deletedEvents.map((item) => item.id));
  const mergedDeletedParticipants = mergeEntities(
    remote.deletedParticipants,
    local.deletedParticipants,
    chooseNewerDeletion
  );
  const participantCandidates = mergeEntities(
    remote.participants,
    local.participants,
    mergeParticipant
  );
  const {
    deletedParticipants,
    deletedParticipantIds,
    participantRedirects
  } = normalizeParticipantMergeDeletions(
    mergedDeletedParticipants,
    participantCandidates
  );
  const participants = participantCandidates.filter(
    (participant) => !deletedParticipantIds.has(participant.id)
  );
  const merged = {
    ...cloneValue(remote),
    ...cloneValue(local),
    participants,
    friendContacts: mergeEntities(
      remote.friendContacts,
      local.friendContacts,
      chooseNewerUpdatedEntity
    ),
    groups: mergeEntities(
      remote.groups,
      local.groups,
      chooseNewerUpdatedEntity
    )
      .map((group) =>
        remapGroupParticipantReferences(
          group,
          participantRedirects,
          deletedParticipantIds
        )
      )
      .map((group) => removeDeletedGroupParticipants(group, deletedParticipantIds)),
    events: mergeEntities(remote.events, local.events, mergeEvent).filter(
      (event) => !deletedEventIds.has(event.id)
    )
      .map((event) =>
        remapEventParticipantReferences(
          event,
          participantRedirects,
          deletedParticipantIds
        )
      )
      .map((event) => removeDeletedEventParticipants(event, deletedParticipantIds))
      .map((event) => reconcileMergedEventTransfers(event, participants)),
    deletedEvents,
    deletedParticipants
  };

  if (Object.hasOwn(local, "currentParticipantId")) {
    merged.currentParticipantId = remapParticipantId(
      local.currentParticipantId,
      participantRedirects
    );
  }

  return merged;
}

function reconcileMergedEventTransfers(event, participants) {
  if (
    !event ||
    !Array.isArray(event.participantIds) ||
    !Array.isArray(event.expenses) ||
    !Array.isArray(event.transfers)
  ) {
    return event;
  }

  const eventParticipantIds = new Set(event.participantIds);
  const eventParticipants = (participants ?? []).filter((participant) =>
    eventParticipantIds.has(participant?.id)
  );
  const transfersWithStatusUpdates = applyTransferStatusUpdates(
    event.transfers,
    event.transferStatusUpdates
  );
  const settlement = reconcileSettlementTransfers(
    eventParticipants,
    event.expenses,
    transfersWithStatusUpdates,
    settlementOptionsForEvent(event)
  );

  return settlement.issues.length
    ? event
    : { ...event, transfers: settlement.transfers };
}

function chooseNewerDeletion(remoteDeletion, localDeletion) {
  const remoteTime = timestamp(remoteDeletion.deletedAt);
  const localTime = timestamp(localDeletion.deletedAt);
  const newer = remoteTime > localTime ? remoteDeletion : localDeletion;
  const older = newer === remoteDeletion ? localDeletion : remoteDeletion;
  return {
    ...cloneValue(older),
    ...cloneValue(newer)
  };
}

export function isSafeSharedIdentifier(value) {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

export function validateSharedStateIdentifiers(state, label = "state") {
  if (state === null || state === undefined) return [];
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return [`${label} must be an object.`];
  }

  const errors = [];
  for (const collectionKey of ENTITY_COLLECTION_KEYS) {
    const collection = state[collectionKey];
    if (!Array.isArray(collection)) continue;

    collection.forEach((entity, index) => {
      if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
        errors.push(`${label}.${collectionKey}[${index}] must be an object.`);
        return;
      }
      if (!Object.hasOwn(entity, "id")) {
        errors.push(`${label}.${collectionKey}[${index}].id is required.`);
      }
    });
  }

  collectIdentifierErrors(state, label, errors, new WeakSet());
  return errors;
}

export function validateSharedStateFinancials(state, label = "state") {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const errors = [];
  let accountExpenseTotal = 0;
  let accountTransferTotal = 0;
  let accountExpenseTotalIsSafe = true;
  let accountTransferTotalIsSafe = true;
  const participants = Array.isArray(state.participants)
    ? state.participants
    : [];
  const participantIdList = participants
    .map((participant) => participant?.id)
    .filter(Boolean);
  const participantIds = new Set(participantIdList);
  if (participantIds.size !== participantIdList.length) {
    errors.push(`${label}.participants must use unique ids.`);
  }

  if (
    state.currentParticipantId &&
    !participantIds.has(state.currentParticipantId)
  ) {
    errors.push(`${label}.currentParticipantId must reference a participant.`);
  }

  for (const [groupIndex, group] of (
    Array.isArray(state.groups) ? state.groups : []
  ).entries()) {
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    const groupLabel = `${label}.groups[${groupIndex}]`;
    const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
    const adminIds = Array.isArray(group.adminIds) ? group.adminIds : [];
    const memberIdSet = new Set(memberIds);
    if (memberIdSet.size !== memberIds.length) {
      errors.push(`${groupLabel}.memberIds must be unique.`);
    }
    if (memberIds.some((id) => !participantIds.has(id))) {
      errors.push(`${groupLabel}.memberIds must reference known participants.`);
    }
    if (new Set(adminIds).size !== adminIds.length) {
      errors.push(`${groupLabel}.adminIds must be unique.`);
    }
    if (adminIds.some((id) => !memberIdSet.has(id))) {
      errors.push(`${groupLabel}.adminIds must belong to the group.`);
    }
  }

  for (const [eventIndex, event] of (
    Array.isArray(state.events) ? state.events : []
  ).entries()) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const eventLabel = `${label}.events[${eventIndex}]`;
    const eventParticipantIdList = Array.isArray(event.participantIds)
      ? event.participantIds
      : [];
    const eventParticipantIds = new Set(eventParticipantIdList);
    if (eventParticipantIds.size !== eventParticipantIdList.length) {
      errors.push(`${eventLabel}.participantIds must be unique.`);
    }

    for (const participantId of eventParticipantIds) {
      if (!participantIds.has(participantId)) {
        errors.push(
          `${eventLabel}.participantIds must reference known participants.`
        );
      }
    }
    const eventAdminIds = Array.isArray(event.adminIds) ? event.adminIds : [];
    if (new Set(eventAdminIds).size !== eventAdminIds.length) {
      errors.push(`${eventLabel}.adminIds must be unique.`);
    }
    if (eventAdminIds.some((id) => !eventParticipantIds.has(id))) {
      errors.push(`${eventLabel}.adminIds must belong to the event.`);
    }
    const inactiveParticipantIds = Array.isArray(event.inactiveParticipantIds)
      ? event.inactiveParticipantIds
      : [];
    if (new Set(inactiveParticipantIds).size !== inactiveParticipantIds.length) {
      errors.push(`${eventLabel}.inactiveParticipantIds must be unique.`);
    }
    if (inactiveParticipantIds.some((id) => !eventParticipantIds.has(id))) {
      errors.push(
        `${eventLabel}.inactiveParticipantIds must belong to the event.`
      );
    }
    const membershipTimes = objectOrEmpty(
      event.membershipUpdatedAtByParticipant
    );
    for (const [participantId, updatedAt] of Object.entries(membershipTimes)) {
      if (!isSafeSharedIdentifier(participantId)) {
        errors.push(
          `${eventLabel}.membershipUpdatedAtByParticipant contains an unsafe participant id.`
        );
      }
      if (!Number.isFinite(Date.parse(updatedAt))) {
        errors.push(
          `${eventLabel}.membershipUpdatedAtByParticipant must contain ISO timestamps.`
        );
      }
    }
    if (
      event.createdByParticipantId &&
      !eventParticipantIds.has(event.createdByParticipantId)
    ) {
      errors.push(
        `${eventLabel}.createdByParticipantId must belong to the event.`
      );
    }

    const expenseIds = new Set();

    for (const [expenseIndex, expense] of (
      Array.isArray(event.expenses) ? event.expenses : []
    ).entries()) {
      const expenseLabel = `${eventLabel}.expenses[${expenseIndex}]`;
      if (!expense || typeof expense !== "object" || Array.isArray(expense)) {
        errors.push(`${expenseLabel} must be an object.`);
        continue;
      }
      if (expense.id && expenseIds.has(expense.id)) {
        errors.push(`${eventLabel}.expenses must use unique ids.`);
      }
      if (expense.id) expenseIds.add(expense.id);
      if (
        expense.createdByParticipantId &&
        !eventParticipantIds.has(expense.createdByParticipantId)
      ) {
        errors.push(
          `${expenseLabel}.createdByParticipantId must belong to the event.`
        );
      }
      if (!Number.isSafeInteger(expense.total) || expense.total <= 0) {
        errors.push(`${expenseLabel}.total must be a positive integer within the safe money range.`);
      } else if (accountExpenseTotalIsSafe) {
        try {
          accountExpenseTotal = sumMoneyAmounts([accountExpenseTotal, expense.total]);
        } catch {
          accountExpenseTotalIsSafe = false;
          errors.push(`${label}.expenses exceed the safe cumulative money range.`);
        }
      }

      const sharedBy = Array.isArray(expense.sharedByParticipantIds)
        ? expense.sharedByParticipantIds
        : [];
      if (!sharedBy.length || new Set(sharedBy).size !== sharedBy.length) {
        errors.push(
          `${expenseLabel}.sharedByParticipantIds must be non-empty and unique.`
        );
      }
      if (sharedBy.some((id) => !eventParticipantIds.has(id))) {
        errors.push(
          `${expenseLabel}.sharedByParticipantIds must belong to the event.`
        );
      }

      const payers = Array.isArray(expense.payers) ? expense.payers : [];
      const payerIds = payers.map((payer) => payer?.participantId);
      if (!payers.length || new Set(payerIds).size !== payerIds.length) {
        errors.push(`${expenseLabel}.payers must be non-empty and unique.`);
      }
      if (
        payers.some(
          (payer) =>
            !eventParticipantIds.has(payer?.participantId) ||
            !Number.isSafeInteger(payer?.amount) ||
            payer.amount <= 0
        )
      ) {
        errors.push(
          `${expenseLabel}.payers must use event participants and positive integer amounts.`
        );
      }
      let payerTotal = null;
      try {
        payerTotal = sumMoneyAmounts(
          payers.map((payer) =>
            Number.isSafeInteger(payer?.amount) ? payer.amount : 0
          )
        );
      } catch {
        errors.push(`${expenseLabel}.payers exceed the safe cumulative money range.`);
      }
      if (Number.isSafeInteger(expense.total) && payerTotal !== null && payerTotal !== expense.total) {
        errors.push(`${expenseLabel}.payers must add up to total.`);
      }
    }

    const transferIds = new Set();
    for (const [transferIndex, transfer] of (
      Array.isArray(event.transfers) ? event.transfers : []
    ).entries()) {
      const transferLabel = `${eventLabel}.transfers[${transferIndex}]`;
      if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) {
        errors.push(`${transferLabel} must be an object.`);
        continue;
      }
      if (transfer.id && transferIds.has(transfer.id)) {
        errors.push(`${eventLabel}.transfers must use unique ids.`);
      }
      if (transfer.id) transferIds.add(transfer.id);
      if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
        errors.push(`${transferLabel}.amount must be a positive integer within the safe money range.`);
      } else if (accountTransferTotalIsSafe) {
        try {
          accountTransferTotal = sumMoneyAmounts([
            accountTransferTotal,
            transfer.amount
          ]);
        } catch {
          accountTransferTotalIsSafe = false;
          errors.push(`${label}.transfers exceed the safe cumulative money range.`);
        }
      }
      if (
        !eventParticipantIds.has(transfer.fromParticipantId) ||
        !eventParticipantIds.has(transfer.toParticipantId) ||
        transfer.fromParticipantId === transfer.toParticipantId
      ) {
        errors.push(
          `${transferLabel} must connect two different event participants.`
        );
      }
      if (!["pending", "paid"].includes(transfer.status)) {
        errors.push(`${transferLabel}.status must be pending or paid.`);
      }
    }
  }

  return [...new Set(errors)];
}

export function assertSafeSharedStateIdentifiers(state, label = "state") {
  const errors = validateSharedStateIdentifiers(state, label);
  if (errors.length) {
    throw new TypeError(`Invalid shared state identifiers: ${errors.join(" ")}`);
  }
}

function mergeEvent(remoteEvent, localEvent) {
  const membership = mergeEventMembership(remoteEvent, localEvent);
  const lifecycle = mergeEventLifecycle(remoteEvent, localEvent);
  const settings = mergeEventSettings(remoteEvent, localEvent);
  const deletedExpenses = mergeEntities(
    remoteEvent.deletedExpenses,
    localEvent.deletedExpenses,
    chooseNewerDeletion
  );
  const deletedExpenseIds = new Set(deletedExpenses.map((item) => item.id));
  const transferStatusUpdates = mergeEntities(
    remoteEvent.transferStatusUpdates,
    localEvent.transferStatusUpdates,
    mergeTransferStatusUpdate
  );
  const mergedEvent = {
    ...cloneValue(remoteEvent),
    ...cloneValue(localEvent),
    ...membership,
    ...lifecycle,
    ...settings,
    ...mergeEventNotes(remoteEvent, localEvent),
    participantAliases: {
      ...cloneValue(objectOrEmpty(remoteEvent.participantAliases)),
      ...cloneValue(objectOrEmpty(localEvent.participantAliases))
    },
    distinctParticipantPairs: unionValues(
      localEvent.distinctParticipantPairs,
      remoteEvent.distinctParticipantPairs
    ),
    expenses: mergeEntities(
      remoteEvent.expenses,
      localEvent.expenses,
      chooseNewerExpense
    ).filter((expense) => !deletedExpenseIds.has(expense.id)),
    deletedExpenses,
    activityLog: mergeEventActivityLogs(
      remoteEvent.activityLog,
      localEvent.activityLog
    ),
    transfers: mergeEntities(
      remoteEvent.transfers,
      localEvent.transfers,
      mergeTransfer
    )
  };

  if (
    transferStatusUpdates.length > 0 ||
    Object.hasOwn(remoteEvent, "transferStatusUpdates") ||
    Object.hasOwn(localEvent, "transferStatusUpdates")
  ) {
    mergedEvent.transferStatusUpdates = transferStatusUpdates;
  }

  return mergedEvent;
}

function mergeEventSettings(remoteEvent, localEvent) {
  const fields = [
    "name",
    "eventType",
    "currency",
    "groupId",
    "coverImage",
    "adminsCanEditOnly",
    "roundSettlementTransfers",
    "directSettlementTransfers"
  ];
  const settings = {};
  const fieldTimestamps = {};

  for (const field of fields) {
    const remoteHasField = Object.hasOwn(remoteEvent, field);
    const localHasField = Object.hasOwn(localEvent, field);
    if (!remoteHasField && !localHasField) continue;
    const remoteTimeValue =
      remoteEvent.settingsFieldUpdatedAt?.[field] ?? remoteEvent.settingsUpdatedAt;
    const localTimeValue =
      localEvent.settingsFieldUpdatedAt?.[field] ?? localEvent.settingsUpdatedAt;
    const remoteTime = timestamp(remoteTimeValue);
    const localTime = timestamp(localTimeValue);
    const source = !localHasField || (remoteHasField && remoteTime > localTime)
      ? remoteEvent
      : localEvent;
    const sourceTimestamp = source === remoteEvent ? remoteTimeValue : localTimeValue;
    if (Object.hasOwn(source, field)) {
      settings[field] = cloneValue(source[field]);
      if (sourceTimestamp) fieldTimestamps[field] = sourceTimestamp;
    }
  }

  const remoteTime = timestamp(remoteEvent.settingsUpdatedAt);
  const localTime = timestamp(localEvent.settingsUpdatedAt);
  const newestSettingsSource = remoteTime > localTime ? remoteEvent : localEvent;
  if (newestSettingsSource.settingsUpdatedAt) {
    settings.settingsUpdatedAt = newestSettingsSource.settingsUpdatedAt;
  }
  if (Object.keys(fieldTimestamps).length) {
    settings.settingsFieldUpdatedAt = fieldTimestamps;
  }

  const remoteAdminTime = timestamp(remoteEvent.adminIdsUpdatedAt);
  const localAdminTime = timestamp(localEvent.adminIdsUpdatedAt);
  if (
    remoteAdminTime !== Number.NEGATIVE_INFINITY ||
    localAdminTime !== Number.NEGATIVE_INFINITY
  ) {
    const adminSource = remoteAdminTime > localAdminTime
      ? remoteEvent
      : localEvent;
    settings.adminIds = cloneValue(adminSource.adminIds ?? []);
    settings.adminIdsScopedToEvent =
      adminSource.adminIdsScopedToEvent === true;
    settings.adminIdsUpdatedAt = adminSource.adminIdsUpdatedAt;
  }

  return settings;
}

function mergeEventLifecycle(remoteEvent, localEvent) {
  const remoteTime = eventLifecycleTimestamp(remoteEvent);
  const localTime = eventLifecycleTimestamp(localEvent);
  const source =
    remoteTime === localTime &&
    Boolean(remoteEvent.locked || remoteEvent.closedAt) !==
      Boolean(localEvent.locked || localEvent.closedAt)
      ? remoteEvent.locked || remoteEvent.closedAt
        ? remoteEvent
        : localEvent
      : remoteTime > localTime
        ? remoteEvent
        : localEvent;
  const lifecycle = {
    locked: source.locked === true,
    closedAt: source.closedAt ?? null
  };

  if (source.statusUpdatedAt) {
    lifecycle.statusUpdatedAt = source.statusUpdatedAt;
  }

  return lifecycle;
}

function eventLifecycleTimestamp(event) {
  return timestamp(event?.statusUpdatedAt ?? event?.closedAt);
}

function mergeEventMembership(remoteEvent, localEvent) {
  const remoteTime = timestamp(remoteEvent.membershipUpdatedAt);
  const localTime = timestamp(localEvent.membershipUpdatedAt);
  const remoteTimes = objectOrEmpty(
    remoteEvent.membershipUpdatedAtByParticipant
  );
  const localTimes = objectOrEmpty(
    localEvent.membershipUpdatedAtByParticipant
  );
  const hasParticipantTimestamps =
    Object.keys(remoteTimes).length > 0 || Object.keys(localTimes).length > 0;

  if (hasParticipantTimestamps) {
    const participantIds = [];
    const adminIds = [];
    const inactiveParticipantIds = [];
    const membershipUpdatedAtByParticipant = {};
    const allParticipantIds = unionIds(
      [
        ...(remoteEvent.participantIds ?? []),
        ...(localEvent.participantIds ?? []),
        ...(remoteEvent.inactiveParticipantIds ?? []),
        ...(localEvent.inactiveParticipantIds ?? []),
        ...(remoteEvent.adminIds ?? []),
        ...(localEvent.adminIds ?? []),
        ...Object.keys(remoteTimes),
        ...Object.keys(localTimes)
      ],
      []
    );

    for (const participantId of allParticipantIds) {
      const remoteParticipantTime = timestamp(remoteTimes[participantId]);
      const localParticipantTime = timestamp(localTimes[participantId]);
      let source = chooseUntimestampedMembershipSource(
        remoteEvent,
        localEvent,
        participantId
      );

      if (
        remoteParticipantTime !== Number.NEGATIVE_INFINITY ||
        localParticipantTime !== Number.NEGATIVE_INFINITY
      ) {
        if (remoteParticipantTime === localParticipantTime) {
          // Equal explicit evidence is a true conflict. Prefer removal so a
          // stale device cannot silently reactivate a revoked participant.
          source = chooseMembershipTieSource(
            remoteEvent,
            localEvent,
            participantId
          );
        } else {
          source =
            remoteParticipantTime > localParticipantTime
              ? remoteEvent
              : localEvent;
        }
        membershipUpdatedAtByParticipant[participantId] =
          remoteParticipantTime > localParticipantTime
            ? remoteTimes[participantId]
            : localTimes[participantId];
      }

      const state = eventParticipantMembershipState(source, participantId);
      if (state === "absent") continue;
      participantIds.push(participantId);
      if (state === "inactive") inactiveParticipantIds.push(participantId);
      if ((source.adminIds ?? []).includes(participantId)) {
        adminIds.push(participantId);
      }
    }

    const result = {
      participantIds,
      adminIds,
      inactiveParticipantIds,
      membershipUpdatedAtByParticipant
    };
    const latestMembershipTime =
      localTime >= remoteTime
        ? localEvent.membershipUpdatedAt
        : remoteEvent.membershipUpdatedAt;
    if (latestMembershipTime) result.membershipUpdatedAt = latestMembershipTime;
    return result;
  }

  if (
    remoteTime === Number.NEGATIVE_INFINITY &&
    localTime === Number.NEGATIVE_INFINITY
  ) {
    const participantIds = unionIds(localEvent.participantIds, remoteEvent.participantIds);
    const activeParticipantIds = new Set([
      ...(remoteEvent.participantIds ?? []).filter(
        (id) => !(remoteEvent.inactiveParticipantIds ?? []).includes(id)
      ),
      ...(localEvent.participantIds ?? []).filter(
        (id) => !(localEvent.inactiveParticipantIds ?? []).includes(id)
      )
    ]);
    return {
      participantIds,
      adminIds: unionIds(localEvent.adminIds, remoteEvent.adminIds),
      inactiveParticipantIds: unionIds(
        localEvent.inactiveParticipantIds,
        remoteEvent.inactiveParticipantIds
      ).filter((id) =>
        participantIds.includes(id) && !activeParticipantIds.has(id)
      )
    };
  }

  const source = localTime >= remoteTime ? localEvent : remoteEvent;
  const participantIds = unionIds(source.participantIds, []);
  return {
    participantIds,
    adminIds: unionIds(source.adminIds, []).filter((id) => participantIds.includes(id)),
    inactiveParticipantIds: unionIds(source.inactiveParticipantIds, []).filter((id) =>
      participantIds.includes(id)
    ),
    membershipUpdatedAt: source.membershipUpdatedAt
  };
}

function chooseMembershipTieSource(remoteEvent, localEvent, participantId) {
  const remoteState = eventParticipantMembershipState(
    remoteEvent,
    participantId
  );
  const localState = eventParticipantMembershipState(localEvent, participantId);
  if (remoteState === localState) {
    const remoteAdmin = (remoteEvent.adminIds ?? []).includes(participantId);
    const localAdmin = (localEvent.adminIds ?? []).includes(participantId);
    if (remoteAdmin !== localAdmin) return remoteAdmin ? localEvent : remoteEvent;
    return remoteEvent;
  }
  return membershipStateRank(remoteState) >= membershipStateRank(localState)
    ? remoteEvent
    : localEvent;
}

function eventParticipantMembershipState(event, participantId) {
  if (!(event.participantIds ?? []).includes(participantId)) return "absent";
  return (event.inactiveParticipantIds ?? []).includes(participantId)
    ? "inactive"
    : "active";
}

function membershipStateRank(state) {
  if (state === "absent") return 3;
  if (state === "inactive") return 2;
  return 1;
}

function chooseNewerExpense(remoteExpense, localExpense) {
  const remoteTime = timestamp(remoteExpense.updatedAt);
  const localTime = timestamp(localExpense.updatedAt);
  return cloneValue(remoteTime > localTime ? remoteExpense : localExpense);
}

function chooseNewerUpdatedEntity(remoteItem, localItem) {
  const remoteTime = timestamp(remoteItem.updatedAt);
  const localTime = timestamp(localItem.updatedAt);
  return cloneValue(remoteTime > localTime ? remoteItem : localItem);
}

function mergeTransfer(remoteTransfer, localTransfer) {
  const contentSource =
    timestamp(remoteTransfer.updatedAt) > timestamp(localTransfer.updatedAt)
      ? remoteTransfer
      : localTransfer;
  const merged = cloneValue(contentSource);

  const remoteTime = timestamp(
    remoteTransfer.statusUpdatedAt ?? remoteTransfer.markedPaidAt
  );
  const localTime = timestamp(
    localTransfer.statusUpdatedAt ?? localTransfer.markedPaidAt
  );
  const hasStatusTime =
    remoteTime !== Number.NEGATIVE_INFINITY ||
    localTime !== Number.NEGATIVE_INFINITY;
  const statusSource = hasStatusTime
    ? remoteTime === localTime &&
      (remoteTransfer.status === "paid") !== (localTransfer.status === "paid")
      ? remoteTransfer.status === "paid"
        ? remoteTransfer
        : localTransfer
      : remoteTime > localTime
        ? remoteTransfer
        : localTransfer
    : localTransfer.status === "paid"
      ? localTransfer
      : remoteTransfer.status === "paid"
        ? remoteTransfer
        : localTransfer;

  merged.status = statusSource.status === "paid" ? "paid" : "pending";
  delete merged.markedPaidAt;
  delete merged.markedPaidByParticipantId;
  delete merged.statusUpdatedAt;

  if (statusSource.statusUpdatedAt) {
    merged.statusUpdatedAt = statusSource.statusUpdatedAt;
  }
  if (merged.status === "paid") {
    for (const field of ["markedPaidAt", "markedPaidByParticipantId"]) {
      if (Object.hasOwn(statusSource, field)) {
        merged[field] = cloneValue(statusSource[field]);
      }
    }
  }

  return merged;
}

function chooseUntimestampedMembershipSource(remoteEvent, localEvent, participantId) {
  const remoteState = eventParticipantMembershipState(remoteEvent, participantId);
  const localState = eventParticipantMembershipState(localEvent, participantId);
  const presenceRank = { absent: 0, inactive: 1, active: 2 };
  if (remoteState !== localState) {
    // With no timestamp for this participant, absence is not proof of a
    // removal; it can be an older device that never downloaded the member.
    // Preserve the most present state until explicit timestamped evidence wins.
    return presenceRank[remoteState] >= presenceRank[localState]
      ? remoteEvent
      : localEvent;
  }

  const remoteAdmin = (remoteEvent.adminIds ?? []).includes(participantId);
  const localAdmin = (localEvent.adminIds ?? []).includes(participantId);
  if (remoteAdmin !== localAdmin) return remoteAdmin ? remoteEvent : localEvent;
  return remoteEvent;
}

function mergeTransferStatusUpdate(remoteUpdate, localUpdate) {
  const remoteTime = timestamp(remoteUpdate.updatedAt);
  const localTime = timestamp(localUpdate.updatedAt);
  if (
    remoteTime === localTime &&
    (remoteUpdate.status === "paid") !== (localUpdate.status === "paid")
  ) {
    return cloneValue(
      remoteUpdate.status === "pending" ? remoteUpdate : localUpdate
    );
  }
  return cloneValue(remoteTime > localTime ? remoteUpdate : localUpdate);
}

function applyTransferStatusUpdates(transfers, statusUpdates) {
  const updatesById = new Map(
    (Array.isArray(statusUpdates) ? statusUpdates : [])
      .filter((update) => update?.id)
      .map((update) => [update.id, update])
  );

  return (transfers ?? []).map((transfer) => {
    const statusUpdate = updatesById.get(transfer?.id);
    if (!statusUpdate) return transfer;

    const transferStatusTime = timestamp(
      transfer.statusUpdatedAt ?? transfer.markedPaidAt
    );
    const updateTime = timestamp(statusUpdate.updatedAt);
    if (updateTime < transferStatusTime) return transfer;

    const {
      markedPaidAt,
      markedPaidByParticipantId,
      ...transferWithoutPaidStatus
    } = transfer;
    if (statusUpdate.status !== "paid") {
      return {
        ...transferWithoutPaidStatus,
        status: "pending",
        statusUpdatedAt: statusUpdate.updatedAt
      };
    }

    return {
      ...transferWithoutPaidStatus,
      status: "paid",
      statusUpdatedAt: statusUpdate.updatedAt,
      markedPaidAt: statusUpdate.markedAt ?? statusUpdate.updatedAt,
      ...(statusUpdate.markedPaidByParticipantId
        ? {
            markedPaidByParticipantId:
              statusUpdate.markedPaidByParticipantId
          }
        : {})
    };
  });
}

function removeDeletedGroupParticipants(group, deletedParticipantIds) {
  const nextGroup = { ...group };
  if (Array.isArray(group.memberIds)) {
    nextGroup.memberIds = unionIds(group.memberIds, []).filter(
      (id) => !deletedParticipantIds.has(id)
    );
  }
  if (Array.isArray(group.adminIds)) {
    nextGroup.adminIds = unionIds(group.adminIds, []).filter(
      (id) => !deletedParticipantIds.has(id)
    );
  }
  return nextGroup;
}

function removeDeletedEventParticipants(event, deletedParticipantIds) {
  const nextEvent = { ...event };
  if (Array.isArray(event.participantIds)) {
    nextEvent.participantIds = unionIds(event.participantIds, []).filter(
      (id) => !deletedParticipantIds.has(id)
    );
  }
  if (Array.isArray(event.adminIds)) {
    nextEvent.adminIds = unionIds(event.adminIds, []).filter(
      (id) => !deletedParticipantIds.has(id)
    );
  }
  if (Array.isArray(event.inactiveParticipantIds)) {
    nextEvent.inactiveParticipantIds = unionIds(
      event.inactiveParticipantIds,
      []
    ).filter(
      (id) =>
        !deletedParticipantIds.has(id) &&
        nextEvent.participantIds?.includes(id)
    );
  }
  if (
    event.membershipUpdatedAtByParticipant &&
    typeof event.membershipUpdatedAtByParticipant === "object"
  ) {
    nextEvent.membershipUpdatedAtByParticipant = Object.fromEntries(
      Object.entries(event.membershipUpdatedAtByParticipant).filter(
        ([participantId]) => !deletedParticipantIds.has(participantId)
      )
    );
  }
  if (event.participantAliases && typeof event.participantAliases === "object") {
    nextEvent.participantAliases = Object.fromEntries(
      Object.entries(event.participantAliases).filter(
        ([participantId]) => !deletedParticipantIds.has(participantId)
      )
    );
  }
  return nextEvent;
}

function participantMergeRedirects(deletedParticipants) {
  return new Map(
    (deletedParticipants ?? [])
      .filter(
        (item) =>
          item?.reason === "merged" &&
          item.id &&
          item.targetParticipantId &&
          item.id !== item.targetParticipantId
      )
      .map((item) => [item.id, item.targetParticipantId])
  );
}

function normalizeParticipantMergeDeletions(
  deletedParticipants,
  participants
) {
  const rawRedirects = participantMergeRedirects(deletedParticipants);
  const participantById = new Map(
    (participants ?? []).map((participant) => [participant.id, participant])
  );
  const resolvedTargets = new Map();

  function preferredCycleTarget(ids) {
    return [...ids].sort((firstId, secondId) => {
      const firstLinked = participantById.get(firstId)?.accountLinked === true;
      const secondLinked = participantById.get(secondId)?.accountLinked === true;
      if (firstLinked !== secondLinked) return firstLinked ? -1 : 1;
      return firstId.localeCompare(secondId);
    })[0];
  }

  function resolveTarget(sourceId) {
    if (resolvedTargets.has(sourceId)) return resolvedTargets.get(sourceId);

    const path = [];
    const pathIndexes = new Map();
    let currentId = sourceId;

    while (rawRedirects.has(currentId) && !resolvedTargets.has(currentId)) {
      if (pathIndexes.has(currentId)) {
        const cycleStart = pathIndexes.get(currentId);
        const cycleIds = path.slice(cycleStart);
        const targetId = preferredCycleTarget(cycleIds);
        for (const participantId of cycleIds) {
          resolvedTargets.set(participantId, targetId);
        }
        currentId = targetId;
        break;
      }
      pathIndexes.set(currentId, path.length);
      path.push(currentId);
      currentId = rawRedirects.get(currentId);
    }

    const targetId = resolvedTargets.get(currentId) ?? currentId;
    for (const participantId of path) {
      resolvedTargets.set(participantId, targetId);
    }
    resolvedTargets.set(sourceId, targetId);
    return targetId;
  }

  for (const sourceId of rawRedirects.keys()) {
    resolveTarget(sourceId);
  }

  const normalizedDeletions = [];
  for (const deletion of deletedParticipants ?? []) {
    if (deletion?.reason !== "merged") {
      normalizedDeletions.push(cloneValue(deletion));
      continue;
    }
    const targetParticipantId = resolvedTargets.get(deletion.id);
    if (!targetParticipantId || targetParticipantId === deletion.id) continue;
    normalizedDeletions.push({
      ...cloneValue(deletion),
      targetParticipantId
    });
  }

  return {
    deletedParticipants: normalizedDeletions,
    deletedParticipantIds: new Set(
      normalizedDeletions.map((item) => item.id)
    ),
    participantRedirects: participantMergeRedirects(normalizedDeletions)
  };
}

function remapParticipantId(participantId, redirects) {
  let currentId = participantId;
  const visited = new Set();
  while (redirects.has(currentId) && !visited.has(currentId)) {
    visited.add(currentId);
    currentId = redirects.get(currentId);
  }
  return currentId;
}

function remapParticipantIds(ids, redirects, deletedParticipantIds) {
  return unionIds(
    (ids ?? [])
      .map((id) => remapParticipantId(id, redirects))
      .filter((id) => id && !deletedParticipantIds.has(id)),
    []
  );
}

function remapInactiveEventParticipantIds(
  event,
  redirects,
  deletedParticipantIds
) {
  const inactiveParticipantIds = new Set(event.inactiveParticipantIds ?? []);
  const remappedActivity = new Map();

  for (const participantId of event.participantIds ?? []) {
    const remappedId = remapParticipantId(participantId, redirects);
    if (!remappedId || deletedParticipantIds.has(remappedId)) continue;
    const wasActive = !inactiveParticipantIds.has(participantId);
    remappedActivity.set(
      remappedId,
      (remappedActivity.get(remappedId) ?? false) || wasActive
    );
  }

  return [...remappedActivity.entries()]
    .filter(([, hasActiveIdentity]) => !hasActiveIdentity)
    .map(([participantId]) => participantId);
}

function remapGroupParticipantReferences(
  group,
  redirects,
  deletedParticipantIds
) {
  const nextGroup = { ...group };
  if (Array.isArray(group.memberIds)) {
    nextGroup.memberIds = remapParticipantIds(
      group.memberIds,
      redirects,
      deletedParticipantIds
    );
  }
  if (Array.isArray(group.adminIds)) {
    nextGroup.adminIds = remapParticipantIds(
      group.adminIds,
      redirects,
      deletedParticipantIds
    );
  }
  return nextGroup;
}

function remapEventParticipantReferences(
  event,
  redirects,
  deletedParticipantIds
) {
  let distinctParticipantPairs = event.distinctParticipantPairs ?? [];
  for (const [sourceId, targetId] of redirects) {
    distinctParticipantPairs = remapParticipantPairKeys(
      distinctParticipantPairs,
      sourceId,
      targetId
    );
  }

  const nextEvent = { ...event };
  if (Array.isArray(event.participantIds)) {
    nextEvent.participantIds = remapParticipantIds(
      event.participantIds,
      redirects,
      deletedParticipantIds
    );
  }
  if (Array.isArray(event.adminIds)) {
    nextEvent.adminIds = remapParticipantIds(
      event.adminIds,
      redirects,
      deletedParticipantIds
    );
  }
  if (Array.isArray(event.inactiveParticipantIds)) {
    nextEvent.inactiveParticipantIds = remapInactiveEventParticipantIds(
      event,
      redirects,
      deletedParticipantIds
    );
  }
  if (
    event.membershipUpdatedAtByParticipant &&
    typeof event.membershipUpdatedAtByParticipant === "object"
  ) {
    nextEvent.membershipUpdatedAtByParticipant =
      remapParticipantMembershipTimestamps(
        event.membershipUpdatedAtByParticipant,
        redirects,
        deletedParticipantIds
      );
  }
  if (Object.hasOwn(event, "createdByParticipantId")) {
    nextEvent.createdByParticipantId = remapParticipantId(
      event.createdByParticipantId,
      redirects
    );
  }
  if (event.participantAliases && typeof event.participantAliases === "object") {
    nextEvent.participantAliases = Object.fromEntries(
      Object.entries(event.participantAliases)
        .filter(([participantId]) => !redirects.has(participantId))
        .map(([participantId, alias]) => [
          remapParticipantId(participantId, redirects),
          alias
        ])
        .filter(
          ([participantId]) =>
            participantId && !deletedParticipantIds.has(participantId)
        )
    );
  }
  if (Array.isArray(event.distinctParticipantPairs)) {
    nextEvent.distinctParticipantPairs = distinctParticipantPairs;
  }
  if (Array.isArray(event.expenses)) {
    nextEvent.expenses = event.expenses.map((expense) => ({
      ...expense,
      createdByParticipantId: remapParticipantId(
        expense.createdByParticipantId,
        redirects
      ),
      sharedByParticipantIds: remapParticipantIds(
        expense.sharedByParticipantIds,
        redirects,
        deletedParticipantIds
      ),
      payers: mergeRemappedPayers(
        expense.payers,
        redirects,
        deletedParticipantIds
      )
    }));
  }
  if (Array.isArray(event.transfers)) {
    nextEvent.transfers = event.transfers
      .map((transfer) => remapTransferParticipantReferences(transfer, redirects))
      .filter(
        (transfer) =>
          !(
            transfer.fromParticipantId &&
            transfer.toParticipantId &&
            transfer.fromParticipantId === transfer.toParticipantId
          ) &&
          !(
            transfer.fromParticipantId &&
            deletedParticipantIds.has(transfer.fromParticipantId)
          ) &&
          !(
            transfer.toParticipantId &&
            deletedParticipantIds.has(transfer.toParticipantId)
          )
      );
  }
  if (Array.isArray(event.notes)) {
    nextEvent.notes = event.notes.map((note) => ({
      ...note,
      createdByParticipantId: remapParticipantId(
        note.createdByParticipantId,
        redirects
      ),
      updatedByParticipantId: remapParticipantId(
        note.updatedByParticipantId,
        redirects
      )
    }));
  }
  if (Array.isArray(event.deletedNotes)) {
    nextEvent.deletedNotes = event.deletedNotes.map((deletion) => ({
      ...deletion,
      deletedByParticipantId: remapParticipantId(
        deletion.deletedByParticipantId,
        redirects
      )
    }));
  }
  if (Array.isArray(event.transferStatusUpdates)) {
    nextEvent.transferStatusUpdates = event.transferStatusUpdates.map(
      (statusUpdate) => {
        const nextStatusUpdate = { ...statusUpdate };
        if (statusUpdate.markedPaidByParticipantId) {
          nextStatusUpdate.markedPaidByParticipantId = remapParticipantId(
            statusUpdate.markedPaidByParticipantId,
            redirects
          );
        }
        return nextStatusUpdate;
      }
    );
  }
  if (Array.isArray(event.activityLog)) {
    nextEvent.activityLog = event.activityLog.map((entry) => ({
      ...entry,
      actorParticipantId: remapParticipantId(
        entry.actorParticipantId,
        redirects
      ),
      subjectParticipantId: remapParticipantId(
        entry.subjectParticipantId,
        redirects
      ),
      fromParticipantId: remapParticipantId(
        entry.fromParticipantId,
        redirects
      ),
      toParticipantId: remapParticipantId(
        entry.toParticipantId,
        redirects
      )
    }));
  }
  return nextEvent;
}

function remapParticipantMembershipTimestamps(
  timestamps,
  redirects,
  deletedParticipantIds
) {
  const remapped = {};
  for (const [participantId, updatedAt] of Object.entries(timestamps ?? {})) {
    const remappedId = remapParticipantId(participantId, redirects);
    if (!remappedId || deletedParticipantIds.has(remappedId)) continue;
    if (
      !Object.hasOwn(remapped, remappedId) ||
      timestamp(updatedAt) > timestamp(remapped[remappedId])
    ) {
      remapped[remappedId] = updatedAt;
    }
  }
  return remapped;
}

function remapTransferParticipantReferences(transfer, redirects) {
  const nextTransfer = { ...transfer };
  if (Object.hasOwn(transfer, "fromParticipantId")) {
    nextTransfer.fromParticipantId = remapParticipantId(
      transfer.fromParticipantId,
      redirects
    );
  }
  if (Object.hasOwn(transfer, "toParticipantId")) {
    nextTransfer.toParticipantId = remapParticipantId(
      transfer.toParticipantId,
      redirects
    );
  }
  if (Object.hasOwn(transfer, "markedPaidByParticipantId")) {
    nextTransfer.markedPaidByParticipantId = remapParticipantId(
      transfer.markedPaidByParticipantId,
      redirects
    );
  }
  return nextTransfer;
}

function mergeRemappedPayers(payers, redirects, deletedParticipantIds) {
  const totals = new Map();
  for (const payer of payers ?? []) {
    const participantId = remapParticipantId(payer?.participantId, redirects);
    if (!participantId || deletedParticipantIds.has(participantId)) continue;
    totals.set(participantId, sumMoneyAmounts([
      totals.get(participantId) ?? 0,
      Number.isSafeInteger(payer?.amount) ? payer.amount : 0
    ]));
  }
  return [...totals].map(([participantId, amount]) => ({
    participantId,
    amount
  }));
}

function mergeParticipant(remoteParticipant, localParticipant) {
  if (remoteParticipant?.accountDeleted === true) {
    return {
      id: String(remoteParticipant.id ?? localParticipant?.id ?? ""),
      displayName: "משתמש שנמחק",
      kind: "user",
      accountDeleted: true
    };
  }
  const merged = mergeObjects(remoteParticipant, localParticipant);
  const remoteProfileTime = timestamp(remoteParticipant.profileUpdatedAt);
  const localProfileTime = timestamp(localParticipant.profileUpdatedAt);
  const profileSource =
    remoteProfileTime > localProfileTime ? remoteParticipant : localParticipant;

  for (const field of [
    "displayName",
    "kind",
    "avatarPreset",
    "authProvider",
    "authSubject",
    "email",
    "profileUpdatedAt"
  ]) {
    if (Object.hasOwn(profileSource, field)) {
      merged[field] = cloneValue(profileSource[field]);
    }
  }
  const avatarResolution = resolveProfileAvatar(
    localParticipant,
    remoteParticipant
  );
  if (
    avatarResolution.avatarImage ||
    avatarResolution.avatarImageUpdatedAt ||
    Object.hasOwn(localParticipant, "avatarImage") ||
    Object.hasOwn(remoteParticipant, "avatarImage")
  ) {
    merged.avatarImage = avatarResolution.avatarImage;
  } else {
    delete merged.avatarImage;
  }
  if (avatarResolution.avatarImageUpdatedAt) {
    merged.avatarImageUpdatedAt = avatarResolution.avatarImageUpdatedAt;
  } else {
    delete merged.avatarImageUpdatedAt;
  }
  if (
    Object.hasOwn(remoteParticipant, "accountLinked") ||
    Object.hasOwn(localParticipant, "accountLinked")
  ) {
    merged.accountLinked =
      remoteParticipant.accountLinked === true ||
      localParticipant.accountLinked === true;
  }
  return merged;
}

function mergeEntities(remoteItems, localItems, mergeMatch = mergeObjects) {
  const remote = arrayOrEmpty(remoteItems);
  const local = arrayOrEmpty(localItems);
  const remoteById = new Map(
    remote
      .filter(hasId)
      .map((item) => [item.id, item])
  );
  const localIds = new Set(local.filter(hasId).map((item) => item.id));
  const seenLocalIds = new Set();
  const seenRemoteIds = new Set();
  const merged = [];

  for (const item of local) {
    if (!hasId(item)) {
      merged.push(cloneValue(item));
      continue;
    }
    if (seenLocalIds.has(item.id)) continue;

    seenLocalIds.add(item.id);
    merged.push(
      remoteById.has(item.id)
        ? mergeMatch(remoteById.get(item.id), item)
        : cloneValue(item)
    );
  }

  for (const item of remote) {
    if (hasId(item) && localIds.has(item.id)) continue;
    if (hasId(item) && seenRemoteIds.has(item.id)) continue;
    if (hasId(item)) seenRemoteIds.add(item.id);
    merged.push(cloneValue(item));
  }

  return merged;
}

function mergeObjects(remoteItem, localItem) {
  return {
    ...cloneValue(remoteItem),
    ...cloneValue(localItem)
  };
}

function unionIds(primaryIds, secondaryIds) {
  return [
    ...new Set(
      [...arrayOrEmpty(primaryIds), ...arrayOrEmpty(secondaryIds)].filter(Boolean)
    )
  ];
}

function unionValues(primaryValues, secondaryValues) {
  return [
    ...new Set(
      [...arrayOrEmpty(primaryValues), ...arrayOrEmpty(secondaryValues)]
        .filter((value) => typeof value === "string" && value)
    )
  ];
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasId(value) {
  return Boolean(value && typeof value === "object" && value.id);
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }
  return value;
}

function collectIdentifierErrors(value, path, errors, seen) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectIdentifierErrors(item, `${path}[${index}]`, errors, seen);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) {
    errors.push(`${path} must not contain circular references.`);
    return;
  }

  seen.add(value);
  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;

    if (key === "id") {
      if (!isSafeSharedIdentifier(nestedValue)) {
        errors.push(`${nestedPath} must be a safe identifier.`);
      }
      continue;
    }

    if (key.endsWith("Ids")) {
      if (!Array.isArray(nestedValue)) {
        errors.push(`${nestedPath} must be an array of safe identifiers.`);
        continue;
      }
      nestedValue.forEach((identifier, index) => {
        if (!isSafeSharedIdentifier(identifier)) {
          errors.push(`${nestedPath}[${index}] must be a safe identifier.`);
        }
      });
      continue;
    }

    if (key.endsWith("Id")) {
      if (
        nestedValue !== "" &&
        nestedValue !== null &&
        nestedValue !== undefined &&
        !isSafeSharedIdentifier(nestedValue)
      ) {
        errors.push(`${nestedPath} must be a safe identifier.`);
      }
      continue;
    }

    if (SENSITIVE_KEY_FIELDS.has(key)) {
      if (
        nestedValue !== "" &&
        nestedValue !== null &&
        nestedValue !== undefined &&
        !isSafeSharedIdentifier(nestedValue)
      ) {
        errors.push(`${nestedPath} must be a safe identifier.`);
      }
      continue;
    }

    collectIdentifierErrors(nestedValue, nestedPath, errors, seen);
  }
  seen.delete(value);
}
