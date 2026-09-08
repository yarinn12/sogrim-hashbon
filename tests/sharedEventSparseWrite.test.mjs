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

test("member retry cannot turn an unchanged membership into a global clock settings edit", () => {
  const local = structuredClone(remote);
  local.events[0].membershipUpdatedAt = "2026-09-07T10:00:00.000Z";
  for (let retry = 0; retry < 3; retry++) {
    const merged = mergeSharedEventWriteState(remote, local, config);
    assert.deepEqual(protectedFields(merged.events[0]), protectedFields(remote.events[0]));
    local.events = merged.events;
  }
});

test("member clock normalization preserves a missing canonical global clock", () => {
  const canonical = structuredClone(remote), local = structuredClone(remote);
  delete canonical.events[0].membershipUpdatedAt;
  assert.equal(Object.hasOwn(mergeSharedEventWriteState(canonical, local, config).events[0], "membershipUpdatedAt"), false);
});

test("member content saves retain canonical membership order and clock after stale roster reordering", () => {
  const canonical = structuredClone(remote);
  delete canonical.events[0].membershipUpdatedAtByParticipant;
  const local = structuredClone(canonical);
  local.events[0].participantIds.reverse();
  local.events[0].membershipUpdatedAt = "2026-09-07T10:00:00.000Z";
  for (let retry = 0; retry < 3; retry++) {
    const merged = mergeSharedEventWriteState(canonical, local, config);
    assert.deepEqual(protectedFields(merged.events[0]), protectedFields(canonical.events[0]));
    local.events = merged.events;
  }
});

test("member clock normalization does not discard actual membership intent or admin clocks", () => {
  const clock = "2026-09-07T10:00:00.000Z";
  for (const change of [
    event => { event.inactiveParticipantIds = ["account-peer"]; },
    event => { event.participantIds.push("guest-one"); },
    event => { event.membershipUpdatedAtByParticipant["account-peer"] = clock; }
  ]) {
    const local = structuredClone(remote);
    local.events[0].membershipUpdatedAt = clock;
    change(local.events[0]);
    assert.equal(mergeSharedEventWriteState(remote, local, config).events[0].membershipUpdatedAt, clock);
  }
  const local = structuredClone(remote);
  local.events[0].membershipUpdatedAt = clock;
  assert.equal(mergeSharedEventWriteState(remote, local, { storage: { account: { userId: "owner" } } }).events[0].membershipUpdatedAt, clock);
});
