import { canEditEvent } from "./permissions.mjs";

export const MAX_EVENT_NOTES = 100;
export const MAX_EVENT_NOTE_TITLE_LENGTH = 120;
export const MAX_EVENT_NOTE_BODY_LENGTH = 5_000;

const SAFE_NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function addEventNote(
  state,
  eventId,
  {
    id,
    title = "",
    body = "",
    pinned = false,
    participantId = state?.currentParticipantId,
    createdAt = new Date().toISOString()
  } = {}
) {
  const event = state?.events?.find((item) => item.id === eventId);
  const notes = Array.isArray(event?.notes) ? event.notes : [];
  if (
    !event ||
    !canEditEvent(state, event, participantId) ||
    !isSafeNoteId(id) ||
    notes.length >= MAX_EVENT_NOTES ||
    notes.some((note) => note?.id === id) ||
    (event.deletedNotes ?? []).some((deletion) => deletion?.id === id)
  ) {
    return state;
  }

  const content = normalizeNoteContent({ title, body });
  if (!content) return state;
  const savedAt = normalizeTimestamp(createdAt);
  const note = {
    id,
    ...content,
    ...(pinned === true ? { pinned: true } : {}),
    createdAt: savedAt,
    updatedAt: savedAt,
    createdByParticipantId: participantId,
    updatedByParticipantId: participantId
  };

  return replaceEvent(state, eventId, {
    ...event,
    notes: [note, ...notes]
  });
}

export function updateEventNote(
  state,
  eventId,
  noteId,
  {
    title,
    body,
    pinned,
    participantId = state?.currentParticipantId,
    updatedAt = new Date().toISOString()
  } = {}
) {
  const event = state?.events?.find((item) => item.id === eventId);
  const notes = Array.isArray(event?.notes) ? event.notes : [];
  const currentNote = notes.find((note) => note?.id === noteId);
  if (!event || !currentNote || !canEditEvent(state, event, participantId)) {
    return state;
  }

  const content = normalizeNoteContent({
    title: title === undefined ? currentNote.title : title,
    body: body === undefined ? currentNote.body : body
  });
  if (!content) return state;
  const nextPinned = pinned === undefined
    ? currentNote.pinned === true
    : pinned === true;
  if (
    content.title === String(currentNote.title ?? "") &&
    content.body === String(currentNote.body ?? "") &&
    nextPinned === (currentNote.pinned === true)
  ) {
    return state;
  }

  const savedAt = monotonicTimestamp(updatedAt, currentNote.updatedAt);
  return replaceEvent(state, eventId, {
    ...event,
    notes: notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            ...content,
            ...(nextPinned ? { pinned: true } : { pinned: false }),
            updatedAt: savedAt,
            updatedByParticipantId: participantId
          }
        : note
    )
  });
}

export function removeEventNote(
  state,
  eventId,
  noteId,
  {
    participantId = state?.currentParticipantId,
    deletedAt = new Date().toISOString()
  } = {}
) {
  const event = state?.events?.find((item) => item.id === eventId);
  const notes = Array.isArray(event?.notes) ? event.notes : [];
  const note = notes.find((item) => item?.id === noteId);
  if (!event || !note || !canEditEvent(state, event, participantId)) {
    return state;
  }

  const tombstone = {
    id: noteId,
    deletedAt: monotonicTimestamp(deletedAt, note.updatedAt),
    deletedByParticipantId: participantId
  };
  return replaceEvent(state, eventId, {
    ...event,
    notes: notes.filter((item) => item?.id !== noteId),
    deletedNotes: [
      tombstone,
      ...(event.deletedNotes ?? []).filter((item) => item?.id !== noteId)
    ]
  });
}

export function mergeEventNotes(remoteEvent, localEvent) {
  const hasNotes =
    Object.hasOwn(remoteEvent ?? {}, "notes") ||
    Object.hasOwn(localEvent ?? {}, "notes") ||
    Object.hasOwn(remoteEvent ?? {}, "deletedNotes") ||
    Object.hasOwn(localEvent ?? {}, "deletedNotes");
  if (!hasNotes) return {};

  const deletedNotes = mergeById(
    remoteEvent?.deletedNotes,
    localEvent?.deletedNotes,
    chooseNewerDeletion
  ).sort((first, second) => compareNewestFirst(first, second, "deletedAt"));
  const deletedNoteIds = new Set(deletedNotes.map((item) => item.id));
  const notes = mergeById(
    remoteEvent?.notes,
    localEvent?.notes,
    chooseNewerNote
  )
    .filter((note) => !deletedNoteIds.has(note.id))
    .sort((first, second) => compareNewestFirst(first, second, "updatedAt"));

  return { notes, deletedNotes };
}

// Canonical boundaries preserve committed deletions and advance a winning edit
// beyond an equal committed clock. Peer/offline merges must stay deterministic
// without assuming that either peer has committed its changes.
export function mergeCanonicalEventNotes(canonicalEvent, localEvent) {
  const merged = mergeEventNotes(canonicalEvent, localEvent);
  if (!merged.notes) return merged;
  const committed = new Map(
    (canonicalEvent?.deletedNotes ?? []).map((deletion) => [deletion.id, deletion])
  );
  const currentNotes = new Map(
    (canonicalEvent?.notes ?? []).map((note) => [note.id, note])
  );
  return {
    ...merged,
    notes: merged.notes.map((note) => {
      const currentNote = currentNotes.get(note.id);
      const committedTime = parsedTimestamp(currentNote?.updatedAt);
      if (!Number.isFinite(committedTime) || parsedTimestamp(note.updatedAt) !== committedTime) {
        return note;
      }
      // An omitted false pin and equivalent timestamp spellings are not edits.
      const revisionKey = (value) => stableItemKey({
        ...value, pinned: value.pinned === true, updatedAt: currentNote.updatedAt
      });
      if (revisionKey(note) === revisionKey(currentNote)) return clone(currentNote);
      // The deterministic merge already selected this different revision.
      // Publishing it requires a strict successor clock, not the equal clock
      // that the authorization guard correctly rejects as a stale rewrite.
      return { ...note, updatedAt: monotonicTimestamp(note.updatedAt, currentNote.updatedAt) };
    }).sort((first, second) => compareNewestFirst(first, second, "updatedAt")),
    deletedNotes: merged.deletedNotes
      .map((deletion) => {
        if (committed.has(deletion.id)) return clone(committed.get(deletion.id));
        const currentNote = currentNotes.get(deletion.id);
        // Delete-wins is the existing merge policy. Rebase a pending deletion
        // after an intervening edit so its clock also satisfies server guards.
        if (Number.isFinite(Date.parse(deletion.deletedAt)) &&
          parsedTimestamp(currentNote?.updatedAt) > parsedTimestamp(deletion.deletedAt)) {
          return { ...clone(deletion), deletedAt: currentNote.updatedAt };
        }
        return clone(deletion);
      })
      .sort((first, second) => compareNewestFirst(first, second, "deletedAt"))
  };
}

export function validateSharedStateNotes(state, label = "state") {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const knownParticipantIds = new Set(
    (Array.isArray(state.participants) ? state.participants : [])
      .map((participant) => participant?.id)
      .filter(Boolean)
  );
  const errors = [];

  for (const [eventIndex, event] of (
    Array.isArray(state.events) ? state.events : []
  ).entries()) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const eventLabel = `${label}.events[${eventIndex}]`;
    validateNoteCollection(event.notes, `${eventLabel}.notes`, {
      maxItems: MAX_EVENT_NOTES,
      knownParticipantIds,
      errors
    });
    validateDeletionCollection(event.deletedNotes, `${eventLabel}.deletedNotes`, {
      knownParticipantIds,
      errors
    });
  }

  return [...new Set(errors)];
}

function validateNoteCollection(notes, path, { maxItems, knownParticipantIds, errors }) {
  if (notes === undefined) return;
  if (!Array.isArray(notes)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (notes.length > maxItems) {
    errors.push(`${path} must contain at most ${maxItems} notes.`);
  }
  const ids = new Set();
  notes.forEach((note, index) => {
    const notePath = `${path}[${index}]`;
    if (!note || typeof note !== "object" || Array.isArray(note)) {
      errors.push(`${notePath} must be an object.`);
      return;
    }
    if (note.id && ids.has(note.id)) errors.push(`${path} must use unique ids.`);
    if (note.id) ids.add(note.id);
    if (typeof note.title !== "string" || note.title.length > MAX_EVENT_NOTE_TITLE_LENGTH) {
      errors.push(
        `${notePath}.title must be a string of at most ${MAX_EVENT_NOTE_TITLE_LENGTH} characters.`
      );
    }
    if (typeof note.body !== "string" || note.body.length > MAX_EVENT_NOTE_BODY_LENGTH) {
      errors.push(
        `${notePath}.body must be a string of at most ${MAX_EVENT_NOTE_BODY_LENGTH} characters.`
      );
    }
    if (!String(note.title ?? "").trim() && !String(note.body ?? "").trim()) {
      errors.push(`${notePath} must contain a title or body.`);
    }
    if (note.pinned !== undefined && typeof note.pinned !== "boolean") {
      errors.push(`${notePath}.pinned must be a boolean when provided.`);
    }
    validateTimestamp(note.createdAt, `${notePath}.createdAt`, errors);
    validateTimestamp(note.updatedAt, `${notePath}.updatedAt`, errors);
    validateKnownParticipant(
      note.createdByParticipantId,
      `${notePath}.createdByParticipantId`,
      knownParticipantIds,
      errors
    );
    validateKnownParticipant(
      note.updatedByParticipantId,
      `${notePath}.updatedByParticipantId`,
      knownParticipantIds,
      errors
    );
  });
}

function validateDeletionCollection(deletions, path, { knownParticipantIds, errors }) {
  if (deletions === undefined) return;
  if (!Array.isArray(deletions)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  // Never truncate tombstones: without a server compaction watermark, doing
  // so can resurrect old notes. The database's snapshot byte limit still
  // bounds storage; a history count is not a safe garbage-collection rule.
  const ids = new Set();
  deletions.forEach((deletion, index) => {
    const deletionPath = `${path}[${index}]`;
    if (!deletion || typeof deletion !== "object" || Array.isArray(deletion)) {
      errors.push(`${deletionPath} must be an object.`);
      return;
    }
    if (deletion.id && ids.has(deletion.id)) {
      errors.push(`${path} must use unique ids.`);
    }
    if (deletion.id) ids.add(deletion.id);
    validateTimestamp(deletion.deletedAt, `${deletionPath}.deletedAt`, errors);
    validateKnownParticipant(
      deletion.deletedByParticipantId,
      `${deletionPath}.deletedByParticipantId`,
      knownParticipantIds,
      errors
    );
  });
}

function validateTimestamp(value, path, errors) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    errors.push(`${path} must be an ISO timestamp.`);
  }
}

function validateKnownParticipant(value, path, knownParticipantIds, errors) {
  if (!value || !knownParticipantIds.has(value)) {
    errors.push(`${path} must reference a known participant.`);
  }
}

function mergeById(remoteItems, localItems, mergeItem) {
  const merged = new Map();
  for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
    if (item?.id && !merged.has(item.id)) merged.set(item.id, clone(item));
  }
  for (const item of Array.isArray(localItems) ? localItems : []) {
    if (!item?.id) continue;
    const current = merged.get(item.id);
    merged.set(item.id, current ? mergeItem(current, item) : clone(item));
  }
  return [...merged.values()];
}

function chooseNewerNote(remoteNote, localNote) {
  return chooseByTimestampAndContent(remoteNote, localNote, "updatedAt");
}

function chooseNewerDeletion(remoteDeletion, localDeletion) {
  return chooseByTimestampAndContent(remoteDeletion, localDeletion, "deletedAt");
}

function chooseByTimestampAndContent(remoteItem, localItem, timestampField) {
  const remoteTime = parsedTimestamp(remoteItem?.[timestampField]);
  const localTime = parsedTimestamp(localItem?.[timestampField]);
  if (remoteTime !== localTime) {
    return clone(remoteTime > localTime ? remoteItem : localItem);
  }
  return clone(stableItemKey(remoteItem) > stableItemKey(localItem) ? remoteItem : localItem);
}

function compareNewestFirst(first, second, timestampField) {
  const timeDifference =
    parsedTimestamp(second?.[timestampField]) -
    parsedTimestamp(first?.[timestampField]);
  return timeDifference || String(first?.id ?? "").localeCompare(String(second?.id ?? ""));
}

function parsedTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function stableItemKey(item) {
  return [
    item?.id,
    item?.title,
    item?.body,
    item?.pinned,
    item?.createdAt,
    item?.updatedAt,
    item?.createdByParticipantId,
    item?.updatedByParticipantId,
    item?.deletedAt,
    item?.deletedByParticipantId
  ]
    .map((value) => String(value ?? ""))
    .join("\u0000");
}

function normalizeNoteContent({ title, body }) {
  const normalizedTitle = String(title ?? "").trim();
  const normalizedBody = String(body ?? "").trim();
  if (
    (!normalizedTitle && !normalizedBody) ||
    normalizedTitle.length > MAX_EVENT_NOTE_TITLE_LENGTH ||
    normalizedBody.length > MAX_EVENT_NOTE_BODY_LENGTH
  ) {
    return null;
  }
  return { title: normalizedTitle, body: normalizedBody };
}

function normalizeTimestamp(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

function monotonicTimestamp(value, previousValue) {
  const requestedTime = Date.parse(value);
  const previousTime = Date.parse(previousValue);
  const normalizedRequested = Number.isFinite(requestedTime) ? requestedTime : Date.now();
  const nextTime = Number.isFinite(previousTime)
    ? Math.max(normalizedRequested, previousTime + 1)
    : normalizedRequested;
  return new Date(nextTime).toISOString();
}

function replaceEvent(state, eventId, nextEvent) {
  return {
    ...state,
    events: state.events.map((event) => (event.id === eventId ? nextEvent : event))
  };
}

function isSafeNoteId(value) {
  return typeof value === "string" && SAFE_NOTE_ID_PATTERN.test(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
