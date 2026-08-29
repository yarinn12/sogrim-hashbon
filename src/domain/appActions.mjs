import { normalizeCurrency } from "./currencies.mjs";
import {
  normalizeParticipantDisplayName,
  participantHasConnectedAccount,
  participantPairIncludes,
  remapParticipantPairKeys
} from "./participantIdentity.mjs";
import { canManageEventSettings } from "./permissions.mjs";
import {
  initializeParticipantMembership,
  markParticipantMembershipChanges
} from "./eventMembership.mjs";
import {
  reconcileSettlementTransfers,
  settlementOptionsForEvent,
  usesDirectSettlementTransfers,
  usesRoundedSettlementTransfers
} from "./settlement.mjs";

export function createGroup(
  state,
  { id, name, memberIds, adminId, createdAt = new Date().toISOString() }
) {
  const uniqueMemberIds = [...new Set([adminId, ...memberIds])];
  return {
    ...state,
    groups: [
      ...state.groups,
      {
        id,
        name: name.trim() || "קבוצה חדשה",
        memberIds: uniqueMemberIds,
        adminIds: [adminId],
        archived: false,
        createdAt,
        updatedAt: createdAt
      }
    ]
  };
}

export function archiveGroup(state, groupId) {
  const updatedAt = new Date().toISOString();
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === groupId ? { ...group, archived: true, updatedAt } : group
    )
  };
}

export function updateGroup(state, groupId, changes) {
  const updatedAt = new Date().toISOString();
  return {
    ...state,
    groups: state.groups.map((group) => {
      if (group.id !== groupId) return group;

      const requestedMemberIds = uniqueIds(changes.memberIds ?? group.memberIds);
      const memberIds = requestedMemberIds.length
        ? requestedMemberIds
        : uniqueIds(group.memberIds);
      const requestedAdminIds = uniqueIds(changes.adminIds ?? group.adminIds);
      let adminIds = requestedAdminIds;

      if (!adminIds.length) {
        adminIds = uniqueIds(group.adminIds).filter((adminId) =>
          memberIds.includes(adminId)
        );
      }

      if (!adminIds.length && memberIds.length) {
        adminIds = [memberIds[0]];
      }

      return {
        ...group,
        name: changes.name?.trim() || group.name || "קבוצה חדשה",
        memberIds: uniqueIds([...adminIds, ...memberIds]),
        adminIds,
        updatedAt
      };
    })
  };
}

export function duplicateEvent(state, sourceEventId, nextEvent) {
  const sourceEvent = state.events.find((event) => event.id === sourceEventId);
  if (!sourceEvent) return state;
  const inactiveParticipantIds = new Set(sourceEvent.inactiveParticipantIds ?? []);

  const groupFields = sourceEvent.groupId ? { groupId: sourceEvent.groupId } : {};
  const eventTypeFields = sourceEvent.eventType ? { eventType: sourceEvent.eventType } : {};
  const currencyFields = { currency: normalizeCurrency(sourceEvent.currency) };
  const participantIds = sourceEvent.participantIds.filter(
    (participantId) => !inactiveParticipantIds.has(participantId)
  );

  return {
    ...state,
    events: [
      {
        id: nextEvent.id,
        name: nextEvent.name.trim() || `${sourceEvent.name} חדש`,
        ...eventTypeFields,
        ...currencyFields,
        ...groupFields,
        participantIds,
        membershipUpdatedAtByParticipant: initializeParticipantMembership(
          participantIds,
          nextEvent.createdAt
        ),
        expenses: [],
        transfers: [],
        adminIds: [nextEvent.adminId],
        createdByParticipantId: nextEvent.adminId,
        adminsCanEditOnly: sourceEvent.adminsCanEditOnly === true,
        roundSettlementTransfers: usesRoundedSettlementTransfers(sourceEvent),
        directSettlementTransfers: usesDirectSettlementTransfers(sourceEvent),
        locked: false,
        createdAt: nextEvent.createdAt,
        settingsUpdatedAt: nextEvent.createdAt
      },
      ...state.events
    ]
  };
}

export function setEventCurrency(
  state,
  eventId,
  currency,
  { allowExistingExpenses = false } = {}
) {
  const settingsUpdatedAt = new Date().toISOString();
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId &&
      (event.expenses.length === 0 || allowExistingExpenses)
        ? {
            ...event,
            currency: normalizeCurrency(currency),
            ...eventSettingTimestampUpdate(event, "currency", settingsUpdatedAt)
          }
        : event
    )
  };
}

export function setEventRoundSettlementTransfers(
  state,
  eventId,
  roundSettlementTransfers
) {
  const settingsUpdatedAt = new Date().toISOString();
  const enabled = roundSettlementTransfers !== false;
  return {
    ...state,
    events: state.events.map((event) => {
      if (event.id !== eventId) return event;

      const nextEvent = {
        ...event,
        roundSettlementTransfers: enabled,
        ...eventSettingTimestampUpdate(
          event,
          "roundSettlementTransfers",
          settingsUpdatedAt
        )
      };
      if (!(event.transfers ?? []).length) return nextEvent;

      const eventParticipants = (state.participants ?? []).filter((participant) =>
        event.participantIds.includes(participant.id)
      );
      const settlement = reconcileSettlementTransfers(
        eventParticipants,
        event.expenses,
        event.transfers,
        settlementOptionsForEvent(nextEvent)
      );
      return settlement.issues.length
        ? nextEvent
        : { ...nextEvent, transfers: settlement.transfers };
    })
  };
}

export function setEventDirectSettlementTransfers(
  state,
  eventId,
  directSettlementTransfers
) {
  const settingsUpdatedAt = new Date().toISOString();
  const enabled = directSettlementTransfers === true;
  return {
    ...state,
    events: state.events.map((event) => {
      if (event.id !== eventId) return event;

      const nextEvent = {
        ...event,
        directSettlementTransfers: enabled,
        ...eventSettingTimestampUpdate(
          event,
          "directSettlementTransfers",
          settingsUpdatedAt
        )
      };
      const eventParticipants = (state.participants ?? []).filter((participant) =>
        event.participantIds.includes(participant.id)
      );
      const settlement = reconcileSettlementTransfers(
        eventParticipants,
        event.expenses,
        event.transfers,
        settlementOptionsForEvent(nextEvent)
      );
      return settlement.issues.length
        ? nextEvent
        : { ...nextEvent, transfers: settlement.transfers };
    })
  };
}

export function removeExpense(
  state,
  eventId,
  expenseId,
  deletedAt = new Date().toISOString()
) {
  return {
    ...state,
    events: state.events.map((event) => {
      if (
        event.id !== eventId ||
        !event.expenses.some((expense) => expense.id === expenseId)
      ) {
        return event;
      }

      return {
        ...event,
        expenses: event.expenses.filter((expense) => expense.id !== expenseId),
        deletedExpenses: [
          { id: expenseId, deletedAt },
          ...(event.deletedExpenses ?? []).filter((item) => item.id !== expenseId)
        ],
        transfers: []
      };
    })
  };
}

export function canLeaveEvent(state, eventId, participantId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event || !event.participantIds.includes(participantId)) return false;
  if ((event.inactiveParticipantIds ?? []).includes(participantId)) return false;

  const managerIds = eventManagerIds(state, event);
  const isManager = managerIds.includes(participantId);
  const hasAnotherManager = managerIds.some((managerId) => managerId !== participantId);

  return !isManager || hasAnotherManager;
}

export function leaveEvent(state, eventId, participantId) {
  if (!canLeaveEvent(state, eventId, participantId)) return state;
  const updatedAt = new Date().toISOString();
  return deactivateEventParticipant(state, eventId, participantId, updatedAt);
}

export function deactivateEventParticipant(
  state,
  eventId,
  participantId,
  updatedAt = new Date().toISOString(),
  { preserveOffline = false } = {}
) {
  const event = state.events.find((item) => item.id === eventId);
  if (
    !event ||
    !state.participants.some((participant) => participant.id === participantId) ||
    !event.participantIds.includes(participantId) ||
    event.inactiveParticipantIds?.includes(participantId)
  ) {
    return state;
  }

  const keepsHistoricalReference =
    preserveOffline ||
    event.createdByParticipantId === participantId ||
    participantHasEventMoneyHistory(event, participantId);
  const participantIds = keepsHistoricalReference
    ? uniqueIds(event.participantIds)
    : uniqueIds(event.participantIds.filter((id) => id !== participantId));
  const inactiveParticipantIds = keepsHistoricalReference
    ? uniqueIds([...(event.inactiveParticipantIds ?? []), participantId])
    : uniqueIds(
        (event.inactiveParticipantIds ?? []).filter((id) =>
          participantIds.includes(id)
        )
      );
  const activeParticipantIds = participantIds.filter(
    (id) => !inactiveParticipantIds.includes(id)
  );
  let adminIds = uniqueIds(event.adminIds ?? []).filter((id) =>
    activeParticipantIds.includes(id)
  );
  if (!adminIds.length && activeParticipantIds.length) {
    adminIds = [
      activeParticipantIds.includes(event.createdByParticipantId)
        ? event.createdByParticipantId
        : activeParticipantIds[0]
    ];
  }

  return {
    ...state,
    events: state.events.map((item) =>
      item.id === eventId
        ? {
            ...item,
            participantIds,
            inactiveParticipantIds,
            adminIds,
            participantAliases: keepsHistoricalReference
              ? item.participantAliases
              : Object.fromEntries(
                  Object.entries(item.participantAliases ?? {}).filter(
                    ([savedParticipantId]) =>
                      savedParticipantId !== participantId
                  )
                ),
            distinctParticipantPairs: keepsHistoricalReference
              ? item.distinctParticipantPairs
              : (item.distinctParticipantPairs ?? []).filter(
                  (pairKey) =>
                    !participantPairIncludes(pairKey, participantId)
                ),
            membershipUpdatedAt: updatedAt
            ,
            membershipUpdatedAtByParticipant:
              markParticipantMembershipChanges(
                item,
                [participantId],
                updatedAt
              )
          }
        : item
    )
  };
}

export function deleteEvent(state, eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return state;

  const tombstone = {
    id: event.id,
    deletedAt: new Date().toISOString(),
    ...(event.sharedSpaceId ? { sharedSpaceId: event.sharedSpaceId } : {}),
    ...(event.sharedSpaceKey ? { sharedSpaceKey: event.sharedSpaceKey } : {})
  };

  return {
    ...state,
    deletedEvents: [
      tombstone,
      ...(state.deletedEvents ?? []).filter((item) => item.id !== eventId)
    ],
    events: state.events.filter((event) => event.id !== eventId)
  };
}

export function updateExpense(state, eventId, nextExpense) {
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            expenses: event.expenses.map((expense) =>
              expense.id === nextExpense.id ? nextExpense : expense
            ),
            transfers: []
          }
        : event
    )
  };
}

export function updateTransferStatus(state, eventId, transferId, update) {
  const event = state.events.find((item) => item.id === eventId);
  const transfer = event?.transfers.find((item) => item.id === transferId);
  const nextStatus = update.status === "paid" ? "paid" : "pending";
  const currentStatus = transfer?.status === "paid" ? "paid" : "pending";
  if (!transfer || currentStatus === nextStatus) return state;

  const markedAt = update.markedAt || new Date().toISOString();
  const statusUpdate = buildTransferStatusUpdate(transferId, {
    ...update,
    status: nextStatus,
    markedAt
  });

  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            transfers: event.transfers.map((transfer) =>
              transfer.id === transferId
                ? applyTransferStatus(transfer, statusUpdate)
                : transfer
            ),
            transferStatusUpdates: upsertTransferStatusUpdate(
              event.transferStatusUpdates,
              statusUpdate
            )
          }
        : event
    )
  };
}

export function closeEvent(state, eventId, closedAt) {
  const currentEvent = state.events.find((event) => event.id === eventId);
  if (!currentEvent || (currentEvent.locked === true && currentEvent.closedAt)) {
    return state;
  }
  const statusUpdatedAt = closedAt || new Date().toISOString();
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            locked: true,
            closedAt: statusUpdatedAt,
            statusUpdatedAt
          }
        : event
    )
  };
}

export function reopenEvent(state, eventId, reopenedAt) {
  const currentEvent = state.events.find((event) => event.id === eventId);
  if (!currentEvent || (currentEvent.locked !== true && !currentEvent.closedAt)) {
    return state;
  }
  const statusUpdatedAt = reopenedAt || new Date().toISOString();
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            locked: false,
            closedAt: null,
            statusUpdatedAt
          }
        : event
    )
  };
}

function applyTransferStatus(transfer, update) {
  const statusUpdatedAt = update.markedAt;
  if (update.status === "paid") {
    return {
      ...transfer,
      status: "paid",
      markedPaidByParticipantId: update.markedPaidByParticipantId,
      markedPaidAt: statusUpdatedAt,
      statusUpdatedAt
    };
  }

  const { markedPaidByParticipantId, markedPaidAt, ...pendingTransfer } = transfer;
  return { ...pendingTransfer, status: "pending", statusUpdatedAt };
}

function buildTransferStatusUpdate(transferId, update) {
  const statusUpdate = {
    id: transferId,
    status: update.status === "paid" ? "paid" : "pending",
    updatedAt: update.markedAt,
    markedAt: update.markedAt
  };
  if (statusUpdate.status === "paid" && update.participantId) {
    statusUpdate.markedPaidByParticipantId = update.participantId;
  }
  return statusUpdate;
}

function upsertTransferStatusUpdate(statusUpdates, nextUpdate) {
  const updates = Array.isArray(statusUpdates) ? statusUpdates : [];
  const existingIndex = updates.findIndex((update) => update.id === nextUpdate.id);
  if (existingIndex < 0) return [...updates, nextUpdate];
  return updates.map((update, index) =>
    index === existingIndex ? nextUpdate : update
  );
}

export function setEventAdminsCanEditOnly(state, eventId, adminsCanEditOnly) {
  const settingsUpdatedAt = new Date().toISOString();
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            adminsCanEditOnly,
            ...eventSettingTimestampUpdate(
              event,
              "adminsCanEditOnly",
              settingsUpdatedAt
            )
          }
        : event
    )
  };
}

export function setEventParticipantAdmin(
  state,
  eventId,
  participantId,
  enabled,
  updatedAt = new Date().toISOString()
) {
  const event = state.events.find((item) => item.id === eventId);
  if (
    !event ||
    !event.participantIds.includes(participantId) ||
    event.inactiveParticipantIds?.includes(participantId)
  ) {
    return state;
  }

  const effectiveAdminIds = eventManagerIds(state, event).filter(
    (adminId) =>
      event.participantIds.includes(adminId) &&
      !event.inactiveParticipantIds?.includes(adminId)
  );
  const adminIds = enabled
    ? uniqueIds([...effectiveAdminIds, participantId])
    : effectiveAdminIds.filter((adminId) => adminId !== participantId);

  if (!adminIds.length || arraysEqual(adminIds, effectiveAdminIds)) return state;

  return {
    ...state,
    events: state.events.map((item) =>
      item.id === eventId
        ? {
            ...item,
            adminIds,
            adminIdsScopedToEvent: true,
            adminIdsUpdatedAt: updatedAt,
            settingsUpdatedAt: updatedAt
          }
        : item
    )
  };
}

export function canRemoveParticipant(state, participantId) {
  if (!participantId || participantId === state.currentParticipantId) return false;
  return !participantHasMoneyHistory(state, participantId);
}

export function renameOfflineParticipant(
  state,
  participantId,
  displayName,
  profileUpdatedAt = new Date().toISOString()
) {
  const participant = state.participants.find((item) => item.id === participantId);
  if (!participant || participantHasConnectedAccount(participant)) return state;

  const normalizedName = String(displayName ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  if (!normalizedName || normalizedName === participant.displayName) return state;

  return {
    ...state,
    participants: state.participants.map((item) =>
      item.id === participantId
        ? { ...item, displayName: normalizedName, profileUpdatedAt }
        : item
    )
  };
}

export function removeParticipant(state, participantId) {
  if (!canRemoveParticipant(state, participantId)) return state;
  const participant = state.participants.find((item) => item.id === participantId);
  const deletedAt = new Date().toISOString();

  return {
    ...state,
    deletedParticipants: [
      {
        id: participantId,
        deletedAt,
        reason: "removed",
        ...(participant?.accountLinked ? { accountLinked: true } : {})
      },
      ...(state.deletedParticipants ?? []).filter((item) => item.id !== participantId)
    ],
    participants: state.participants.filter(
      (participant) => participant.id !== participantId
    ),
    groups: state.groups.map((group) =>
      removeParticipantFromGroup(group, participantId, state.currentParticipantId)
    ),
    events: state.events.map((event) =>
      removeParticipantFromEvent(event, participantId, state.currentParticipantId)
    )
  };
}

export function canMergeParticipants(
  state,
  sourceParticipantId,
  targetParticipantId
) {
  const { source, target } = participantMergePair(
    state,
    sourceParticipantId,
    targetParticipantId
  );
  if (!source || !target) return false;

  const sourceName = normalizeParticipantDisplayName(source.displayName);
  const targetName = normalizeParticipantDisplayName(target.displayName);
  if (!sourceName || sourceName !== targetName) return false;

  return canManageAffectedParticipantMergeEvents(state, sourceParticipantId);
}

export function canLinkParticipantAccount(
  state,
  sourceParticipantId,
  targetParticipantId
) {
  const { source, target } = participantMergePair(
    state,
    sourceParticipantId,
    targetParticipantId
  );
  if (
    !source ||
    !target ||
    participantHasConnectedAccount(source) ||
    !participantHasConnectedAccount(target)
  ) {
    return false;
  }

  return canManageAffectedParticipantMergeEvents(state, sourceParticipantId);
}

function eventSettingTimestampUpdate(event, field, updatedAt) {
  const settingFields = [
    "name",
    "eventType",
    "currency",
    "groupId",
    "coverImage",
    "adminsCanEditOnly",
    "roundSettlementTransfers",
    "directSettlementTransfers"
  ];
  const previousTimestamp = event.settingsUpdatedAt ?? event.createdAt ?? updatedAt;
  const settingsFieldUpdatedAt = {
    ...(event.settingsFieldUpdatedAt ?? {})
  };

  for (const settingField of settingFields) {
    if (
      Object.hasOwn(event, settingField) &&
      !settingsFieldUpdatedAt[settingField]
    ) {
      settingsFieldUpdatedAt[settingField] = previousTimestamp;
    }
  }
  const previousFieldTimestamp =
    settingsFieldUpdatedAt[field] ?? previousTimestamp;
  const previousFieldTime = Date.parse(previousFieldTimestamp);
  const requestedTime = Date.parse(updatedAt);
  const resolvedUpdatedAt = Number.isFinite(previousFieldTime) &&
    (!Number.isFinite(requestedTime) || requestedTime <= previousFieldTime)
    ? new Date(previousFieldTime + 1).toISOString()
    : updatedAt;
  settingsFieldUpdatedAt[field] = resolvedUpdatedAt;

  return {
    settingsUpdatedAt: resolvedUpdatedAt,
    settingsFieldUpdatedAt
  };
}

export function canLinkParticipantAccountInEvent(
  state,
  eventId,
  sourceParticipantId,
  targetParticipantId
) {
  const event = state.events.find((item) => item.id === eventId);
  const { source, target } = participantMergePair(
    state,
    sourceParticipantId,
    targetParticipantId
  );
  if (
    !event ||
    !source ||
    !target ||
    participantHasConnectedAccount(source) ||
    !participantHasConnectedAccount(target) ||
    !event.participantIds.includes(sourceParticipantId) ||
    !event.participantIds.includes(targetParticipantId) ||
    (event.inactiveParticipantIds ?? []).includes(sourceParticipantId) ||
    (event.inactiveParticipantIds ?? []).includes(targetParticipantId)
  ) {
    return false;
  }

  return canManageEventSettings(state, event, state.currentParticipantId);
}

export function mergeParticipants(
  state,
  sourceParticipantId,
  targetParticipantId
) {
  if (!canMergeParticipants(state, sourceParticipantId, targetParticipantId)) {
    return state;
  }

  return mergeParticipantRecords(
    state,
    sourceParticipantId,
    targetParticipantId
  );
}

export function linkParticipantAccount(
  state,
  sourceParticipantId,
  targetParticipantId
) {
  if (!canLinkParticipantAccount(state, sourceParticipantId, targetParticipantId)) {
    return state;
  }

  return mergeParticipantRecords(
    state,
    sourceParticipantId,
    targetParticipantId
  );
}

export function linkParticipantAccountInEvent(
  state,
  eventId,
  sourceParticipantId,
  targetParticipantId
) {
  if (
    !canLinkParticipantAccountInEvent(
      state,
      eventId,
      sourceParticipantId,
      targetParticipantId
    )
  ) {
    return state;
  }

  const linkedAt = new Date().toISOString();
  const events = state.events.map((event) => {
    if (event.id !== eventId) return event;
    const linkedEvent = mergeParticipantIntoEvent(
      event,
      sourceParticipantId,
      targetParticipantId,
      linkedAt,
      {
        accountLinkActorParticipantId: state.currentParticipantId
      }
    );
    return {
      ...linkedEvent,
      membershipUpdatedAtByParticipant: {
        ...(linkedEvent.membershipUpdatedAtByParticipant ?? {}),
        [sourceParticipantId]: linkedAt,
        [targetParticipantId]: linkedAt
      }
    };
  });
  const sourceStillReferenced =
    state.groups.some(
      (group) =>
        group.memberIds.includes(sourceParticipantId) ||
        group.adminIds?.includes(sourceParticipantId)
    ) ||
    events.some((event) => eventReferencesParticipant(event, sourceParticipantId));

  return {
    ...state,
    currentParticipantId:
      state.currentParticipantId === sourceParticipantId
        ? targetParticipantId
        : state.currentParticipantId,
    participants: sourceStillReferenced
      ? state.participants
      : state.participants.filter(
          (participant) => participant.id !== sourceParticipantId
        ),
    deletedParticipants: sourceStillReferenced
      ? state.deletedParticipants
      : [
          {
            id: sourceParticipantId,
            deletedAt: linkedAt,
            reason: "merged",
            targetParticipantId
          },
          ...(state.deletedParticipants ?? []).filter(
            (item) => item.id !== sourceParticipantId
          )
        ],
    events
  };
}

function mergeParticipantRecords(
  state,
  sourceParticipantId,
  targetParticipantId
) {

  const mergedAt = new Date().toISOString();

  const participants = state.participants.filter(
    (participant) => participant.id !== sourceParticipantId
  );
  const affectedEventIds = new Set(
    affectedParticipantMergeEvents(state, sourceParticipantId).map(
      (event) => event.id
    )
  );
  const events = state.events.map((event) => {
    if (!affectedEventIds.has(event.id)) return event;

    const mergedEvent = mergeParticipantIntoEvent(
        event,
        sourceParticipantId,
        targetParticipantId,
        mergedAt
      );
    const eventParticipants = participants.filter((participant) =>
      mergedEvent.participantIds.includes(participant.id)
    );
    const settlement = reconcileSettlementTransfers(
      eventParticipants,
      mergedEvent.expenses,
      mergedEvent.transfers,
      settlementOptionsForEvent(mergedEvent)
    );
    return settlement.issues.length
      ? mergedEvent
      : { ...mergedEvent, transfers: settlement.transfers };
  });

  return {
    ...state,
    currentParticipantId: replaceId(state.currentParticipantId, sourceParticipantId, targetParticipantId),
    deletedParticipants: [
      {
        id: sourceParticipantId,
        deletedAt: mergedAt,
        reason: "merged",
        targetParticipantId
      },
      ...(state.deletedParticipants ?? []).filter(
        (item) => item.id !== sourceParticipantId
      )
    ],
    participants,
    groups: state.groups.map((group) => ({
      ...group,
      memberIds: uniqueIds(group.memberIds.map((id) => replaceId(id, sourceParticipantId, targetParticipantId))),
      adminIds: uniqueIds((group.adminIds ?? []).map((id) => replaceId(id, sourceParticipantId, targetParticipantId))),
      updatedAt: mergedAt
    })),
    events
  };
}

export function joinGuestToEvent(state, eventId, guest) {
  const participant = {
    id: guest.id,
    displayName: guest.displayName.trim() || "אורח",
    kind: "guest"
  };
  const updatedAt = new Date().toISOString();
  const participantExists = state.participants.some(
    (item) => item.id === participant.id
  );

  return {
    ...state,
    deletedParticipants: (state.deletedParticipants ?? []).filter(
      (item) => item.id !== participant.id
    ),
    currentParticipantId: participant.id,
    participants: participantExists
      ? state.participants.map((item) =>
          item.id === participant.id
            ? {
                ...participant,
                ...item,
                displayName: item.displayName?.trim() || participant.displayName
              }
            : item
        )
      : [...state.participants, participant],
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            participantIds: event.participantIds.includes(participant.id)
              ? event.participantIds
              : [...event.participantIds, participant.id],
            inactiveParticipantIds: (event.inactiveParticipantIds ?? []).filter(
              (participantId) => participantId !== participant.id
            ),
            membershipUpdatedAt: updatedAt,
            membershipUpdatedAtByParticipant:
              markParticipantMembershipChanges(
                event,
                [participant.id],
                updatedAt
              )
          }
        : event
    )
  };
}

export function switchCurrentParticipant(state, participantId) {
  const exists = state.participants.some(
    (participant) => participant.id === participantId
  );

  return exists ? { ...state, currentParticipantId: participantId } : state;
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function participantMergePair(state, sourceParticipantId, targetParticipantId) {
  if (
    !sourceParticipantId ||
    !targetParticipantId ||
    sourceParticipantId === targetParticipantId
  ) {
    return { source: null, target: null };
  }

  return {
    source: state.participants.find(
      (participant) => participant.id === sourceParticipantId
    ),
    target: state.participants.find(
      (participant) => participant.id === targetParticipantId
    )
  };
}

function canManageAffectedParticipantMergeEvents(state, sourceParticipantId) {
  return affectedParticipantMergeEvents(state, sourceParticipantId).every(
    (event) =>
      canManageEventSettings(state, event, state.currentParticipantId)
  );
}

function affectedParticipantMergeEvents(state, sourceParticipantId) {
  const affectedGroupIds = new Set(
    state.groups
      .filter(
        (group) =>
          group.memberIds.includes(sourceParticipantId) ||
          group.adminIds?.includes(sourceParticipantId)
      )
      .map((group) => group.id)
  );

  return state.events.filter(
    (event) =>
      affectedGroupIds.has(event.groupId) ||
      eventReferencesParticipant(event, sourceParticipantId)
  );
}

function eventReferencesParticipant(event, participantId) {
  return (
    event.participantIds.includes(participantId) ||
    event.inactiveParticipantIds?.includes(participantId) ||
    event.adminIds?.includes(participantId) ||
    event.createdByParticipantId === participantId ||
    Object.hasOwn(event.participantAliases ?? {}, participantId) ||
    Object.hasOwn(event.membershipUpdatedAtByParticipant ?? {}, participantId) ||
    (event.distinctParticipantPairs ?? []).some((pairKey) =>
      participantPairIncludes(pairKey, participantId)
    ) ||
    (event.expenses ?? []).some(
      (expense) =>
        expense.createdByParticipantId === participantId ||
        expense.sharedByParticipantIds.includes(participantId) ||
        expense.payers.some((payer) => payer.participantId === participantId)
    ) ||
    (event.transfers ?? []).some(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    ) ||
    (event.activityLog ?? []).some((entry) =>
      [
        entry.actorParticipantId,
        entry.subjectParticipantId,
        entry.fromParticipantId,
        entry.toParticipantId
      ].includes(participantId)
    )
  );
}

function mergeParticipantIntoEvent(
  event,
  sourceParticipantId,
  targetParticipantId,
  updatedAt,
  { accountLinkActorParticipantId = "" } = {}
) {
  const eventParticipantIds = new Set(event.participantIds);
  const inactiveParticipantIds = new Set(event.inactiveParticipantIds ?? []);
  const sourcePresent = eventParticipantIds.has(sourceParticipantId);
  const targetPresent = eventParticipantIds.has(targetParticipantId);
  const mergedTargetStaysInactive =
    sourcePresent && targetPresent
      ? inactiveParticipantIds.has(sourceParticipantId) &&
        inactiveParticipantIds.has(targetParticipantId)
      : sourcePresent
        ? inactiveParticipantIds.has(sourceParticipantId)
        : inactiveParticipantIds.has(targetParticipantId);
  const remappedInactiveParticipantIds = uniqueIds(
    [...inactiveParticipantIds].map((id) =>
      replaceId(id, sourceParticipantId, targetParticipantId)
    )
  ).filter(
    (id) => id !== targetParticipantId || mergedTargetStaysInactive
  );

  return {
    ...event,
    membershipUpdatedAt: updatedAt,
    membershipUpdatedAtByParticipant: mergeParticipantMembershipTimestamps(
      event.membershipUpdatedAtByParticipant,
      sourceParticipantId,
      targetParticipantId,
      updatedAt
    ),
    participantAliases: mergeParticipantAliases(
      event.participantAliases,
      sourceParticipantId,
      targetParticipantId
    ),
    distinctParticipantPairs: remapParticipantPairKeys(
      event.distinctParticipantPairs,
      sourceParticipantId,
      targetParticipantId
    ),
    participantIds: uniqueIds(event.participantIds.map((id) => replaceId(id, sourceParticipantId, targetParticipantId))),
    inactiveParticipantIds: remappedInactiveParticipantIds,
    adminIds: uniqueIds((event.adminIds ?? []).map((id) => replaceId(id, sourceParticipantId, targetParticipantId))),
    createdByParticipantId: replaceId(event.createdByParticipantId, sourceParticipantId, targetParticipantId),
    participantAccountLinks: accountLinkActorParticipantId
      ? [
          ...(event.participantAccountLinks ?? []).filter(
            (link) => link?.sourceParticipantId !== sourceParticipantId
          ),
          {
            sourceParticipantId,
            targetParticipantId,
            linkedByParticipantId: accountLinkActorParticipantId,
            linkedAt: updatedAt
          }
        ]
      : event.participantAccountLinks,
    expenses: event.expenses.map((expense) => {
      if (!expenseReferencesParticipant(expense, sourceParticipantId)) {
        return expense;
      }
      return {
        ...expense,
        updatedAt,
        createdByParticipantId: replaceId(expense.createdByParticipantId, sourceParticipantId, targetParticipantId),
        sharedByParticipantIds: uniqueIds(
          expense.sharedByParticipantIds.map((id) => replaceId(id, sourceParticipantId, targetParticipantId))
        ),
        payers: mergeExpensePayers(
          expense.payers.map((payer) => ({
            ...payer,
            participantId: replaceId(payer.participantId, sourceParticipantId, targetParticipantId)
          }))
        )
      };
    }),
    activityLog: (event.activityLog ?? []).map((entry) => {
      if (!activityEntryReferencesParticipant(entry, sourceParticipantId)) {
        return entry;
      }
      return {
        ...entry,
        actorParticipantId: replaceId(
          entry.actorParticipantId,
          sourceParticipantId,
          targetParticipantId
        ),
        subjectParticipantId: replaceId(
          entry.subjectParticipantId,
          sourceParticipantId,
          targetParticipantId
        ),
        fromParticipantId: replaceId(
          entry.fromParticipantId,
          sourceParticipantId,
          targetParticipantId
        ),
        toParticipantId: replaceId(
          entry.toParticipantId,
          sourceParticipantId,
          targetParticipantId
        )
      };
    }),
    transferStatusUpdates: (event.transferStatusUpdates ?? []).map((update) =>
      update?.markedPaidByParticipantId === sourceParticipantId
        ? {
            ...update,
            markedPaidByParticipantId: targetParticipantId
          }
        : update
    ),
    transfers: event.transfers
      .map((transfer) =>
        transferReferencesParticipant(transfer, sourceParticipantId)
          ? {
              ...transfer,
              updatedAt,
              fromParticipantId: replaceId(transfer.fromParticipantId, sourceParticipantId, targetParticipantId),
              toParticipantId: replaceId(transfer.toParticipantId, sourceParticipantId, targetParticipantId),
              markedPaidByParticipantId: replaceId(transfer.markedPaidByParticipantId, sourceParticipantId, targetParticipantId)
            }
          : transfer
      )
      .filter((transfer) => transfer.fromParticipantId !== transfer.toParticipantId)
  };
}

function expenseReferencesParticipant(expense, participantId) {
  return (
    expense.createdByParticipantId === participantId ||
    expense.sharedByParticipantIds.includes(participantId) ||
    expense.payers.some((payer) => payer.participantId === participantId)
  );
}

function transferReferencesParticipant(transfer, participantId) {
  return (
    transfer.fromParticipantId === participantId ||
    transfer.toParticipantId === participantId ||
    transfer.markedPaidByParticipantId === participantId
  );
}

function activityEntryReferencesParticipant(entry, participantId) {
  return [
    entry.actorParticipantId,
    entry.subjectParticipantId,
    entry.fromParticipantId,
    entry.toParticipantId
  ].includes(participantId);
}

function mergeParticipantMembershipTimestamps(
  timestamps,
  sourceParticipantId,
  targetParticipantId,
  updatedAt
) {
  const nextTimestamps = { ...(timestamps ?? {}) };
  delete nextTimestamps[sourceParticipantId];
  nextTimestamps[targetParticipantId] = updatedAt;
  return nextTimestamps;
}

function mergeExpensePayers(payers) {
  const totals = new Map();
  for (const payer of payers) {
    totals.set(payer.participantId, (totals.get(payer.participantId) ?? 0) + payer.amount);
  }
  return [...totals.entries()].map(([participantId, amount]) => ({ participantId, amount }));
}

function mergeParticipantAliases(aliases, sourceParticipantId, targetParticipantId) {
  const nextAliases = { ...(aliases ?? {}) };
  if (
    !nextAliases[targetParticipantId] &&
    Object.hasOwn(nextAliases, sourceParticipantId)
  ) {
    nextAliases[targetParticipantId] = nextAliases[sourceParticipantId];
  }
  delete nextAliases[sourceParticipantId];
  return nextAliases;
}

function replaceId(value, sourceParticipantId, targetParticipantId) {
  return value === sourceParticipantId ? targetParticipantId : value;
}

function participantHasMoneyHistory(state, participantId) {
  return state.events.some((event) => {
    return participantHasEventMoneyHistory(event, participantId);
  });
}

function participantHasEventMoneyHistory(event, participantId) {
  const appearsInExpenses = (event.expenses ?? []).some(
    (expense) =>
      expense.createdByParticipantId === participantId ||
      expense.sharedByParticipantIds.includes(participantId) ||
      expense.payers.some((payer) => payer.participantId === participantId)
  );

  const appearsInTransfers = (event.transfers ?? []).some(
    (transfer) =>
      transfer.fromParticipantId === participantId ||
      transfer.toParticipantId === participantId ||
      transfer.markedPaidByParticipantId === participantId
  );

  return appearsInExpenses || appearsInTransfers;
}

function eventManagerIds(state, event) {
  if (event.adminIdsScopedToEvent === true && event.adminIds?.length) {
    return uniqueIds(event.adminIds);
  }
  const group = state.groups.find((item) => item.id === event.groupId);
  if (group?.adminIds?.length) return uniqueIds(group.adminIds);
  if (event.adminIds?.length) return uniqueIds(event.adminIds);
  return event.createdByParticipantId ? [event.createdByParticipantId] : [];
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function removeParticipantFromGroup(group, participantId, preferredAdminId = "") {
  const memberIds = uniqueIds(group.memberIds.filter((id) => id !== participantId));
  const adminIds = uniqueIds((group.adminIds ?? []).filter((id) => memberIds.includes(id)));
  const fallbackAdminIds = memberIds.includes(preferredAdminId)
    ? [preferredAdminId]
    : memberIds.slice(0, 1);

  return {
    ...group,
    memberIds,
    adminIds: adminIds.length ? adminIds : fallbackAdminIds,
    archived: memberIds.length ? group.archived : true
  };
}

function removeParticipantFromEvent(event, participantId, preferredAdminId = "") {
  const updatedAt = new Date().toISOString();
  const participantIds = uniqueIds(
    event.participantIds.filter((id) => id !== participantId)
  );
  const adminIds = uniqueIds((event.adminIds ?? []).filter((id) =>
    participantIds.includes(id)
  ));
  const fallbackAdminIds = participantIds.includes(event.createdByParticipantId)
    ? [event.createdByParticipantId]
    : participantIds.includes(preferredAdminId)
      ? [preferredAdminId]
      : participantIds.slice(0, 1);

  return {
    ...event,
    participantAliases: Object.fromEntries(
      Object.entries(event.participantAliases ?? {}).filter(
        ([savedParticipantId]) => savedParticipantId !== participantId
      )
    ),
    distinctParticipantPairs: (event.distinctParticipantPairs ?? []).filter(
      (pairKey) => !participantPairIncludes(pairKey, participantId)
    ),
    participantIds,
    inactiveParticipantIds: uniqueIds(
      (event.inactiveParticipantIds ?? []).filter((id) =>
        participantIds.includes(id)
      )
    ),
    adminIds: adminIds.length ? adminIds : fallbackAdminIds,
    membershipUpdatedAt: updatedAt,
    membershipUpdatedAtByParticipant: markParticipantMembershipChanges(
      event,
      [participantId],
      updatedAt
    )
  };
}
