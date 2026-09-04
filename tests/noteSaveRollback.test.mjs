import test from "node:test";
import assert from "node:assert/strict";
import { rollbackNoteOnlyStateChange } from "../src/data/noteSaveRollback.mjs";
import { addEventNote, updateEventNote, removeEventNote, validateSharedStateNotes } from "../src/domain/eventNotes.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";

function base() {
  return addEventNote({ currentParticipantId: "owner", participants: [{ id: "owner" }, { id: "friend" }], groups: [],
    events: [{ id: "event", participantIds: ["owner", "friend"], adminIds: ["owner"], expenses: [], transfers: [] }] },
  "event", { id: "note", title: "Title", body: "Body", createdAt: "2026-09-01T00:00:00.000Z" });
}
const edit = (state, patch, time = "2026-09-02T00:00:00.000Z") => updateEventNote(state, "event", "note", { ...patch, updatedAt: time });
const remove = (state, participantId = "owner", deletedAt = "2026-09-02T00:00:00.000Z") =>
  removeEventNote(state, "event", "note", { participantId, deletedAt });
const rollback = (latest, before, attempted) => {
  const result = rollbackNoteOnlyStateChange(latest, before, attempted);
  assert.deepEqual(validateSharedStateNotes(result), []);
  return result;
};

test("rollback restores the rejected deletion, removes only its tombstone and preserves unrelated collections", () => {
  const before = base(), attempted = remove(before);
  const latest = structuredClone(attempted);
  latest.events[0].expenses.push({ id: "incoming-expense", total: 30 });
  latest.events[0].currency = "USD";
  latest.events[0].deletedNotes.push({ id: "other-note", deletedAt: "2026-09-03T00:00:00.000Z", deletedByParticipantId: "friend" });
  const original = structuredClone(latest);
  const result = rollback(latest, before, attempted);
  assert.deepEqual(result.events[0].notes, before.events[0].notes);
  assert.deepEqual(result.events[0].deletedNotes, [original.events[0].deletedNotes[1]]);
  assert.deepEqual(result.events[0].expenses, original.events[0].expenses);
  assert.equal(result.events[0].currency, "USD");
  assert.deepEqual(latest, original, "rollback is immutable");
  assert.deepEqual(rollback(result, before, attempted), result, "store and editor can safely apply the same undo");
});

test("a distinct remote tombstone wins over rejected deletion and edit", () => {
  const before = base();
  const remote = remove(before, "friend", "2026-09-03T00:00:00.000Z");
  for (const attempted of [remove(before), edit(before, { title: "Rejected" })]) {
    const result = rollback(remote, before, attempted);
    assert.deepEqual(result.events[0], remote.events[0]);
  }
});

test("an already restored or remotely edited note is not replaced by a failed deletion", () => {
  const before = base(), attempted = remove(before);
  for (const latest of [before, edit(before, { body: "Remote" }, "2026-09-03T00:00:00.000Z")]) {
    assert.deepEqual(rollback(latest, before, attempted).events[0], latest.events[0]);
  }
});

test("rollback of a rejected title preserves a concurrent body, pin and their clocks", () => {
  const before = base(), attempted = edit(before, { title: "Rejected" });
  const latest = edit(attempted, { body: "Remote body", pinned: true }, "2026-09-03T00:00:00.000Z");
  const note = rollback(latest, before, attempted).events[0].notes[0];
  assert.equal(note.title, "Title");
  assert.equal(note.fieldUpdatedAt.title, before.events[0].notes[0].fieldUpdatedAt.title);
  assert.equal(note.body, "Remote body");
  assert.equal(note.pinned, true);
  assert.equal(note.updatedAt, latest.events[0].notes[0].updatedAt);
  assert.equal(note.fieldUpdatedAt.body, latest.events[0].notes[0].fieldUpdatedAt.body);
});

test("a later same-field edit and an ABA return to the attempted value retain ownership", () => {
  const before = base(), attempted = edit(before, { body: "Rejected" });
  const newer = edit(attempted, { body: "Remote" }, "2026-09-03T00:00:00.000Z");
  const aba = edit(newer, { body: "Rejected" }, "2026-09-04T00:00:00.000Z");
  for (const latest of [newer, aba]) assert.deepEqual(rollback(latest, before, attempted).events[0], latest.events[0]);
});

test("the old envelope is restored when all attempted fields still belong to this request", () => {
  const before = base(), attempted = edit(before, { title: "Rejected", pinned: true });
  assert.deepEqual(rollback(attempted, before, attempted).events[0].notes, before.events[0].notes);
});

test("legacy notes without field clocks can undo one field without losing a newer independent field", () => {
  const before = base();
  delete before.events[0].notes[0].fieldUpdatedAt;
  const attempted = edit(before, { title: "Rejected" });
  const latest = edit(attempted, { body: "Remote" }, "2026-09-03T00:00:00.000Z");
  const note = rollback(latest, before, attempted).events[0].notes[0];
  assert.equal(note.title, "Title");
  assert.equal(note.body, "Remote");
  assert.equal(note.fieldUpdatedAt.title, before.events[0].notes[0].updatedAt);
});

test("rejected creation removes only the original revision and preserves a later revision", () => {
  const before = base();
  before.events[0].notes = [];
  const attempted = addEventNote(before, "event", { id: "note", body: "New", createdAt: "2026-09-02T00:00:00.000Z" });
  assert.equal(rollback(attempted, before, attempted).events[0].notes.length, 0);
  const latest = edit(attempted, { body: "Remote edit" }, "2026-09-03T00:00:00.000Z");
  assert.deepEqual(rollback(latest, before, attempted).events[0], latest.events[0]);
});

test("rollback never recreates a removed event or imports another account", () => {
  const before = base(), attempted = remove(before);
  const latest = { ...attempted, events: [] };
  assert.deepEqual(rollback(latest, before, attempted), latest);
  const anotherAccount = { ...attempted, currentParticipantId: "friend" };
  assert.equal(rollback(anotherAccount, before, attempted), anotherAccount);
});

test("mixed non-note mutations retain their existing rollback policy", () => {
  const before = base(), attempted = edit(before, { title: "Rejected" });
  attempted.events[0].currency = "USD";
  assert.equal(rollbackNoteOnlyStateChange(attempted, before, attempted), null);
});

test("a malformed legacy envelope cannot make rejection handling throw when field clocks remain valid", () => {
  const before = base();
  before.events[0].notes[0].updatedAt = "legacy-garbage";
  const attempted = edit(before, { title: "Rejected" });
  const latest = structuredClone(attempted);
  latest.events[0].notes[0].body = "Remote body";
  latest.events[0].notes[0].fieldUpdatedAt.body = "2026-09-01T12:00:00.000Z";
  const note = rollback(latest, before, attempted).events[0].notes[0];
  assert.equal(note.title, "Title");
  assert.equal(note.body, "Remote body");
});

test("undo must not turn a valid concurrently cleared note into empty invalid content", () => {
  const before = base();
  before.events[0].notes[0].title = "";
  const attempted = edit(before, { title: "New title" });
  const latest = edit(attempted, { body: "" }, "2026-09-03T00:00:00.000Z");
  const result = rollback(latest, before, attempted);
  assert.deepEqual(result.events[0].notes[0], before.events[0].notes[0], "drop all rejected values and keep original clocks");
  const canonical = edit(latest, { title: "Canonical title" }, "2026-09-04T00:00:00.000Z");
  const reconciled = mergeSharedStates(canonical, result).events[0].notes[0];
  assert.equal(reconciled.body, "", "the remote clear still wins on the next reconciliation");
  assert.equal(reconciled.title, "Canonical title", "the rejected title is never republished");
});
