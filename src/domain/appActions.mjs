export function createGroup(state, { id, name, memberIds, adminId }) {
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
        archived: false
      }
    ]
  };
}

export function archiveGroup(state, groupId) {
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === groupId ? { ...group, archived: true } : group
    )
  };
}

export function updateGroup(state, groupId, changes) {
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
        adminIds
      };
    })
  };
}

export function duplicateEvent(state, sourceEventId, nextEvent) {
  const sourceEvent = state.events.find((event) => event.id === sourceEventId);
  if (!sourceEvent) return state;

  const groupFields = sourceEvent.groupId ? { groupId: sourceEvent.groupId } : {};

  return {
    ...state,
    events: [
      {
        id: nextEvent.id,
        name: nextEvent.name.trim() || `${sourceEvent.name} חדש`,
        ...groupFields,
        participantIds: [...sourceEvent.participantIds],
        expenses: [],
        transfers: [],
        adminIds: [nextEvent.adminId],
        createdByParticipantId: nextEvent.adminId,
        adminsCanEditOnly: false,
        locked: false,
        createdAt: nextEvent.createdAt
      },
      ...state.events
    ]
  };
}

export function removeExpense(state, eventId, expenseId) {
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            expenses: event.expenses.filter((expense) => expense.id !== expenseId),
            transfers: []
          }
        : event
    )
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
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            transfers: event.transfers.map((transfer) =>
              transfer.id === transferId ? applyTransferStatus(transfer, update) : transfer
            )
          }
        : event
    )
  };
}

function applyTransferStatus(transfer, update) {
  if (update.status === "paid") {
    return {
      ...transfer,
      status: "paid",
      markedPaidByParticipantId: update.participantId,
      markedPaidAt: update.markedAt
    };
  }

  const { markedPaidByParticipantId, markedPaidAt, ...pendingTransfer } = transfer;
  return { ...pendingTransfer, status: "pending" };
}

export function setEventAdminsCanEditOnly(state, eventId, adminsCanEditOnly) {
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId ? { ...event, adminsCanEditOnly } : event
    )
  };
}

export function canRemoveParticipant(state, participantId) {
  if (!participantId || participantId === state.currentParticipantId) return false;
  return !participantHasMoneyHistory(state, participantId);
}

export function removeParticipant(state, participantId) {
  if (!canRemoveParticipant(state, participantId)) return state;

  return {
    ...state,
    participants: state.participants.filter(
      (participant) => participant.id !== participantId
    ),
    groups: state.groups.map((group) => removeParticipantFromGroup(group, participantId)),
    events: state.events.map((event) => removeParticipantFromEvent(event, participantId))
  };
}

export function joinGuestToEvent(state, eventId, guest) {
  const participant = {
    id: guest.id,
    displayName: guest.displayName.trim() || "אורח",
    kind: "guest"
  };

  return {
    ...state,
    currentParticipantId: participant.id,
    participants: [...state.participants, participant],
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            participantIds: event.participantIds.includes(participant.id)
              ? event.participantIds
              : [...event.participantIds, participant.id],
            transfers: []
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

function participantHasMoneyHistory(state, participantId) {
  return state.events.some((event) => {
    const appearsInExpenses = event.expenses.some(
      (expense) =>
        expense.createdByParticipantId === participantId ||
        expense.sharedByParticipantIds.includes(participantId) ||
        expense.payers.some((payer) => payer.participantId === participantId)
    );

    const appearsInTransfers = event.transfers.some(
      (transfer) =>
        transfer.fromParticipantId === participantId ||
        transfer.toParticipantId === participantId ||
        transfer.markedPaidByParticipantId === participantId
    );

    return appearsInExpenses || appearsInTransfers;
  });
}

function removeParticipantFromGroup(group, participantId) {
  const memberIds = uniqueIds(group.memberIds.filter((id) => id !== participantId));
  const adminIds = uniqueIds((group.adminIds ?? []).filter((id) => memberIds.includes(id)));

  return {
    ...group,
    memberIds,
    adminIds: adminIds.length ? adminIds : memberIds.slice(0, 1),
    archived: memberIds.length ? group.archived : true
  };
}

function removeParticipantFromEvent(event, participantId) {
  const participantIds = uniqueIds(
    event.participantIds.filter((id) => id !== participantId)
  );
  const adminIds = uniqueIds((event.adminIds ?? []).filter((id) =>
    participantIds.includes(id)
  ));

  return {
    ...event,
    participantIds,
    adminIds: adminIds.length ? adminIds : participantIds.slice(0, 1),
    transfers: []
  };
}
