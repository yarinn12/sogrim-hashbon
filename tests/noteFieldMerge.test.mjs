import test from "node:test";
import assert from "node:assert/strict";
import { addEventNote, updateEventNote, removeEventNote, mergeEventNotes, mergeCanonicalEventNotes, validateSharedStateNotes } from "../src/domain/eventNotes.mjs";
import { mergeSharedEventWriteState } from "../src/data/sharedEventStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

const time = (second) => `2026-09-04T00:00:${String(second).padStart(2, "0")}.000Z`;
const note = (state) => state.events[0].notes[0];
const event = (state) => state.events[0];
function base() {
  return addEventNote({
    currentParticipantId: "account-member", groups: [],
    participants: [{ id: "account-owner", displayName: "Owner" }, { id: "account-member", displayName: "Member" }],
    events: [{ id: "e", name: "Shared", participantIds: ["account-owner", "account-member"],
      adminIds: ["account-owner"], adminsCanEditOnly: false, expenses: [], transfers: [] }]
  }, "e", { id: "n", title: "Base title", body: "Base body", createdAt: time(0) });
}
function edit(state, patch, second, actor = "account-member") {
  return updateEventNote(state, "e", "n", { ...patch, participantId: actor, updatedAt: time(second) });
}

test("unseen edits of different note fields survive merging and offline serialization", () => {
  const original = base();
  const remote = edit(original, { title: "Remote title" }, 3, "account-owner");
  const local = JSON.parse(JSON.stringify(edit(original, { body: "Offline body" }, 2)));
  const merged = mergeEventNotes(event(remote), event(local));
  assert.equal(merged.notes[0].title, "Remote title");
  assert.equal(merged.notes[0].body, "Offline body");
  assert.deepEqual(merged, mergeEventNotes(event(local), event(remote)));
});

test("three independent edits converge in either order and replay is idempotent", () => {
  const original = base();
  const a = event(edit(original, { title: "Title" }, 1));
  const b = event(edit(original, { body: "Body" }, 2));
  const c = event(edit(original, { pinned: true }, 3));
  const left = mergeEventNotes(mergeEventNotes(a, b), c);
  const right = mergeEventNotes(a, mergeEventNotes(c, b));
  assert.equal(left.notes[0].title, "Title");
  assert.equal(left.notes[0].body, "Body");
  assert.equal(left.notes[0].pinned, true);
  assert.deepEqual(left, right);
  assert.deepEqual(mergeEventNotes(left, left), left);
});

test("canonical merge attributes a combined revision to the authenticated writer", () => {
  const original = base();
  const remote = edit(original, { title: "Remote title" }, 3, "account-owner");
  const local = edit(original, { body: "Local body" }, 2);
  const merged = mergeSharedEventWriteState(remote, local, { storage: { account: { userId: "member" } } });
  assert.equal(note(merged).title, "Remote title");
  assert.equal(note(merged).body, "Local body");
  assert.equal(note(merged).updatedByParticipantId, "account-member");
  assert.ok(Date.parse(note(merged).updatedAt) > Date.parse(note(remote).updatedAt));
  assert.deepEqual(validateSharedStateNotes(merged), []);
  assert.deepEqual(note(mergeSharedEventWriteState(merged, merged, { storage: { account: { userId: "member" } } })), note(merged));
});

test("field clocks advance only changed fields and deletion still wins", () => {
  const original = base();
  const updated = edit(original, { body: "Changed" }, 2);
  assert.deepEqual(note(updated).fieldUpdatedAt, { title: time(0), body: time(2), pinned: time(0) });
  const removed = removeEventNote(original, "e", "n", { deletedAt: time(1) });
  assert.equal(mergeEventNotes(event(updated), event(removed)).notes.length, 0);
});

test("equal field clocks converge without changing a committed winning revision", () => {
  const original = base();
  const a = edit(original, { title: "Z title" }, 2, "account-member");
  const b = edit(original, { body: "B body" }, 2, "account-owner");
  const c = edit(original, { pinned: true }, 2, "account-member");
  assert.deepEqual(mergeEventNotes(mergeEventNotes(event(a), event(b)), event(c)),
    mergeEventNotes(event(a), mergeEventNotes(event(c), event(b))));
  const loser = edit(original, { body: "A body" }, 2);
  assert.deepEqual(mergeCanonicalEventNotes(event(b), event(loser)).notes, event(b).notes);
});

test("a retry rebases independent fields again after another device writes", async () => {
  const original = base();
  const local = edit(original, { body: "Offline" }, 1);
  const remote = edit(original, { title: "Arrived during retry", pinned: true }, 3, "account-owner");
  const config = { storage: { account: { userId: "member" } } };
  let attempts = 0;
  const result = await saveCloudStateWithConflictRetry({
    state: mergeSharedEventWriteState(original, local, config),
    loadLatest: async () => remote,
    mergeStates: (latest, candidate) => mergeSharedEventWriteState(latest, candidate, config),
    retryDelay: () => 0,
    save: async () => { if (++attempts === 1) throw Object.assign(new Error("Conflict"), { code: "CLOUD_STATE_CONFLICT" }); }
  });
  assert.equal(attempts, 2);
  assert.equal(note(result.state).body, "Offline");
  assert.equal(note(result.state).title, "Arrived during retry");
  assert.equal(note(result.state).pinned, true);
});

test("upgrading a legacy note initializes untouched clocks from its old revision", () => {
  const original = base();
  delete note(original).fieldUpdatedAt;
  const a = edit(original, { title: "Title" }, 2);
  const b = edit(original, { body: "Body" }, 3);
  const merged = mergeEventNotes(event(a), event(b)).notes[0];
  assert.equal(merged.title, "Title");
  assert.equal(merged.body, "Body");
  assert.deepEqual(merged.fieldUpdatedAt, { title: time(2), body: time(3), pinned: time(0) });
});

test("a legacy whole-note revision remains compatible, without pretending to know its intent", () => {
  const original = base();
  const current = edit(original, { body: "Current body" }, 2);
  const legacy = edit(original, { title: "Legacy title" }, 3);
  delete note(legacy).fieldUpdatedAt;
  const merged = mergeEventNotes(event(current), event(legacy)).notes[0];
  assert.equal(merged.title, "Legacy title");
  assert.equal(merged.body, "Base body", "legacy clients still use whole-note replacement semantics");
});

test("new per-field validation rejects malformed, extra and out-of-envelope clocks", () => {
  for (const invalid of [null, [], {}, { title: time(0), body: time(0), pinned: time(0), extra: time(0) },
    { title: null, body: time(0), pinned: time(0) }, { title: time(1), body: time(0), pinned: time(0) },
    { title: "2026-09-03T00:00:00Z", body: time(0), pinned: time(0) },
    { title: "2026/09/04", body: time(0), pinned: time(0) }]) {
    const state = base(); note(state).fieldUpdatedAt = invalid;
    assert.ok(validateSharedStateNotes(state).some((message) => message.includes("fieldUpdatedAt")));
  }
});

test("an incompatible pair of clears never creates an invalid empty note", () => {
  const original = base();
  const a = edit(original, { title: "" }, 1);
  const b = edit(original, { body: "" }, 2);
  const merged = mergeEventNotes(event(a), event(b));
  assert.deepEqual(validateSharedStateNotes({ ...original, events: [{ ...event(original), ...merged }] }), []);
  assert.ok(merged.notes[0].title || merged.notes[0].body);
  assert.throws(() => mergeSharedEventWriteState(a, b, { storage: { account: { userId: "member" } } }),
    { code: "EVENT_NOTE_CONTENT_CONFLICT" });
});

test("field-clock merges converge across all orders of a bounded concurrent edit matrix", () => {
  const original = base();
  const versions = [event(original)];
  for (const second of [1, 2]) {
    for (const actor of ["account-owner", "account-member"]) {
      for (const patch of [{ title: `Title ${actor}` }, { body: `Body ${actor}` }, { pinned: true }]) {
        versions.push(event(edit(original, patch, second, actor)));
      }
    }
  }
  for (const a of versions) {
    assert.deepEqual(mergeEventNotes(a, a).notes, a.notes);
    for (const b of versions) {
      assert.deepEqual(mergeEventNotes(a, b), mergeEventNotes(b, a));
      for (const c of versions) {
        assert.deepEqual(mergeEventNotes(mergeEventNotes(a, b), c), mergeEventNotes(a, mergeEventNotes(b, c)));
      }
    }
  }
});
