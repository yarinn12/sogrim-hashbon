import { jsonValuesEqual } from "./localIdentity.mjs";

const fields = ["title", "body", "pinned"];
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clock = (note, field) => note?.fieldUpdatedAt?.[field] ?? note?.updatedAt;
const value = (note, field) => field === "pinned" ? note?.pinned === true : note?.[field];

// This is an undo of a rejected note-only request, not a merge and not a new
// edit. Keep the latest snapshot and remove only values/clocks still owned by
// that request. Return null for other mutation kinds, which retain their own
// rollback policy. Never infer ownership from the save-generation counter:
// foreground reads update durable state without incrementing it.
export function rollbackNoteOnlyStateChange(latest, previous, attempted) {
  if (!previous || !attempted || !latest ||
      !jsonValuesEqual(withoutNotes(previous), withoutNotes(attempted))) return null;
  if (latest.currentParticipantId !== previous.currentParticipantId) return latest;
  const beforeEvents = new Map((previous.events ?? []).map(event => [event.id, event]));
  const attemptedEvents = new Map((attempted.events ?? []).map(event => [event.id, event]));
  const deletedEventIds = new Set((latest.deletedEvents ?? []).map(event => event.id));
  return {
    ...latest,
    events: (latest.events ?? []).map(event => {
      const before = beforeEvents.get(event.id);
      const after = attemptedEvents.get(event.id);
      if (!before || !after || deletedEventIds.has(event.id) ||
          (jsonValuesEqual(before.notes, after.notes) && jsonValuesEqual(before.deletedNotes, after.deletedNotes))) return event;
      return rollbackEventNotes(event, before, after);
    })
  };
}

function withoutNotes(state) {
  return { ...state, events: (state.events ?? []).map(({ notes, deletedNotes, ...event }) => event) };
}

function rollbackEventNotes(latest, before, attempted) {
  const notes = new Map((latest.notes ?? []).map(note => [note.id, note]));
  const deletions = new Map((latest.deletedNotes ?? []).map(note => [note.id, note]));
  const beforeNotes = new Map((before.notes ?? []).map(note => [note.id, note]));
  const attemptedNotes = new Map((attempted.notes ?? []).map(note => [note.id, note]));
  const beforeDeletions = new Map((before.deletedNotes ?? []).map(note => [note.id, note]));
  const attemptedDeletions = new Map((attempted.deletedNotes ?? []).map(note => [note.id, note]));
  for (const id of new Set([...beforeNotes.keys(), ...attemptedNotes.keys(), ...attemptedDeletions.keys()])) {
    const oldNote = beforeNotes.get(id);
    const sentNote = attemptedNotes.get(id);
    const oldDeletion = beforeDeletions.get(id);
    const sentDeletion = attemptedDeletions.get(id);
    if (jsonValuesEqual(oldNote, sentNote) && jsonValuesEqual(oldDeletion, sentDeletion)) continue;
    // A distinct remote tombstone must never be undone. An equal tombstone
    // is our optimistic deletion and must be removed on permanent rejection.
    if (!jsonValuesEqual(deletions.get(id), sentDeletion)) continue;
    if (sentDeletion && !jsonValuesEqual(oldDeletion, sentDeletion)) {
      if (oldDeletion) deletions.set(id, copy(oldDeletion)); else deletions.delete(id);
      if (oldNote && !notes.has(id)) notes.set(id, copy(oldNote));
      continue;
    }
    const current = notes.get(id);
    if (!current || deletions.has(id)) continue;
    if (!oldNote) {
      if (jsonValuesEqual(current, sentNote)) notes.delete(id);
      continue;
    }
    if (!sentNote) continue;
    if (jsonValuesEqual(current, sentNote)) {
      notes.set(id, copy(oldNote));
      continue;
    }
    const restored = copy(current);
    let changed = false;
    for (const field of fields) {
      if (value(oldNote, field) === value(sentNote, field) && clock(oldNote, field) === clock(sentNote, field)) continue;
      if (value(current, field) !== value(sentNote, field) || clock(current, field) !== clock(sentNote, field)) continue;
      restored[field] = value(oldNote, field);
      restored.fieldUpdatedAt = { ...restored.fieldUpdatedAt, [field]: clock(oldNote, field) };
      changed = true;
    }
    if (!changed) continue;
    // A remote clear may now depend on the rejected field. An empty partial
    // undo is invalid, while retaining the attempted value could republish it
    // on the next save. Restore this note only, with its original OLD clocks:
    // subsequent reconciliation still lets every newer canonical field win.
    if (!String(restored.title ?? "").trim() && !String(restored.body ?? "").trim()) {
      notes.set(id, copy(oldNote));
      continue;
    }
    // A legacy note may not have per-field clocks. Materialize all three when
    // undoing one field, and keep the envelope consistent with the survivors.
    restored.fieldUpdatedAt = Object.fromEntries(fields.map(field => [field, clock(restored, field)]));
    if (restored.updatedAt === sentNote.updatedAt) {
      const times = [Date.parse(oldNote.updatedAt),
        ...Object.values(restored.fieldUpdatedAt).map(Date.parse)].filter(Number.isFinite);
      if (times.length) restored.updatedAt = new Date(Math.max(...times)).toISOString();
    }
    if (fields.every(field => value(restored, field) === value(oldNote, field) && clock(restored, field) === clock(oldNote, field))) {
      notes.set(id, copy(oldNote));
    } else {
      notes.set(id, restored);
    }
  }
  return {
    ...latest,
    ...(latest.notes !== undefined || notes.size ? { notes: [...notes.values()] } : {}),
    ...(latest.deletedNotes !== undefined || deletions.size ? { deletedNotes: [...deletions.values()] } : {})
  };
}
