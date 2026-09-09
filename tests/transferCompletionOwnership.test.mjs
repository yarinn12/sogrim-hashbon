import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { updateTransferStatus, rollbackTransferStatusChanges } from "../src/domain/appActions.mjs";
import { saveFailureMessage } from "../src/domain/userNoticePolicy.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function extract(name, optional = false) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  if (optional && start === undefined) return "";
  assert.notEqual(start, undefined, name);
  const end = /\n(?:async )?function /.exec(source.slice(start + 1));
  return source.slice(start, end ? start + 1 + end.index : undefined);
}
const clone = value => JSON.parse(JSON.stringify(value));
function harness(status = "pending", count = 1) {
  const writes = [], renders = [], dialogs = [];
  let activity = 0;
  const context = vm.createContext({
    state: { currentParticipantId: "account-a", events: [{ id: "event-a", activityLog: [],
      transfers: Array.from({length: count}, (_, i) => ({id: `transfer-${i}`, amount: 5000,
        fromParticipantId: "account-b", toParticipantId: "account-a", status,
        statusUpdatedAt: "2026-09-01T00:00:00.000Z",
        ...(status === "paid" ? {markedPaidAt: "2026-09-01T00:00:00.000Z", markedPaidByParticipantId: "account-a"} : {})})) }] },
    session: { user: { id: "a" } }, generation: 0,
    window: { localStorage: {} }, loadStoredAccountSession: () => context.session,
    versionedReadCacheSessionGeneration: () => context.generation,
    screen: {name: "settlement", eventId: "event-a"}, notice: "", settlementCelebration: null,
    transferStatusRequestVersions: new Map(), updateTransferStatus, rollbackTransferStatusChanges,
    saveFailureMessage, cloneNavigationValue: structuredClone,
    getEvent: id => context.state.events.find(event => event.id === id),
    canCurrentParticipantUpdateTransfer: () => true,
    recordEventActivity: (_id, kind, details, occurredAt) => {
      const id = `activity-${++activity}`;
      context.state.events[0].activityLog.push({id, kind, ...details, occurredAt});
      return id;
    },
    persistState: options => {
      // Capture the actual final payload sent by the UI, including compensating writes.
      const write = {state: clone(context.state), options}; writes.push(write);
      if (options.suppressRevertNotice) {write.receipt = {ok: true}; return Promise.resolve(write.receipt);}
      return new Promise(resolve => {write.resolve = result => {write.receipt = result; resolve(result);};});
    },
    render: () => renders.push(context.notice), activateDialog: selector => dialogs.push(selector),
    syncSettlementCloseConfirmation() {}, reconcileEventTransfers() {}, publishReferralActivityAfterSave() {},
    emitProductMetric() {}, rememberDialogReturnFocus() {}, requestAnimationFrame() {},
    app: {querySelector: () => null}
  });
  for (const name of ["captureFriendAccountContext", "beginTransferStatusRequest", "finishTransferStatusRequest",
    "markTransferPaid", "markTransferPending", "markTransfersPending"])
    vm.runInContext(extract(name, name.endsWith("TransferStatusRequest")), context);
  return {context, writes, renders, dialogs,
    pay: (i = 0) => context.markTransferPaid(`transfer-${i}`),
    undo: (indices = [0]) => context.markTransfersPending(indices.map(i => `transfer-${i}`)),
    transfer: (i = 0) => context.state.events[0].transfers[i],
    peerStatus(status, i = 0) {
      // A separately acknowledged peer revision arriving through synchronization.
      const clock = Math.max(Date.now(), Date.parse(context.state.events[0].transfers[i].statusUpdatedAt));
      context.state = updateTransferStatus(context.state, "event-a", `transfer-${i}`, {
        status: status === "paid" ? "pending" : "paid", markedAt: new Date(clock + 1).toISOString(), participantId: "account-b"});
      context.state = updateTransferStatus(context.state, "event-a", `transfer-${i}`, {
        status, markedAt: new Date(clock + 2).toISOString(), participantId: "account-b"});
    },
    newSession() {context.generation++; context.session = {user: {id: "a"}};
      context.state = clone(context.state); context.notice = "New session message";}
  };
}

for (const target of ["paid", "pending"]) {
  test(`late rejected ${target} cannot overwrite a newer peer revision in the final persistence payload`, async () => {
    const h = harness(target === "paid" ? "pending" : "paid");
    const request = target === "paid" ? h.pay() : h.undo();
    h.peerStatus(target);
    const peer = clone(h.transfer());
    h.writes[0].resolve({ok: false}); await request;
    assert.deepEqual(clone(h.transfer()), peer);
    for (const write of h.writes.slice(1)) {
      assert.deepEqual(write.state.events[0].transfers[0], peer);
      assert.equal(write.receipt.ok, true);
    }
  });
  for (const ok of [true, false]) {
    test(`late ${target} ${ok ? "success" : "failure"} cannot enter a new session of the same account`, async () => {
      const h = harness(target === "paid" ? "pending" : "paid");
      const request = target === "paid" ? h.pay() : h.undo();
      h.newSession(); const expected = clone(h.context.state), beforeRenders = h.renders.length;
      h.writes[0].resolve({ok}); await request;
      assert.deepEqual(clone(h.context.state), expected);
      assert.equal(h.context.notice, "New session message");
      assert.equal(h.writes.length, 1);
      assert.equal(h.renders.length, beforeRenders);
      assert.equal(h.dialogs.length, 0);
    });
  }
  test(`late ${target} success cannot interrupt navigation with another screen's notice or celebration`, async () => {
    const h = harness(target === "paid" ? "pending" : "paid");
    const request = target === "paid" ? h.pay() : h.undo();
    h.context.screen = {name: "home"}; h.context.notice = "Current screen message";
    const beforeRenders = h.renders.length;
    h.writes[0].resolve({ok: true}); await request;
    assert.equal(h.context.notice, "Current screen message");
    assert.equal(h.context.settlementCelebration, null);
    assert.equal(h.dialogs.length, 0);
    assert.equal(h.renders.length, beforeRenders);
    assert.equal(h.transfer().status, target);
  });
}

test("a failed grouped undo restores only transfers without a newer individual action", async () => {
  const h = harness("paid", 2);
  const group = h.undo([0, 1]);
  const paid = h.pay(0);
  const latest = h.undo([0]);
  const expected = clone(h.transfer(0));
  h.writes[2].resolve({ok: true}); await latest;
  h.writes[1].resolve({ok: true}); await paid;
  h.writes[0].resolve({ok: false}); await group;
  assert.deepEqual(clone(h.transfer(0)), expected);
  assert.equal(h.transfer(1).status, "paid");
  const final = h.writes.at(-1);
  assert.deepEqual(final.state.events[0].transfers[0], expected);
  assert.equal(final.state.events[0].transfers[1].status, "paid");
  assert.equal(final.receipt.ok, true);
});

test("an old paid request cannot acquire a reused version after an intervening undo completes", async () => {
  const h = harness(); const first = h.pay(); const undone = h.undo();
  h.writes[1].resolve({ok: true}); await undone;
  const latest = h.pay(); const expected = clone(h.transfer());
  h.writes[0].resolve({ok: false}); await first;
  assert.deepEqual(clone(h.transfer()), expected);
  assert.equal(h.writes.length, 3);
  h.writes[2].resolve({ok: true}); await latest;
  assert.equal(h.transfer().status, "paid");
  assert.equal(h.context.transferStatusRequestVersions.size, 0);
});

test("a current rejected payment still restores its transfer and acknowledges the compensating payload", async () => {
  const h = harness(); const request = h.pay();
  h.writes[0].resolve({ok: false}); await request;
  assert.equal(h.transfer().status, "pending");
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].state.events[0].transfers[0].status, "pending");
  assert.equal(h.writes[1].receipt.ok, true);
  assert.match(h.context.notice, /לא נשמר/);
});

test("a durably queued payment remains paid and a confirmed current payment still celebrates", async () => {
  for (const result of [{ok: true}, {ok: false, pending: true}]) {
    const h = harness(); const request = h.pay();
    h.writes[0].resolve(result); await request;
    assert.equal(h.transfer().status, "paid");
    assert.equal(h.writes.length, 1);
    assert.equal(h.dialogs.length, 1);
  }
});
