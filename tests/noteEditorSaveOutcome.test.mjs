import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as eventNotes from "../src/domain/eventNotes.mjs";
const { addEventNote, updateEventNote, removeEventNote } = eventNotes;
import { mergeSharedEventWriteState } from "../src/data/sharedEventStore.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function saveEventNoteFromDialog(");
const end = source.indexOf("\nfunction requestEventNoteDeletion(", start);
const saveSource = source.slice(start, end);
const deleteStart = source.indexOf("async function deleteEventNote(");
const deleteSource = source.slice(deleteStart, source.indexOf("\nfunction requestEventLeave(", deleteStart));
const saveGuardsStart = source.indexOf("function stateSaveIsCurrent(");
const saveGuards = source.slice(saveGuardsStart, source.indexOf("\nfunction recordEventActivity(", saveGuardsStart));

function initialState() {
  return addEventNote({
    currentParticipantId: "account-member",
    participants: [
      { id: "account-owner", displayName: "Owner" },
      { id: "account-member", displayName: "Member" }
    ],
    groups: [],
    events: [{
      id: "event-editor", name: "Editor", participantIds: ["account-owner", "account-member"],
      adminIds: ["account-owner"], adminsCanEditOnly: false, expenses: [], transfers: []
    }]
  }, "event-editor", { id: "note-editor", title: "Original", body: "Original body", createdAt: "2026-09-01T00:00:00.000Z" });
}

function harness({ remote = null, current = null, unchanged = false, replaceStateDuringSave = false, duringSave = null, result = null, fail = false, saveIsCurrent = true } = {}) {
  const initial = initialState();
  const baseNote = structuredClone(initial.events[0].notes[0]);
  const dialog = {
    kind: "note-editor", eventId: "event-editor", noteId: "note-editor",
    titleDraft: baseNote.title, bodyDraft: unchanged ? baseNote.body : "Local draft",
    pinned: false, baseNote, error: "", saving: false
  };
  let writes = 0;
  let closed = 0;
  const context = vm.createContext({
    state: current ?? initial, eventDialog: dialog, structuredClone,
    ...eventNotes,
    mergeSharedStates, saveState: () => {}, emitOperationDeferred: () => {},
    getEvent: (id) => context.state.events.find((event) => event.id === id),
    canCurrentParticipantEdit: () => true,
    cloneNavigationValue: structuredClone,
    makeId: () => "new-note",
    render: () => {}, reactivateDialogAfterRender: () => {},
    closeDialogWithHistory: () => { closed += 1; },
    stateSaveCheckpoint: (request) => ({ request, revision: 1, participantId: context.state.currentParticipantId }),
    sharedStateSaveRevision: () => saveIsCurrent ? 1 : 2,
    completedSaveResult: (request) => Promise.resolve(request),
    persistState: async () => {
      writes += 1;
      if (fail) throw new Error("Storage failed");
      const saved = remote
        ? mergeSharedEventWriteState(remote, context.state, { storage: { account: { userId: "member" } } })
        : structuredClone(context.state);
      // A foreground read can replace the app's object while persistence still
      // owns the previous one. A save receipt must not depend on object identity.
      if (replaceStateDuringSave) context.state = structuredClone(context.state);
      else Object.assign(context.state, saved);
      duringSave?.(context);
      return result ?? { ok: true, mode: "cloud", persistedState: saved };
    }
  });
  vm.runInContext(saveGuards + saveSource, context);
  vm.runInContext(deleteSource, context);
  return { context, dialog, save: () => context.saveEventNoteFromDialog("event-editor"), delete: () => context.deleteEventNote("event-editor", "note-editor"), writes: () => writes, closed: () => closed };
}

test("a deletion discovered during persistence is not reported as a successful note edit", async () => {
  const remote = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote });
  const result = await h.save();
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(h.closed(), 0);
  assert.equal(h.context.eventDialog, h.dialog);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.equal(h.dialog.saving, false);
  assert.match(h.dialog.error, /נמחק/);
  assert.equal(h.context.state.events[0].notes.length, 0, "never roll back the canonical deletion");
});

test("note outcome uses the save receipt even if a foreground read replaced in-memory state", async () => {
  const remote = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote, replaceStateDuringSave: true });
  const result = await h.save();
  assert.equal(result.conflict, true);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.equal(h.context.state.events[0].notes.length, 0, "the discarded optimistic note must also leave the active app state");
  assert.equal(h.context.state.events[0].deletedNotes[0].id, "note-editor");
});

test("a different revision winning reconciliation leaves the unsaved draft available", async () => {
  const remote = updateEventNote(initialState(), "event-editor", "note-editor", {
    body: "Other device wins", participantId: "account-owner", updatedAt: "2099-01-01T00:00:00.000Z"
  });
  const h = harness({ remote });
  const result = await h.save();
  assert.equal(result.conflict, true);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.equal(h.context.state.events[0].notes[0].body, "Other device wins");
});

test("successful note edits close normally", async () => {
  const h = harness();
  assert.equal((await h.save()).ok, true);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.eventDialog, null);
});

test("an unseen remote title merges with the local body and is acknowledged as success", async () => {
  const remote = updateEventNote(initialState(), "event-editor", "note-editor", {
    title: "Remote title", participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote });
  assert.equal((await h.save()).ok, true);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.state.events[0].notes[0].title, "Remote title");
  assert.equal(h.context.state.events[0].notes[0].body, "Local draft");
});

test("a successful merged receipt immediately reaches an app state replaced during saving", async () => {
  const remote = updateEventNote(initialState(), "event-editor", "note-editor", {
    title: "Title from the server", participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote, replaceStateDuringSave: true });
  assert.equal((await h.save()).ok, true);
  assert.equal(h.closed(), 1);
  assert.equal(h.context.state.events[0].notes[0].title, "Title from the server");
  assert.equal(h.context.state.events[0].notes[0].body, "Local draft");
});

test("durably queued offline notes do not pretend to have a cloud acknowledgement", async () => {
  const h = harness({ result: { ok: true, mode: "queued", pending: true } });
  const result = await h.save();
  assert.equal(result.pending, true);
  assert.equal(h.closed(), 1);
});

test("unexpected persistence failures preserve the editable draft", async () => {
  const h = harness({ fail: true });
  assert.equal((await h.save()).ok, false);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.saving, false);
  assert.equal(h.dialog.bodyDraft, "Local draft");
});

test("a failed note in a partially successful batch keeps its draft without claiming a receipt", async () => {
  const h = harness({ result: {
    ok: true, mode: "queued", pending: true, partial: true, failedEventIds: ["event-editor"]
  } });
  const result = await h.save();
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.saving, false);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.match(h.dialog.error, /אישור/);
});

test("a sibling failure does not turn a successful note into a failed note", async () => {
  const h = harness({ result: {
    ok: true, mode: "queued", pending: true, partial: true, failedEventIds: ["different-event"]
  } });
  assert.equal((await h.save()).pending, true);
  assert.equal(h.closed(), 1);
});

test("an unconfirmed note deletion preserves pending intent and healthy sibling progress", async () => {
  const h = harness({
    result: { ok: true, mode: "queued", pending: true, partial: true, failedEventIds: ["event-editor"] },
    duringSave(context) { context.state.events.push({ id: "healthy", notes: [{ id: "confirmed-sibling-note" }] }); }
  });
  const result = await h.delete();
  assert.equal(result.ok, false);
  assert.equal(result.pending, true);
  assert.equal(h.context.state.events[0].notes.length, 0);
  assert.equal(h.context.state.events[0].deletedNotes[0].id, "note-editor");
  assert.equal(h.context.state.events[1].notes[0].id, "confirmed-sibling-note");
  assert.equal(h.context.eventDialog.bodyDraft, "Local draft");
  assert.equal(h.context.eventDialog.saving, false);
  assert.match(h.context.eventDialog.error, /אישור/);
});

test("a late partial deletion cannot restore the previous account's note dialog", async () => {
  const replacement = { currentParticipantId: "account-other", events: [], participants: [], groups: [] };
  const newDialog = { kind: "unrelated-dialog" };
  const h = harness({
    result: { ok: true, mode: "queued", pending: true, partial: true, failedEventIds: ["event-editor"] },
    saveIsCurrent: false,
    duringSave(context) { context.state = replacement; context.eventDialog = newDialog; }
  });
  await h.delete();
  assert.equal(h.context.state, replacement);
  assert.equal(h.context.eventDialog, newDialog);
});

test("a successful late deletion cannot close another account's dialog", async () => {
  const replacement = { currentParticipantId: "account-other", events: [], participants: [], groups: [] };
  const nextDialog = { kind: "note-editor", eventId: "other", bodyDraft: "New account draft" };
  const h = harness({ duringSave(context) { context.state = replacement; context.eventDialog = nextDialog; } });
  await h.delete();
  assert.equal(h.context.state, replacement);
  assert.equal(h.context.eventDialog, nextDialog);
});

test("a successful late deletion cannot close a different editor in the same account", async () => {
  const nextDialog = { kind: "note-editor", eventId: "event-editor", noteId: "another-note", bodyDraft: "Keep me" };
  const h = harness({ duringSave(context) { context.eventDialog = nextDialog; } });
  await h.delete();
  assert.equal(h.context.eventDialog, nextDialog);
});

test("an unexpected deletion failure restores the note and leaves a retry message", async () => {
  const h = harness({ fail: true });
  const result = await h.delete();
  assert.equal(result.ok, false);
  assert.equal(h.context.state.events[0].notes.length, 1);
  assert.match(h.context.eventDialog.error, /לא הצלחנו למחוק/);
});

test("a title-only edit preserves the remote body and pin that arrived while editing", async () => {
  const current = updateEventNote(initialState(), "event-editor", "note-editor", {
    body: "Remote body", pinned: true, participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ current, unchanged: true });
  h.dialog.titleDraft = "Local title";
  assert.equal((await h.save()).ok, true);
  const note = h.context.state.events[0].notes[0];
  assert.equal(note.title, "Local title");
  assert.equal(note.body, "Remote body");
  assert.equal(note.pinned, true);
});

test("saving an untouched stale editor never reverts a remote edit", async () => {
  const current = updateEventNote(initialState(), "event-editor", "note-editor", {
    body: "Remote body", participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ current, unchanged: true });
  const result = await h.save();
  assert.equal(result.unchanged, true);
  assert.equal(h.writes(), 0);
  assert.equal(h.context.state.events[0].notes[0].body, "Remote body");
});

test("different edits to the same field stop before writing and preserve both versions", async () => {
  const current = updateEventNote(initialState(), "event-editor", "note-editor", {
    body: "Remote body", participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ current });
  const result = await h.save();
  assert.equal(result.conflict, true);
  assert.equal(h.writes(), 0);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.equal(h.context.state.events[0].notes[0].body, "Remote body");
});

test("the same edit already present remotely is a no-op", async () => {
  const current = updateEventNote(initialState(), "event-editor", "note-editor", {
    body: "Local draft", participantId: "account-owner", updatedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ current });
  assert.equal((await h.save()).unchanged, true);
  assert.equal(h.writes(), 0);
});

test("a restored editor without an opening revision fails closed instead of guessing intent", async () => {
  const h = harness();
  delete h.dialog.baseNote;
  assert.equal((await h.save()).conflict, true);
  assert.equal(h.writes(), 0);
  assert.equal(h.dialog.bodyDraft, "Local draft");
});

test("a pin-only edit keeps remote text, and whitespace-only typing is not an edit", () => {
  const base = initialState().events[0].notes[0];
  const current = { ...base, body: "Remote body" };
  const decision = eventNotes.prepareEventNoteEdit(base, current, {
    ...base, title: `  ${base.title}  `, pinned: true
  });
  assert.deepEqual(decision, { conflict: false, patch: { pinned: true }, unchanged: false });
  assert.equal(current.body, "Remote body");
});

test("a partial canonical save also reports a dropped edit instead of treating pending as success", async () => {
  const deleted = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ result: { ok: true, mode: "queued", partial: true, pending: true, persistedState: deleted } });
  assert.equal((await h.save()).conflict, true);
  assert.equal(h.closed(), 0);
  assert.equal(h.dialog.bodyDraft, "Local draft");
});

test("the UI captures the opening note as an immutable baseline", () => {
  const open = source.slice(source.indexOf('if (action === "open-event-note")'), source.indexOf('if (action === "toggle-event-note-pin")'));
  assert.match(open, /baseNote: cloneNavigationValue\(note\)/);
});

test("receipt reconciliation preserves newer unrelated local work", async () => {
  const remote = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote, replaceStateDuringSave: true, duringSave(context) {
    context.state = addEventNote(context.state, "event-editor", { id: "newer-local-note", body: "Must remain" });
  } });
  assert.equal((await h.save()).conflict, true);
  assert.deepEqual(h.context.state.events[0].notes.map((note) => note.id), ["newer-local-note"]);
  const subsequent = mergeSharedEventWriteState(remote, h.context.state, { storage: { account: { userId: "member" } } });
  assert.equal(subsequent.events[0].notes.some((note) => note.id === "note-editor"), false);
  assert.equal(subsequent.events[0].notes[0].body, "Must remain");
});

test("a late receipt never imports the previous account into the active account", async () => {
  const remote = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const switched = { currentParticipantId: "account-other", participants: [{ id: "account-other", displayName: "Other" }], groups: [], events: [] };
  const h = harness({ remote, duringSave(context) { context.state = structuredClone(switched); context.eventDialog = null; } });
  assert.equal((await h.save()).conflict, true);
  assert.deepEqual(h.context.state, switched);
});

test("an unexpected receipt reconciliation failure cannot strand the editor in saving", async () => {
  const remote = removeEventNote(initialState(), "event-editor", "note-editor", {
    participantId: "account-owner", deletedAt: "2026-09-02T00:00:00.000Z"
  });
  const h = harness({ remote, replaceStateDuringSave: true });
  h.context.mergeSharedStates = () => { throw new Error("Unexpected reconciliation failure"); };
  assert.equal((await h.save()).conflict, true);
  assert.equal(h.dialog.saving, false);
  assert.match(h.dialog.error, /נמחק/);
  assert.equal(h.dialog.bodyDraft, "Local draft");
  assert.equal(h.closed(), 0);
});
