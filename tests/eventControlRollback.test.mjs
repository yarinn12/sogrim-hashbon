import test from "node:test";
import assert from "node:assert/strict";
import { rollbackEventControlStateChange as undo } from "../src/data/eventControlRollback.mjs";
import { closeEvent, reopenEvent, leaveEvent, deactivateEventParticipant, setEventParticipantAdmin } from "../src/domain/appActions.mjs";
import { appendEventActivity } from "../src/domain/eventActivityLog.mjs";
import { duplicateParticipantPairKey as participantPairKey } from "../src/domain/participantIdentity.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";
import { reconcileSettlementTransfers, settlementOptionsForEvent } from "../src/domain/settlement.mjs";

const oldTime = "2026-01-01T00:00:00.000Z", sentTime = "2026-02-01T00:00:00.000Z", remoteTime = "2026-03-01T00:00:00.000Z";
function initial() {
  return { currentParticipantId: "a", groups: [], participants: ["a", "b", "c"].map(id => ({ id, displayName: id, kind: "user" })),
    events: [{ id: "event", createdByParticipantId: "a", createdAt: oldTime, currency: "ILS",
      participantIds: ["a", "b", "c"], adminIds: ["a", "b"], locked: false, expenses: [], transfers: [], notes: [],
      membershipUpdatedAt: oldTime, participantAliases: { c: "Local C" }, distinctParticipantPairs: [participantPairKey("b", "c")] }] };
}
const mutations = [
  ["lock", state => closeEvent(state, "event", sentTime), "event-closed"],
  ["grant admin", state => setEventParticipantAdmin(state, "event", "c", true, sentTime)],
  ["remove admin", state => setEventParticipantAdmin(state, "event", "b", false, sentTime)],
  ["remove member", state => deactivateEventParticipant(state, "event", "c", sentTime), "participant-removed", "c"],
  ["keep offline member", state => deactivateEventParticipant(state, "event", "c", sentTime, { preserveOffline: true }), "participant-removed", "c"],
  ["self leave", state => leaveEvent(state, "event", "a"), "participant-left", "a"]
];
for (const [name, change, kind, subjectParticipantId] of mutations) {
  test(`${name}: undo is immutable, idempotent and retains concurrent content and activity`, () => {
    const before = initial(), attempted = change(before);
    if (kind) attempted.events[0] = appendEventActivity(attempted.events[0], { id: "failed", kind, occurredAt: sentTime,
      actorParticipantId: "a", subjectParticipantId });
    const latest = structuredClone(attempted);
    Object.assign(latest.events[0], { name: "Remote name", currency: "USD", notes: [{ id: "remote-note" }], expenses: [{ id: "remote-expense" }] });
    latest.events[0] = appendEventActivity(latest.events[0], { id: "remote", kind: "expense-created", occurredAt: remoteTime, actorParticipantId: "b" });
    const original = structuredClone(latest), result = undo(latest, before, attempted);
    assert.ok(result);
    assert.deepEqual(latest, original);
    const event = result.events[0];
    for (const field of ["participantIds", "adminIds", "distinctParticipantPairs"]) assert.deepEqual([...event[field]].sort(), [...before.events[0][field]].sort());
    assert.deepEqual(event.participantAliases, before.events[0].participantAliases);
    assert.equal(event.locked, false); assert.deepEqual(event.inactiveParticipantIds ?? [], []);
    assert.equal(event.name, "Remote name"); assert.equal(event.currency, "USD");
    assert.equal(event.notes[0].id, "remote-note"); assert.equal(event.expenses[0].id, "remote-expense");
    assert.deepEqual(event.activityLog.map(entry => entry.id), ["remote"]);
    assert.deepEqual(undo(result, before, attempted), result);
  });
}

test("a failed member removal restores only that member while a peer's newer removal remains", () => {
  const before = initial(), attempted = deactivateEventParticipant(before, "event", "c", sentTime);
  const latest = deactivateEventParticipant(attempted, "event", "b", remoteTime);
  const event = undo(latest, before, attempted).events[0];
  assert.ok(event.participantIds.includes("c")); assert.ok(!event.participantIds.includes("b"));
  assert.equal(event.membershipUpdatedAtByParticipant.c, oldTime);
  assert.equal(event.membershipUpdatedAtByParticipant.b, remoteTime);
  assert.equal(event.membershipUpdatedAt, remoteTime);
  const canonical = deactivateEventParticipant(before, "event", "c", remoteTime);
  assert.ok(!mergeSharedStates(canonical, { ...latest, events: [event] }).events[0].participantIds.includes("c"), "rollback cannot mint a newer clock and revive a canonical removal");
});

for (const control of ["membership", "admin", "status"]) {
  test(`a newer ${control} revision owns its values even if they equal the rejected values`, () => {
    const before = initial();
    const attempted = control === "membership" ? deactivateEventParticipant(before, "event", "c", sentTime)
      : control === "admin" ? setEventParticipantAdmin(before, "event", "c", true, sentTime) : closeEvent(before, "event", sentTime);
    const latest = structuredClone(attempted);
    const event = latest.events[0];
    if (control === "membership") event.membershipUpdatedAtByParticipant.c = remoteTime;
    else if (control === "admin") event.adminIdsUpdatedAt = remoteTime;
    else event.statusUpdatedAt = remoteTime;
    assert.deepEqual(undo(latest, before, attempted), latest);
  });
}

for (const field of ["expenses", "notes", "participants", "participantAliases", "activityLog"]) {
  test(`a mixed control and ${field} write cannot be silently classified`, () => {
    const before = initial(), attempted = closeEvent(before, "event", sentTime);
    if (field === "participants") attempted.participants = [...attempted.participants, { id: "other" }];
    else if (field === "participantAliases") attempted.events[0].participantAliases = { c: "Independent rename" };
    else if (field === "activityLog") attempted.events[0].activityLog = [{ id: "extra", kind: "expense-created", occurredAt: sentTime }];
    else attempted.events[0][field] = [{ id: "extra" }];
    assert.equal(undo(attempted, before, attempted), null);
  });
}

test("a closure can materialize a plan and undo it without erasing an incoming paid transfer", () => {
  const before = initial();
  before.events[0].expenses = [{ id: "expense", total: 9000, payers: [{ participantId: "a", amount: 9000 }], sharedByParticipantIds: ["a", "b", "c"] }];
  const attempted = closeEvent(before, "event", sentTime);
  attempted.events[0].transfers = reconcileSettlementTransfers(before.participants, attempted.events[0].expenses, [], settlementOptionsForEvent(attempted.events[0])).transfers;
  assert.deepEqual(undo(attempted, before, attempted).events[0].transfers, []);
  const latest = structuredClone(attempted);
  Object.assign(latest.events[0].transfers[0], { status: "paid", statusUpdatedAt: remoteTime, markedPaidAt: remoteTime });
  const result = undo(latest, before, attempted);
  assert.equal(result.events[0].locked, false);
  assert.ok(result.events[0].transfers.some(row => row.status === "paid" && row.id === latest.events[0].transfers[0].id));
  attempted.events[0].transfers[0].status = "paid";
  assert.equal(undo(attempted, before, attempted), null, "the rejected close cannot absorb a separate payment edit");
});

test("other accounts and deleted events cannot be restored by an old control rejection", () => {
  const before = initial(), attempted = closeEvent(before, "event", sentTime);
  const other = { ...attempted, currentParticipantId: "b" };
  assert.equal(undo(other, before, attempted), other);
  const deleted = { ...attempted, events: [], deletedEvents: [{ id: "event" }] };
  assert.deepEqual(undo(deleted, before, attempted), deleted);
});

test("reopening restores the closed lifecycle and its old clock without rejecting new notes", () => {
  const before = closeEvent(initial(), "event", oldTime), attempted = reopenEvent(before, "event", sentTime);
  const latest = structuredClone(attempted); latest.events[0].notes = [{ id: "incoming" }];
  const event = undo(latest, before, attempted).events[0];
  assert.equal(event.locked, true); assert.equal(event.closedAt, oldTime); assert.equal(event.statusUpdatedAt, oldTime);
  assert.equal(event.notes[0].id, "incoming");
});
