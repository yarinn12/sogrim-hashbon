import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { saveFailureMessage } from "../src/domain/userNoticePolicy.mjs";
import { readFileSync } from "node:fs";
import { updateTransferStatus, rollbackTransferStatusChanges } from "../src/domain/appActions.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  const rest = source.slice(match.index + 1);
  const end = /\n(?:async )?function /.exec(rest);
  return source.slice(match.index, end ? match.index + 1 + end.index : undefined);
}
function harness() {
  const writes = [], closures = [], notices = [];
  const event = { id: "event-a", participantIds: ["account-a", "account-b"], expenses: [], transfers: [
    { id: "transfer-a", fromParticipantId: "account-b", toParticipantId: "account-a", amount: 100, status: "pending" }
  ] };
  const draft = { eventId: event.id, name: "Expense A", total: "1", payers: [{ participantId: "account-a", amount: "1" }], sharedByParticipantIds: [...event.participantIds], quickItems: [], error: "" };
  const context = vm.createContext({
    state: { currentParticipantId: "account-a", participants: [], events: [event] },
    expenseDraft: draft, expenseSaveInProgress: false, expenseSaveRequest: null, saveFailureMessage,
    screen: { name: "settlement", eventId: event.id }, notice: "", settlementCelebration: null,
    transferStatusRequestVersions: new Map(), updateTransferStatus, rollbackTransferStatusChanges,
    getEvent: id => context.state.events.find(item => item.id === id),
    canCurrentParticipantEdit: () => true, canCurrentParticipantUpdateTransfer: () => true,
    syncExpenseSaveState: () => {}, render: () => notices.push(context.notice), reactivateDialogAfterRender: () => {},
    parseMoneyInput: value => Number(value) * 100, mergePayers: value => value, validateExpense: () => [],
    makeId: () => "new-expense", todayInputValue: () => "2026-09-04", recordEventActivity: () => "activity-a",
    reconcileEventTransfers: () => {}, persistState: () => new Promise(resolve => writes.push({ resolve })),
    EXPENSE_FOREGROUND_SAVE_BUDGET_MS: 350, publishReferralActivityAfterSave: () => {},
    publishEventActivityAfterSave: () => {}, emitProductMetric: () => {}, clearRememberedExpenseDraft: () => {},
    expenseDialogRewindSteps: () => 1, closeDialogWithHistory: () => closures.push(true),
    cloneNavigationValue: structuredClone, activateDialog: () => {}, syncSettlementCloseConfirmation: () => {},
    rememberDialogReturnFocus: () => {}, requestAnimationFrame: callback => callback(), app: { querySelector: () => null },
    buildQuickItemExpenses: () => ({ expenses: [{ id: "quick-a", name: "Quick", total: 100 }] }),
    stateSaveCheckpoint: request => ({ request, participantId: context.state.currentParticipantId }),
    rejectedStateSaveIsCurrent: (_result, checkpoint) => checkpoint.participantId === context.state.currentParticipantId,
    formatCount: () => "1"
  });
  for (const name of ["saveExpense", "saveQuickExpenses", "markTransferPaid", "markTransfersPending", "applyExpenseAttachmentImage"])
    vm.runInContext(functionSource(name), context);
  return { context, writes, closures, notices, draft };
}

for (const handler of ["saveExpense", "saveQuickExpenses"]) {
  test(`${handler} duplicate submits on the same editor still produce one write`, async () => {
    const h = harness(); const first = h.context[handler]("event-a");
    await h.context[handler]("event-a");
    assert.equal(h.writes.length, 1);
    h.writes[0].resolve({ ok: true }); await first;
    assert.equal(h.context.expenseSaveInProgress, false);
  });
  for (const ok of [true, false]) {
    test(`${handler} late ${ok ? "success" : "failure"} cannot close or alter a newer expense editor`, async () => {
      const h = harness(); const request = h.context[handler]("event-a");
      const nextDraft = { name: "New draft", error: "New draft message" };
      h.context.expenseDraft = nextDraft;
      h.writes[0].resolve({ ok, reverted: !ok }); await request;
      assert.equal(h.context.expenseDraft, nextDraft);
      assert.equal(nextDraft.error, "New draft message");
      assert.equal(nextDraft.id, undefined);
      assert.equal(h.closures.length, 0);
    });
  }
  test(`${handler} old completion cannot release another draft's in-flight save`, async () => {
    const h = harness(); const first = h.context[handler]("event-a");
    h.context.expenseDraft = { ...h.draft, name: "Second", payers: [...h.draft.payers] };
    const second = h.context[handler]("event-a");
    const secondStarted = h.writes.length === 2;
    h.writes[0].resolve({ ok: true }); await first;
    const wasBusy = h.context.expenseSaveInProgress;
    if (h.writes[1]) h.writes[1].resolve({ ok: true }); await second;
    assert.equal(secondStarted, true);
    assert.equal(wasBusy, true);
  });
}

for (const handler of ["markTransferPaid", "markTransfersPending"]) {
  for (const ok of [true, false]) {
    test(`${handler} late ${ok ? "success" : "failure"} cannot mutate or save the next account`, async () => {
      const h = harness();
      if (handler === "markTransfersPending") h.context.state.events[0].transfers[0].status = "paid";
      const request = h.context[handler](handler === "markTransferPaid" ? "transfer-a" : ["transfer-a"]);
      h.context.state = structuredClone(h.context.state);
      h.context.state.currentParticipantId = "account-b";
      const expected = structuredClone(h.context.state);
      h.context.notice = "Message B";
      h.writes[0].resolve({ ok }); await request;
      assert.deepEqual(JSON.parse(JSON.stringify(h.context.state)), expected);
      assert.equal(h.context.notice, "Message B");
      assert.equal(h.writes.length, 1);
    });
  }
}

test("an attachment finishing after its editor closed cannot fail on a missing draft", async () => {
  const h = harness(); let resolve;
  h.context.compressEventCoverImage = () => new Promise(done => { resolve = done; });
  h.context.activateExpenseEntryDialog = () => {};
  const request = h.context.applyExpenseAttachmentImage({ name: "synthetic.jpg" });
  h.context.expenseDraft = null;
  resolve("image-data"); await assert.doesNotReject(request);
});
