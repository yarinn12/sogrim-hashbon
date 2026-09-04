import test from "node:test";
import assert from "node:assert/strict";
import { mergeSharedEventWriteState } from "../src/data/sharedEventStore.mjs";

const config = { storage: { account: { userId: "peer" } } };
const joinedAt = "2026-09-04T10:00:00.000Z";
const remote = {
  currentParticipantId: "", groups: [], deletedParticipants: [],
  participants: [{ id: "account-owner", displayName: "Owner" }, { id: "account-peer", displayName: "Peer" }],
  events: [{ id: "sparse-event", name: "Shared event", participantIds: ["account-owner", "account-peer"],
    adminIds: ["account-owner"], createdByParticipantId: "account-owner",
    membershipUpdatedAt: joinedAt, membershipUpdatedAtByParticipant: { "account-peer": joinedAt },
    expenses: [], transfers: [], notes: [], deletedNotes: [] }]
};
const contentFields = new Set(["updatedAt", "expenses", "deletedExpenses", "transfers", "transferStatusUpdates", "activityLog", "notes", "deletedNotes"]);
const protectedFields = event => Object.fromEntries(Object.entries(event).filter(([key]) => !contentFields.has(key)));

test("post-invite member save does not materialize absent protected event defaults", () => {
  const merged = mergeSharedEventWriteState(remote, structuredClone(remote), config);
  assert.deepEqual(protectedFields(merged.events[0]), protectedFields(remote.events[0]));
});

test("already hydrated defaults do not become settings edits on the next write or retry", () => {
  const local = structuredClone(remote);
  Object.assign(local.events[0], { inactiveParticipantIds: [], participantAliases: {}, distinctParticipantPairs: [], locked: false, closedAt: null });
  for (let retry = 0; retry < 3; retry++) {
    const merged = mergeSharedEventWriteState(remote, local, config);
    assert.deepEqual(protectedFields(merged.events[0]), protectedFields(remote.events[0]));
    local.events = merged.events;
  }
});

test("canonical explicit empty defaults retain their exact representation", () => {
  const explicit = structuredClone(remote);
  Object.assign(explicit.events[0], { inactiveParticipantIds: [], participantAliases: {}, distinctParticipantPairs: [], locked: false, closedAt: null });
  const merged = mergeSharedEventWriteState(explicit, remote, config);
  assert.deepEqual(protectedFields(merged.events[0]), protectedFields(explicit.events[0]));
});

test("sparse write normalization preserves real edits for server authorization", () => {
  const local = structuredClone(remote);
  Object.assign(local.events[0], { name: "Renamed", inactiveParticipantIds: ["account-peer"],
    membershipUpdatedAtByParticipant: { "account-peer": "2026-09-04T10:01:00.000Z" },
    participantAliases: { guest: "account-owner" }, distinctParticipantPairs: ["account-owner|account-peer"],
    locked: true, closedAt: "2026-09-04T10:01:00.000Z" });
  const merged = mergeSharedEventWriteState(remote, local, config).events[0];
  for (const field of ["name", "inactiveParticipantIds", "participantAliases", "distinctParticipantPairs", "locked", "closedAt"])
    assert.deepEqual(merged[field], local.events[0][field]);
});

test("member content and own profile changes survive sparse event normalization", () => {
  const local = structuredClone(remote);
  local.participants[1] = { ...local.participants[1], displayName: "Updated Peer", profileUpdatedAt: joinedAt };
  local.events[0].expenses = [{ id: "expense-one", createdByParticipantId: "account-peer", total: 100, payers: [{ participantId: "account-peer", amount: 100 }], sharedByParticipantIds: ["account-peer"] }];
  const merged = mergeSharedEventWriteState(remote, local, config);
  assert.equal(merged.participants[1].displayName, "Updated Peer");
  assert.deepEqual(merged.events[0].expenses, local.events[0].expenses);
  assert.deepEqual(protectedFields(merged.events[0]), protectedFields(remote.events[0]));
});
