import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_DRAFT_MAX_AGE_MS, noteDraftMemoryKey, parseNoteDraftMemory, serializeNoteDraftMemory } from "../src/domain/noteDraftMemory.mjs";
import { prepareEventNoteEdit } from "../src/domain/eventNotes.mjs";

const draft = { kind: "note-editor", eventId: "event-1", noteId: "", titleDraft: "Title", bodyDraft: "Unsaved body", pinned: true, saving: true };
const baseNote = { id: "note-1", title: "Original", body: "Original body", pinned: false };

test("note draft recovers text and pin without retaining a stuck saving state", () => {
  const restored = parseNoteDraftMemory(serializeNoteDraftMemory(draft), { eventId: "event-1" });
  assert.equal(restored.bodyDraft, draft.bodyDraft);
  assert.equal(restored.titleDraft, draft.titleDraft);
  assert.equal(restored.pinned, true);
  assert.equal(restored.saving, false);
});

test("note draft storage isolates accounts, events, new notes and existing notes", () => {
  const keys = [["a", "event-1", ""], ["b", "event-1", ""], ["a", "event-2", ""], ["a", "event-1", "note-1"], ["a", "event-1", "note-2"]]
    .map(args => noteDraftMemoryKey(...args));
  assert.equal(new Set(keys).size, keys.length);
  const raw = serializeNoteDraftMemory(draft);
  assert.equal(parseNoteDraftMemory(raw, { eventId: "event-2" }), null);
  assert.equal(parseNoteDraftMemory(raw, { eventId: "event-1", noteId: "note-1" }), null);
  assert.equal(noteDraftMemoryKey("", "event-1"), "");
});

test("note recovery rejects expired, future, malformed and oversized drafts", () => {
  const now = Date.now(), options = { eventId: "event-1", now };
  for (const raw of ["{", "null", "{}", serializeNoteDraftMemory(draft, now + 1),
    serializeNoteDraftMemory(draft, now - NOTE_DRAFT_MAX_AGE_MS - 1),
    JSON.stringify({ version: 1, savedAt: now, draft: { ...draft, bodyDraft: "x".repeat(5001) } })]) {
    assert.equal(parseNoteDraftMemory(raw, options), null);
  }
  assert.equal(serializeNoteDraftMemory({ ...draft, titleDraft: "", bodyDraft: "", pinned: false }), "");
});

test("restored edits keep their base revision and cannot overwrite a competing field", () => {
  const restored = parseNoteDraftMemory(serializeNoteDraftMemory({ ...draft, noteId: baseNote.id, baseNote }), {
    eventId: "event-1", noteId: baseNote.id
  });
  const desired = { title: restored.titleDraft, body: restored.bodyDraft, pinned: restored.pinned };
  const concurrent = { ...baseNote, body: "Remote body" };
  assert.equal(prepareEventNoteEdit(restored.baseNote, concurrent, desired).conflict, true);
  assert.equal(prepareEventNoteEdit(restored.baseNote, baseNote, desired).conflict, false);
});

test("cleared fields and unconfirmed write intent survive an edit recovery", () => {
  const restored = parseNoteDraftMemory(serializeNoteDraftMemory({ ...draft, noteId: baseNote.id, baseNote,
    titleDraft: "", bodyDraft: "", pinned: false, pendingNoteSave: true, pendingNoteFields: ["body", "unexpected"] }), {
    eventId: "event-1", noteId: baseNote.id
  });
  assert.equal(restored.bodyDraft, "");
  assert.equal(restored.pendingNoteSave, true);
  assert.deepEqual(restored.pendingNoteFields, ["body"]);
});
