export function activeFriendParticipantIds(state) {
  return (state?.friendContacts ?? [])
    .filter((contact) => contact?.active === true && contact.participantId)
    .map((contact) => contact.participantId);
}

export function isSavedFriend(state, participantId) {
  return activeFriendParticipantIds(state).includes(participantId);
}

export function saveFriendContact(
  state,
  participantId,
  source = "offline",
  updatedAt = new Date().toISOString()
) {
  return updateFriendContact(state, participantId, {
    active: true,
    source: normalizeSource(source),
    updatedAt
  });
}

export function removeFriendContact(
  state,
  participantId,
  updatedAt = new Date().toISOString()
) {
  const current = friendContact(state, participantId);
  if (!current?.active) return state;

  return updateFriendContact(state, participantId, {
    ...current,
    active: false,
    updatedAt
  });
}

export function syncNetworkFriendContacts(
  state,
  participantIds,
  updatedAt = new Date().toISOString()
) {
  const acceptedIds = new Set((participantIds ?? []).filter(Boolean));
  let nextState = state;

  for (const contact of state?.friendContacts ?? []) {
    if (contact?.source !== "network" || !contact.participantId) continue;
    const shouldBeActive = acceptedIds.has(contact.participantId);
    if (contact.active === shouldBeActive) {
      acceptedIds.delete(contact.participantId);
      continue;
    }
    nextState = updateFriendContact(nextState, contact.participantId, {
      ...contact,
      active: shouldBeActive,
      updatedAt
    });
    acceptedIds.delete(contact.participantId);
  }

  for (const participantId of acceptedIds) {
    nextState = saveFriendContact(
      nextState,
      participantId,
      "network",
      updatedAt
    );
  }

  return nextState;
}

function updateFriendContact(state, participantId, patch) {
  if (!participantId) return state;
  const contacts = [...(state?.friendContacts ?? [])];
  const index = contacts.findIndex(
    (contact) => contact?.participantId === participantId
  );
  const current = index >= 0 ? contacts[index] : {};
  const nextContact = {
    ...current,
    ...patch,
    id: participantId,
    participantId
  };

  if (index >= 0) {
    if (JSON.stringify(current) === JSON.stringify(nextContact)) return state;
    contacts[index] = nextContact;
  } else {
    contacts.push(nextContact);
  }

  return {
    ...state,
    friendContacts: contacts
  };
}

function friendContact(state, participantId) {
  return (state?.friendContacts ?? []).find(
    (contact) => contact?.participantId === participantId
  );
}

function normalizeSource(source) {
  return source === "network" ? "network" : "offline";
}
