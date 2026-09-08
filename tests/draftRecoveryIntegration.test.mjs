import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as notes from "../src/domain/noteDraftMemory.mjs";
import * as expenses from "../src/domain/expenseDraftMemory.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function rememberEventNoteDraft()"), source.indexOf("function todayInputValue()"));

function setup() {
  const values = new Map();
  const event = { id: "event-1", notes: [{ id: "note-1", title: "Original", body: "Original", pinned: false }] };
  const context = vm.createContext({ ...notes, ...expenses, state: { currentParticipantId: "owner" },
    eventDialog: null, expenseDraft: null, allowed: true,
    getEvent: () => event, canCurrentParticipantEdit: () => context.allowed,
    activeEventParticipants: () => [{ id: "owner" }],
    window: { localStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
  });
  vm.runInContext(helpers, context);
  const draft = { kind: "note-editor", eventId: event.id, noteId: "", titleDraft: "Draft", bodyDraft: "Unsaved", pinned: false };
  return { context, values, event, draft };
}

test("opening and clearing an existing note never removes a separate new-note draft", () => {
  const { context, event, draft } = setup();
  context.eventDialog = draft;
  context.rememberEventNoteDraft();
  context.eventDialog = { ...draft, draftMemoryNoteId: undefined, noteId: "note-1", baseNote: event.notes[0], bodyDraft: "Edited" };
  context.rememberEventNoteDraft();
  context.clearRememberedEventNoteDraft(context.eventDialog);
  assert.equal(context.restoreEventNoteDraft(event).bodyDraft, "Unsaved");
  assert.equal(context.restoreEventNoteDraft(event, "note-1"), null);
});

test("a partial new-note receipt moves recovery to the same published ID without duplication", () => {
  const { context, event, draft, values } = setup();
  context.eventDialog = draft;
  context.rememberEventNoteDraft();
  Object.assign(draft, { noteId: "note-1", baseNote: event.notes[0], pendingNoteSave: true, pendingNoteFields: ["body"] });
  context.rememberEventNoteDraft();
  assert.equal(context.restoreEventNoteDraft(event), null);
  const restored = context.restoreEventNoteDraft(event, "note-1");
  assert.equal(restored.bodyDraft, "Unsaved");
  assert.equal(restored.pendingNoteSave, true);
  context.clearRememberedEventNoteDraft(draft);
  assert.equal(values.size, 0);
});

test("note recovery respects changed account, permission and remote deletion", () => {
  const { context, event, draft } = setup();
  context.eventDialog = { ...draft, noteId: "note-1", baseNote: event.notes[0] };
  context.rememberEventNoteDraft();
  context.state.currentParticipantId = "other";
  assert.equal(context.restoreEventNoteDraft(event, "note-1"), null);
  context.state.currentParticipantId = "owner";
  context.allowed = false;
  assert.equal(context.restoreEventNoteDraft(event, "note-1"), null);
  context.allowed = true;
  event.notes = [];
  assert.equal(context.restoreEventNoteDraft(event, "note-1"), null);
});

test("unavailable draft storage cannot crash note entry, recovery or a successful save", () => {
  const { context, event, draft } = setup();
  context.eventDialog = draft;
  context.window.localStorage = new Proxy({}, { get() { throw new Error("Quota exceeded"); } });
  assert.doesNotThrow(() => context.rememberEventNoteDraft());
  assert.equal(context.restoreEventNoteDraft(event), null);
  assert.doesNotThrow(() => context.clearRememberedEventNoteDraft(draft));
  assert.equal(context.eventDialog.bodyDraft, "Unsaved");
});

test("expense recovery keys migrate on an unconfirmed create and are removed after retry", () => {
  const { context, event, values } = setup();
  context.expenseDraft = { eventId: event.id, name: "Draft expense", total: "12", payers: [{ participantId: "owner", amount: "12" }] };
  context.rememberExpenseDraft();
  context.expenseDraft.id = "expense-1";
  context.rememberExpenseDraft();
  assert.equal(context.restoreExpenseDraft(event), null);
  assert.equal(context.restoreExpenseDraft(event, "expense-1").name, "Draft expense");
  context.clearRememberedExpenseDraft(event.id, "expense-1");
  assert.equal(values.size, 0);
});
