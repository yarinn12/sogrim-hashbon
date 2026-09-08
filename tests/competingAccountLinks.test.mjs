import test from "node:test";
import assert from "node:assert/strict";
import { linkParticipantAccountInEvent } from "../src/domain/appActions.mjs";
import { buildSharedEventState, mergeSharedEventIntoState, mergeSharedEventWriteState } from "../src/data/sharedEventStore.mjs";
import { accountLinkIsConfirmed } from "../src/data/pendingAccountLinks.mjs";
import { isRetryablePendingSyncFailure } from "../src/data/localStore.mjs";
import { reconcileSettlementTransfers } from "../src/domain/settlement.mjs";

const owner = "account-00000000-0000-4000-8000-000000000081";
const target = "account-00000000-0000-4000-8000-000000000082";
const another = "account-00000000-0000-4000-8000-000000000083";
const guest = "guest-first", secondGuest = "guest-second";
const credentials = { id: "competing-link-space", key: "competing_link_synthetic_key_0001" };
const config = { storage: { account: { userId: owner.slice(8) } } };

function fixture() {
  return {
    currentParticipantId: owner, groups: [], deletedParticipants: [],
    participants: [owner, target, another, guest, secondGuest].map(id => ({
      id, displayName: id, kind: id.startsWith("account-") ? "user" : "guest",
      accountLinked: id.startsWith("account-")
    })),
    events: ["first-group", "another-group"].map(id => ({
      id, name: id, participantIds: [owner, target, another, guest, secondGuest],
      adminIds: [owner], createdByParticipantId: owner,
      sharedSpaceId: id === "first-group" ? credentials.id : "another-space",
      sharedSpaceKey: credentials.key,
      expenses: [guest, secondGuest].map((payer, index) => ({
        id: `expense-${index}`, name: "Taxi", total: 6000,
        payers: [{ participantId: payer, amount: 6000 }],
        sharedByParticipantIds: [owner, payer], createdByParticipantId: owner
      })), transfers: [], notes: [], activityLog: []
    }))
  };
}

test("canonical hydration refuses conflicting link receipts without mutating either replica", () => {
  const initial = fixture();
  const remote = buildSharedEventState(linkParticipantAccountInEvent(initial, "first-group", guest, target), "first-group");
  const local = linkParticipantAccountInEvent(initial, "first-group", guest, another);
  const before = structuredClone({ local, remote });
  assert.throws(() => mergeSharedEventIntoState(local, remote, credentials), error => {
    assert.equal(error.code, "SHARED_EVENT_ACCOUNT_LINK_CONFLICT");
    assert.equal(error.status, 409);
    assert.equal(isRetryablePendingSyncFailure(error), false, "a different identity decision needs review, not endless retries");
    return true;
  });
  assert.deepEqual({ local, remote }, before);
});

test("a repeated identical link with a different attempt timestamp is still acknowledged", () => {
  const initial = fixture();
  const remote = buildSharedEventState(linkParticipantAccountInEvent(initial, "first-group", guest, target), "first-group");
  const local = linkParticipantAccountInEvent(initial, "first-group", guest, target);
  local.events[0].participantAccountLinks[0].linkedAt = "2026-08-01T00:00:00.000Z";
  const result = mergeSharedEventWriteState(remote, buildSharedEventState(local, "first-group"), config);
  assert.equal(accountLinkIsConfirmed(result, { eventId: "first-group", sourceParticipantId: guest, targetParticipantId: target }), true);
  assert.deepEqual(result.events[0].participantAccountLinks, remote.events[0].participantAccountLinks);
  assert.equal(result.events[0].expenses[0].payers[0].participantId, target);
});

test("the same guest can be linked differently in separate groups without cross-group remapping", () => {
  const initial = fixture();
  const remote = buildSharedEventState(linkParticipantAccountInEvent(initial, "first-group", guest, target), "first-group");
  const local = linkParticipantAccountInEvent(initial, "another-group", guest, another);
  // Hydration also calculates missing pending plans. Start the unrelated group
  // with its valid plan so this assertion isolates cross-group identity edits.
  local.events[1].transfers = reconcileSettlementTransfers(
    local.participants.filter(participant => local.events[1].participantIds.includes(participant.id)),
    local.events[1].expenses, []
  ).transfers;
  const otherBefore = structuredClone(local.events[1]);
  const result = mergeSharedEventIntoState(local, remote, credentials);
  assert.equal(result.events[0].expenses[0].payers[0].participantId, target);
  assert.deepEqual(result.events[1], otherBefore);
  assert.equal(result.events[1].expenses[0].payers[0].participantId, another);
});

test("simultaneous links of different guests retain both decisions and expense totals", () => {
  const initial = fixture();
  const remote = buildSharedEventState(linkParticipantAccountInEvent(initial, "first-group", guest, target), "first-group");
  const local = linkParticipantAccountInEvent(initial, "first-group", secondGuest, another);
  const result = mergeSharedEventWriteState(remote, buildSharedEventState(local, "first-group"), config);
  for (const [sourceParticipantId, targetParticipantId] of [[guest, target], [secondGuest, another]]) {
    assert.equal(accountLinkIsConfirmed(result, { eventId: "first-group", sourceParticipantId, targetParticipantId }), true);
  }
  assert.deepEqual(result.events[0].expenses.map(expense => expense.payers[0].participantId), [target, another]);
  assert.equal(result.events[0].expenses.reduce((sum, expense) => sum + expense.total, 0), 12000);
});

test("a deliberate expense edit after the same committed link is not mistaken for a competing link", () => {
  const linked = linkParticipantAccountInEvent(fixture(), "first-group", guest, target);
  const remote = buildSharedEventState(linked, "first-group");
  const local = structuredClone(remote);
  local.events[0].expenses[0].payers = [{ participantId: another, amount: 6000 }];
  local.events[0].expenses[0].updatedAt = new Date(Date.now() + 1000).toISOString();
  const result = mergeSharedEventWriteState(remote, local, config);
  assert.equal(result.events[0].expenses[0].payers[0].participantId, another);
  assert.deepEqual(result.events[0].participantAccountLinks, remote.events[0].participantAccountLinks);
});
