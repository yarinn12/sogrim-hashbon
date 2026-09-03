import test from "node:test";
import assert from "node:assert/strict";
import { addEventNote, updateEventNote, mergeEventNotes, mergeCanonicalEventNotes } from "../src/domain/eventNotes.mjs";
import { mergeSharedEventWriteState, mergeSharedEventIntoState } from "../src/data/sharedEventStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

const time = "2026-09-03T08:01:00.000Z";
const credentials = { id: "space-clock-tie", key: "clock_tie_key_12345678901234567890" };
const config = { storage: { account: { userId: "member" } } };
function scenario() {
  const initial = addEventNote({
    currentParticipantId: "account-member",
    participants: [{ id: "account-owner", displayName: "Owner" }, { id: "account-member", displayName: "Member" }],
    groups: [], events: [{
      id: "event-clock", name: "Clock", participantIds: ["account-owner", "account-member"],
      adminIds: ["account-owner"], adminsCanEditOnly: false, locked: false,
      expenses: [], transfers: [], sharedSpaceId: credentials.id, sharedSpaceKey: credentials.key
    }]
  }, "event-clock", { id: "note-clock", body: "Initial", participantId: "account-owner", createdAt: "2026-09-03T08:00:00.000Z" });
  const remote = updateEventNote(initial, "event-clock", "note-clock", { body: "A remote edit", participantId: "account-owner", updatedAt: time });
  const local = updateEventNote(initial, "event-clock", "note-clock", { body: "Z local edit", updatedAt: time });
  return { initial, remote, local };
}
function assertWinningEdit(event, remote) {
  const note = event.notes.find((item) => item.id === "note-clock");
  assert.equal(note.body, "Z local edit");
  assert.equal(note.updatedAt, "2026-09-03T08:01:00.001Z");
  assert.equal(note.updatedByParticipantId, "account-member");
  assert.equal(note.createdAt, remote.notes[0].createdAt);
  assert.equal(note.createdByParticipantId, remote.notes[0].createdByParticipantId);
}

test("the winning equal-clock edit advances past the committed revision without changing authorship", () => {
  const { remote, local } = scenario();
  const before = structuredClone({ remote, local });
  assertWinningEdit(mergeCanonicalEventNotes(remote.events[0], local.events[0]), remote.events[0]);
  assert.deepEqual({ remote, local }, before);
});

test("equal-clock reconciliation runs at the shared write boundary and retains a companion note", () => {
  const { remote, local } = scenario();
  const withCompanion = addEventNote(local, "event-clock", { id: "note-companion", body: "Must save too", createdAt: time });
  const merged = mergeSharedEventWriteState(remote, withCompanion, config);
  assertWinningEdit(merged.events[0], remote.events[0]);
  assert.ok(merged.events[0].notes.some((note) => note.id === "note-companion"));
});

test("refresh converges a pending clock tie and a later acknowledgement does not advance it again", () => {
  const { remote, local } = scenario();
  const refreshed = mergeSharedEventIntoState(local, remote, credentials);
  assertWinningEdit(refreshed.events[0], remote.events[0]);
  const acknowledged = mergeSharedEventIntoState(local, refreshed, credentials);
  assert.deepEqual(acknowledged.events[0].notes, refreshed.events[0].notes);
  assert.deepEqual(mergeSharedEventWriteState(refreshed, acknowledged, config).events[0].notes, refreshed.events[0].notes);
});

test("an equal-clock edit arriving during conflict retry is still a valid advancing revision", async () => {
  const { initial, remote, local } = scenario();
  let attempts = 0;
  const result = await saveCloudStateWithConflictRetry({
    state: mergeSharedEventWriteState(initial, local, config),
    loadLatest: async () => remote,
    mergeStates: (latest, candidate) => mergeSharedEventWriteState(latest, candidate, config),
    retryDelay: () => 0,
    save: async (candidate) => {
      if (++attempts === 1) throw Object.assign(new Error("Conflict"), { code: "CLOUD_STATE_CONFLICT" });
      assertWinningEdit(candidate.events[0], remote.events[0]);
    }
  });
  assert.equal(attempts, 2);
  assertWinningEdit(result.state.events[0], remote.events[0]);
});

test("a canonical tie winner is not replaced or assigned a new clock", () => {
  const { remote, local } = scenario();
  assert.deepEqual(mergeCanonicalEventNotes(local.events[0], remote.events[0]).notes, local.events[0].notes);
});

test("identical notes are idempotent even if optional pin false was omitted", () => {
  const { remote } = scenario();
  const local = structuredClone(remote.events[0]);
  delete local.notes[0].pinned;
  assert.deepEqual(mergeCanonicalEventNotes(remote.events[0], local).notes, remote.events[0].notes);
  assert.deepEqual(mergeCanonicalEventNotes(local, remote.events[0]).notes, local.notes);
});

test("equivalent clock encodings do not manufacture a new edit", () => {
  const { remote } = scenario();
  const local = structuredClone(remote.events[0]);
  local.notes[0].updatedAt = "2026-09-03T08:01:00Z";
  assert.deepEqual(mergeCanonicalEventNotes(remote.events[0], local).notes, remote.events[0].notes);
});

test("clock advancement re-sorts notes by the resulting revision time", () => {
  const { remote, local } = scenario();
  const withCompanion = addEventNote(local, "event-clock", { id: "aaa-companion", body: "Companion", createdAt: time });
  assert.equal(mergeCanonicalEventNotes(remote.events[0], withCompanion.events[0]).notes[0].id, "note-clock");
});

test("ordinary peer merges keep deterministic tie resolution without inventing a canonical clock", () => {
  const { remote, local } = scenario();
  assert.deepEqual(mergeEventNotes(remote.events[0], local.events[0]), mergeEventNotes(local.events[0], remote.events[0]));
  assert.equal(mergeEventNotes(remote.events[0], local.events[0]).notes[0].updatedAt, time);
});

test("older and newer revisions retain the existing last-write-wins ordering", () => {
  const { remote, local } = scenario();
  local.events[0].notes[0].updatedAt = "2026-09-03T08:00:30.000Z";
  assert.deepEqual(mergeCanonicalEventNotes(remote.events[0], local.events[0]).notes, remote.events[0].notes);
  local.events[0].notes[0].updatedAt = "2026-09-03T08:02:00.000Z";
  assert.deepEqual(mergeCanonicalEventNotes(remote.events[0], local.events[0]).notes, local.events[0].notes);
});
