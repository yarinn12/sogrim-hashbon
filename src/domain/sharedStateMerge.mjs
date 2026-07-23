const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ENTITY_COLLECTION_KEYS = ["participants", "groups", "events", "deletedEvents"];
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
  const merged = {
    ...cloneValue(remote),
    ...cloneValue(local),
    participants: mergeEntities(remote.participants, local.participants),
    groups: mergeEntities(remote.groups, local.groups),
    events: mergeEntities(remote.events, local.events, mergeEvent).filter(
      (event) => !deletedEventIds.has(event.id)
    ),
    deletedEvents
  };

  if (Object.hasOwn(local, "currentParticipantId")) {
    merged.currentParticipantId = local.currentParticipantId;
  }

  return merged;
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

export function assertSafeSharedStateIdentifiers(state, label = "state") {
  const errors = validateSharedStateIdentifiers(state, label);
  if (errors.length) {
    throw new TypeError(`Invalid shared state identifiers: ${errors.join(" ")}`);
  }
}

function mergeEvent(remoteEvent, localEvent) {
  const membership = mergeEventMembership(remoteEvent, localEvent);
  return {
    ...cloneValue(remoteEvent),
    ...cloneValue(localEvent),
    ...membership,
    expenses: mergeEntities(
      remoteEvent.expenses,
      localEvent.expenses,
      chooseNewerExpense
    ),
    transfers: mergeEntities(
      remoteEvent.transfers,
      localEvent.transfers,
      mergeTransfer
    )
  };
}

function mergeEventMembership(remoteEvent, localEvent) {
  const remoteTime = timestamp(remoteEvent.membershipUpdatedAt);
  const localTime = timestamp(localEvent.membershipUpdatedAt);
  if (
    remoteTime === Number.NEGATIVE_INFINITY &&
    localTime === Number.NEGATIVE_INFINITY
  ) {
    return {
      participantIds: unionIds(localEvent.participantIds, remoteEvent.participantIds),
      adminIds: unionIds(localEvent.adminIds, remoteEvent.adminIds)
    };
  }

  const source = localTime >= remoteTime ? localEvent : remoteEvent;
  const participantIds = unionIds(source.participantIds, []);
  return {
    participantIds,
    adminIds: unionIds(source.adminIds, []).filter((id) => participantIds.includes(id)),
    membershipUpdatedAt: source.membershipUpdatedAt
  };
}

function chooseNewerExpense(remoteExpense, localExpense) {
  const remoteTime = timestamp(remoteExpense.updatedAt);
  const localTime = timestamp(localExpense.updatedAt);
  return cloneValue(remoteTime > localTime ? remoteExpense : localExpense);
}

function mergeTransfer(remoteTransfer, localTransfer) {
  const merged = {
    ...cloneValue(remoteTransfer),
    ...cloneValue(localTransfer)
  };
  const paidTransfer =
    localTransfer.status === "paid"
      ? localTransfer
      : remoteTransfer.status === "paid"
        ? remoteTransfer
        : null;

  if (!paidTransfer) return merged;

  merged.status = "paid";
  for (const field of ["markedPaidAt", "markedPaidByParticipantId"]) {
    if (Object.hasOwn(paidTransfer, field)) {
      merged[field] = cloneValue(paidTransfer[field]);
    }
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
