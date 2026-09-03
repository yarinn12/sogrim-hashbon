import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addEventNote, updateEventNote, removeEventNote, mergeEventNotes,
  mergeCanonicalEventNotes, validateSharedStateNotes
} from "../src/domain/eventNotes.mjs";
import { mergeSharedEventWriteState } from "../src/data/sharedEventStore.mjs";

const config = { storage: { account: { userId: "member" } } };
const owner = "account-owner";
const member = "account-member";
const initialTime = "2026-09-03T08:00:00.000Z";
function stateWithHistory(count = 0) {
  return addEventNote({
    currentParticipantId: member,
    participants: [{ id: owner, displayName: "Owner" }, { id: member, displayName: "Member" }],
    groups: [],
    events: [{
      id: "event-history", name: "History", participantIds: [owner, member],
      adminIds: [owner], adminsCanEditOnly: false, locked: false,
      expenses: [], transfers: [], deletedNotes: Array.from({ length: count }, (_, index) => ({
        id: `deleted-${index}`, deletedAt: initialTime, deletedByParticipantId: member
      }))
    }]
  }, "event-history", { id: "note-live", body: "Initial", participantId: owner, createdAt: initialTime });
}

for (const count of [499, 500, 501, 1000]) {
  test(`deleting a note after ${count} historical deletions keeps every tombstone`, () => {
    const original = stateWithHistory(count);
    const removed = removeEventNote(original, "event-history", "note-live", { deletedAt: "2026-09-03T08:01:00.000Z" });
    assert.equal(removed.events[0].deletedNotes.length, count + 1);
    assert.equal(removed.events[0].notes.length, 0);
    assert.deepEqual(validateSharedStateNotes(removed), []);
    const merged = mergeSharedEventWriteState(original, removed, config);
    assert.equal(merged.events[0].deletedNotes.length, count + 1);
    assert.deepEqual(validateSharedStateNotes(merged), []);
    assert.equal(original.events[0].deletedNotes.length, count);
  });
}

test("a stale device cannot resurrect the oldest note after more than 500 deletions", () => {
  const original = stateWithHistory(501);
  const removed = removeEventNote(original, "event-history", "note-live");
  const stale = { notes: [{ ...original.events[0].notes[0], id: "deleted-500" }] };
  assert.deepEqual(mergeEventNotes(removed.events[0], stale).notes, []);
});

test("two different deletions at the historical boundary remain valid after merging", () => {
  const original = addEventNote(stateWithHistory(499), "event-history", {
    id: "note-second", body: "Second", createdAt: initialTime
  });
  const first = removeEventNote(original, "event-history", "note-live");
  const second = removeEventNote(original, "event-history", "note-second");
  const merged = mergeSharedEventWriteState(first, second, config);
  assert.equal(merged.events[0].deletedNotes.length, 501);
  assert.equal(merged.events[0].notes.length, 0);
  assert.deepEqual(validateSharedStateNotes(merged), []);
});

test("a pending deletion is rebased past an intervening canonical edit", () => {
  const original = stateWithHistory();
  const local = removeEventNote(original, "event-history", "note-live", { deletedAt: "2026-09-03T08:01:00.000Z" });
  const canonical = updateEventNote(original, "event-history", "note-live", {
    body: "An intervening edit", updatedAt: "2026-09-03T08:02:00.000Z", participantId: owner
  });
  const merged = mergeSharedEventWriteState(canonical, local, config);
  assert.equal(merged.events[0].notes.length, 0);
  assert.equal(merged.events[0].deletedNotes[0].deletedAt, canonical.events[0].notes[0].updatedAt);
  assert.equal(merged.events[0].deletedNotes[0].deletedByParticipantId, member);
  assert.equal(local.events[0].deletedNotes[0].deletedAt, "2026-09-03T08:01:00.000Z");
  assert.deepEqual(mergeCanonicalEventNotes(canonical.events[0], merged.events[0]), {
    notes: [], deletedNotes: merged.events[0].deletedNotes
  });
});

test("peer merges keep device deletion timestamps until a canonical state is known", () => {
  const original = stateWithHistory();
  const removed = removeEventNote(original, "event-history", "note-live", { deletedAt: "2026-09-03T08:01:00.000Z" });
  const edited = updateEventNote(original, "event-history", "note-live", { body: "Edit", updatedAt: "2026-09-03T08:02:00.000Z" });
  assert.equal(mergeEventNotes(edited.events[0], removed.events[0]).deletedNotes[0].deletedAt, "2026-09-03T08:01:00.000Z");
});

test("long deletion histories still reject duplicates and foreign authors", () => {
  const state = stateWithHistory(501);
  state.events[0].deletedNotes.push(state.events[0].deletedNotes[0]);
  state.events[0].deletedNotes[1].deletedByParticipantId = "outsider";
  const errors = validateSharedStateNotes(state);
  assert.ok(errors.some((error) => error.includes("unique ids")));
  assert.ok(errors.some((error) => error.includes("known participant")));
});

test("complete-history server functions ship identically in migration and fresh schema", async () => {
  const migration = await readFile("supabase/migrations/20260903223000_preserve_complete_note_history.sql", "utf8");
  const schema = await readFile("supabase/schema.sql", "utf8");
  for (const name of [
    "has_valid_shared_event_notes", "is_safe_shared_event_notes_update",
    "rebase_note_deletion_timestamp", "preserve_committed_note_deletions"
  ]) {
    const pattern = new RegExp(`create or replace function private\\.${name}\\([^]*?\\n\\$\\$;`);
    assert.ok(migration.match(pattern), name);
    assert.equal(migration.match(pattern)[0], schema.match(pattern)?.[0], name);
  }
  assert.match(migration, /jsonb_array_length\(notes_value\) > 100/);
  assert.doesNotMatch(migration, /jsonb_array_length\(deleted_notes_value\) > 500/);
  assert.match(schema, /pg_column_size\(state\) <= 8388608/);
});
