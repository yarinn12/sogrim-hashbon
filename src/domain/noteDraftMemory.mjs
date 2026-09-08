import { MAX_EVENT_NOTE_TITLE_LENGTH, MAX_EVENT_NOTE_BODY_LENGTH } from "./eventNotes.mjs";

export const NOTE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function noteDraftMemoryKey(participantId, eventId, noteId = "") {
  if (!participantId || !eventId) return "";
  return `settle-friends-note-draft:${JSON.stringify([participantId, eventId, noteId])}`;
}

export function serializeNoteDraftMemory(draft, savedAt = Date.now()) {
  if (draft?.kind !== "note-editor" || !draft.eventId) return "";
  const titleDraft = String(draft.titleDraft ?? "").slice(0, MAX_EVENT_NOTE_TITLE_LENGTH);
  const bodyDraft = String(draft.bodyDraft ?? "").slice(0, MAX_EVENT_NOTE_BODY_LENGTH);
  if (!draft.noteId && !titleDraft && !bodyDraft && !draft.pinned) return "";
  return JSON.stringify({ version: 1, savedAt, draft: {
    eventId: draft.eventId, noteId: draft.noteId || "", titleDraft, bodyDraft,
    pinned: draft.pinned === true,
    // Keep the original revision: replacing it with the current remote note
    // would let a restored editor silently overwrite a competing field edit.
    baseNote: draft.baseNote,
    pendingNoteSave: draft.pendingNoteSave === true,
    pendingNoteFields: draft.pendingNoteFields,
    // The request can commit before its acknowledgement reaches this page.
    // Remember its identity before sending, while leaving the live editor's
    // new-note/rollback semantics unchanged.
    pendingNoteCreation: draft.pendingNoteCreation,
    interruptedNoteEdit: draft.interruptedNoteEdit
  } });
}

export function parseNoteDraftMemory(raw, { eventId, noteId = "", now = Date.now() } = {}) {
  try {
    const payload = JSON.parse(raw);
    const draft = payload?.draft;
    if (payload?.version !== 1 || !Number.isFinite(payload.savedAt) ||
      now < payload.savedAt || now - payload.savedAt > NOTE_DRAFT_MAX_AGE_MS ||
      !eventId || draft?.eventId !== eventId || draft.noteId !== noteId ||
      typeof draft.titleDraft !== "string" || typeof draft.bodyDraft !== "string" ||
      draft.titleDraft.length > MAX_EVENT_NOTE_TITLE_LENGTH || draft.bodyDraft.length > MAX_EVENT_NOTE_BODY_LENGTH ||
      (noteId && draft.baseNote?.id !== noteId)) return null;
    const creation = draft.pendingNoteCreation;
    if (creation && (!/^[A-Za-z0-9_-]{1,128}$/.test(creation.note?.id ?? "") ||
      (noteId && creation.note.id !== noteId) ||
      typeof creation.note.title !== "string" || typeof creation.note.body !== "string" ||
      creation.note.title.length > MAX_EVENT_NOTE_TITLE_LENGTH || creation.note.body.length > MAX_EVENT_NOTE_BODY_LENGTH ||
      !Array.isArray(creation.fields))) return null;
    const edit = draft.interruptedNoteEdit;
    if (edit && (!noteId || !validEditSnapshot(edit.note, noteId) ||
      !validEditSnapshot(edit.beforeNote, noteId) || !Array.isArray(edit.fields))) return null;
    return {
      kind: "note-editor", eventId, noteId,
      titleDraft: draft.titleDraft, bodyDraft: draft.bodyDraft, pinned: draft.pinned === true,
      baseNote: draft.baseNote,
      pendingNoteSave: draft.pendingNoteSave === true,
      pendingNoteFields: Array.isArray(draft.pendingNoteFields)
        ? draft.pendingNoteFields.filter(field => ["title", "body", "pinned"].includes(field)) : [],
      ...(creation ? { pendingNoteCreation: { note: creation.note,
        fields: creation.fields.filter(field => ["title", "body", "pinned"].includes(field)) } } : {}),
      ...(edit ? { interruptedNoteEdit: { note: edit.note, beforeNote: edit.beforeNote,
        fields: edit.fields.filter(field => ["title", "body", "pinned"].includes(field)) } } : {}),
      saving: false, error: "", restored: true
    };
  } catch {
    return null;
  }
}

export function recoverNoteDraftCreation(draft, event) {
  const creation = draft?.pendingNoteCreation;
  if (!creation || draft.noteId || (!event.notes?.some(note => note.id === creation.note.id) &&
    !event.deletedNotes?.some(note => note.id === creation.note.id))) return draft;
  return { ...draft, noteId: creation.note.id, baseNote: creation.note,
    pendingNoteSave: true, pendingNoteFields: creation.fields };
}

function validEditSnapshot(note, noteId) {
  return note?.id === noteId && typeof note.title === "string" && typeof note.body === "string" &&
    note.title.length <= MAX_EVENT_NOTE_TITLE_LENGTH && note.body.length <= MAX_EVENT_NOTE_BODY_LENGTH &&
    Number.isFinite(Date.parse(note.updatedAt));
}

export function recoverInterruptedNoteEdit(draft, event) {
  const edit = draft?.interruptedNoteEdit;
  const current = event.notes?.find(note => note.id === draft?.noteId);
  if (!edit || !current) return draft;
  const baseNote = { ...draft.baseNote };
  for (const field of edit.fields) {
    const fieldTime = note => Date.parse(note.fieldUpdatedAt?.[field] ?? note.updatedAt);
    const value = note => field === "pinned" ? note.pinned === true : String(note[field] ?? "");
    // A restart can happen before the local write too. Recognize the exact
    // earlier value only when its clock precedes this attempt; a peer reverting
    // the field later is still a competing edit, not an unpublished request.
    const unpublished = fieldTime(current) < fieldTime(edit.note) && value(current) === value(edit.beforeNote);
    baseNote[field] = (unpublished ? edit.beforeNote : edit.note)[field];
  }
  return { ...draft, baseNote, pendingNoteSave: true,
    pendingNoteFields: [...new Set([...(draft.pendingNoteFields ?? []), ...edit.fields])] };
}
