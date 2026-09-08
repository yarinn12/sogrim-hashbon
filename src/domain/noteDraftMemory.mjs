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
    pendingNoteFields: draft.pendingNoteFields
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
    return {
      kind: "note-editor", eventId, noteId,
      titleDraft: draft.titleDraft, bodyDraft: draft.bodyDraft, pinned: draft.pinned === true,
      baseNote: draft.baseNote,
      pendingNoteSave: draft.pendingNoteSave === true,
      pendingNoteFields: Array.isArray(draft.pendingNoteFields)
        ? draft.pendingNoteFields.filter(field => ["title", "body", "pinned"].includes(field)) : [],
      saving: false, error: "", restored: true
    };
  } catch {
    return null;
  }
}
