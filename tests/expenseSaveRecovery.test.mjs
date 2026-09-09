import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as memory from "../src/domain/expenseDraftMemory.mjs";
import { updateExpense } from "../src/domain/appActions.mjs";
import { parseMoneyInput } from "../src/domain/money.mjs";
import { validateExpense } from "../src/domain/validation.mjs";
import { buildQuickItemExpenses } from "../src/domain/quickExpenses.mjs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function functionSource(name) {
  const start = new RegExp(`(?:async )?function ${name}\\(`).exec(source)?.index;
  assert.notEqual(start, undefined, name);
  const end = /\n(?:async )?function /.exec(source.slice(start + 1));
  return source.slice(start, end ? start + 1 + end.index : undefined);
}
const copy = value => JSON.parse(JSON.stringify(value));
const originalExpense = () => ({ id: "expense-existing", name: "Original", total: 1200,
  payers: [{ participantId: "owner", amount: 1200 }], sharedByParticipantIds: ["owner", "peer"],
  createdByParticipantId: "owner", occurredOn: "2026-09-09", notes: "", attachmentImage: "",
  updatedAt: "2026-09-08T10:00:00.000Z" });
let clientSerial = 0;
function harness({ values = new Map(), state, edit = false, quick = false } = {}) {
  const writes = [], closures = [];
  state ??= { currentParticipantId: "owner", participants: [{ id: "owner" }, { id: "peer" }],
    events: [{ id: "event", participantIds: ["owner", "peer"], expenses: edit ? [originalExpense()] : [],
      transfers: [], deletedExpenses: [] }] };
  let serial = 0;
  const client = ++clientSerial;
  const context = vm.createContext({ ...memory, state: copy(state), expenseSaveInProgress: false,
    expenseSaveRequest: null, expenseDraft: { eventId: "event", mode: quick ? "items" : "single",
      name: "Dinner", total: "12", payers: [{ participantId: "owner", amount: "12", amountTouched: true }],
      sharedByParticipantIds: ["owner", "peer"], occurredOn: "2026-09-09", notes: "", attachmentImage: "",
      quickPayerId: "owner", quickItems: [{ name: "Soup", amount: "12", sharedBy: "__all__" },
        { name: "Bread", amount: "4", sharedBy: "__all__" }],
      ...(edit ? { id: "expense-existing", baseExpenseUpdatedAt: originalExpense().updatedAt } : {}) },
    window: { localStorage: { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } },
    getEvent: id => context.state.events.find(event => event.id === id),
    canCurrentParticipantEdit: () => context.state.currentParticipantId === "owner",
    editBlockedMessage: () => "No permission", activeEventParticipants: () => [{ id: "owner" }, { id: "peer" }],
    render: () => context.rememberExpenseDraft(), syncExpenseSaveState: () => {},
    reactivateDialogAfterRender: () => {}, activateDialog: () => {},
    parseMoneyInput, validateExpense, updateExpense, buildQuickItemExpenses, mergePayers: value => value,
    makeId: () => `expense-${client}-${++serial}`, todayInputValue: () => "2026-09-09", cloneNavigationValue: copy,
    recordEventActivity: () => {}, reconcileEventTransfers: () => {},
    persistState: () => new Promise(resolve => writes.push({ payload: copy(context.state), resolve })),
    stateSaveCheckpoint: request => ({ request }), rejectedStateSaveIsCurrent: () => true,
    EXPENSE_FOREGROUND_SAVE_BUDGET_MS: 350, publishReferralActivityAfterSave: () => {},
    publishEventActivityAfterSave: () => {}, emitProductMetric: () => {}, saveFailureMessage: () => "Save rejected",
    expenseDialogRewindSteps: () => 1, closeDialogWithHistory: () => closures.push(true),
    formatCount: count => String(count), notice: ""
  });
  for (const name of ["rememberExpenseDraft", "restoreExpenseDraft", "clearRememberedExpenseDraft", "saveExpense", "saveQuickExpenses"])
    vm.runInContext(functionSource(name), context);
  context.rememberExpenseDraft();
  return { context, values, writes, closures, event: () => context.getEvent("event") };
}
function reload(h, { editId = "", state = h.context.state } = {}) {
  // A vanished page never receives its outstanding response. The next page
  // gets the durable snapshot and the actual serialized draft from that page.
  const restored = harness({ values: new Map(h.values), state });
  // Creating the harness must not replace the interrupted page's draft.
  restored.values.clear();
  for (const [key, value] of h.values) restored.values.set(key, value);
  restored.context.expenseDraft = restored.context.restoreExpenseDraft(restored.event(), editId);
  assert.ok(restored.context.expenseDraft, "interrupted user input remains recoverable");
  return restored;
}
async function accept(h, promise) {
  assert.equal(h.writes.length, 1, "retry must reach the persistence boundary");
  h.writes[0].resolve({ ok: true });
  await promise;
  assert.equal(h.closures.length, 1);
  assert.equal(h.context.expenseDraft, null);
  assert.equal(h.values.size, 0, "successful save clears every alias of its draft");
}

test("an interrupted expense create retries the same ID and preserves continued typing", async () => {
  const first = harness();
  void first.context.saveExpense("event");
  assert.equal(first.writes.length, 1);
  const id = first.writes[0].payload.events[0].expenses[0].id;
  const next = reload(first);
  next.context.expenseDraft.name = "Dinner continued";
  await accept(next, next.context.saveExpense("event"));
  assert.equal(next.writes[0].payload.events[0].expenses.length, 1);
  assert.equal(next.writes[0].payload.events[0].expenses[0].id, id);
  assert.equal(next.writes[0].payload.events[0].expenses[0].name, "Dinner continued");
});

test("opening a created expense recovers its interrupted new-expense draft", async () => {
  const first = harness(); void first.context.saveExpense("event");
  const id = first.event().expenses[0].id;
  const next = reload(first, { editId: id });
  next.context.expenseDraft.name = "Recovered through edit";
  await accept(next, next.context.saveExpense("event"));
  assert.equal(next.event().expenses.length, 1);
  assert.equal(next.event().expenses[0].name, "Recovered through edit");
});

test("an interrupted expense edit accepts its own durable revision as the retry base", async () => {
  const first = harness({ edit: true }); void first.context.saveExpense("event");
  const next = reload(first, { editId: "expense-existing" });
  next.context.expenseDraft.name = "Continued edit";
  await accept(next, next.context.saveExpense("event"));
  assert.equal(next.event().expenses.length, 1);
  assert.equal(next.event().expenses[0].name, "Continued edit");
});

test("a live expense editor refuses to overwrite a revision received from a peer", async () => {
  const h = harness({ edit: true });
  h.event().expenses[0].name = "Peer expense";
  h.event().expenses[0].updatedAt = "2026-09-08T11:00:00.000Z";
  const pending = h.context.saveExpense("event");
  if (h.writes[0]) h.writes[0].resolve({ ok: true });
  await pending;
  assert.equal(h.writes.length, 0, "stale financial values must not reach storage");
  assert.equal(h.event().expenses[0].name, "Peer expense");
  assert.equal(h.context.expenseDraft.name, "Dinner");
});

for (const edit of [false, true]) {
  test(`interrupted ${edit ? "edit" : "create"} preserves a peer's newer expense revision`, async () => {
    const first = harness({ edit }); void first.context.saveExpense("event");
    first.event().expenses[0].name = "Peer revision";
    first.event().expenses[0].updatedAt = "2099-01-01T00:00:00.000Z";
    const next = reload(first, { editId: edit ? "expense-existing" : "" });
    const pending = next.context.saveExpense("event");
    if (next.writes[0]) next.writes[0].resolve({ ok: true });
    await pending;
    assert.equal(next.writes.length, 0);
    assert.equal(next.event().expenses.length, 1);
    assert.equal(next.event().expenses[0].name, "Peer revision");
    assert.ok(next.context.expenseDraft);
  });
}

test("an interrupted new expense cannot return after another client deletes its ID", async () => {
  const first = harness(); void first.context.saveExpense("event");
  const id = first.event().expenses[0].id;
  first.event().expenses = [];
  first.event().deletedExpenses = [{ id, updatedAt: "2099-01-01T00:00:00.000Z" }];
  const next = reload(first);
  const pending = next.context.saveExpense("event");
  if (next.writes[0]) next.writes[0].resolve({ ok: true });
  await pending;
  assert.equal(next.writes.length, 0);
  assert.equal(next.event().expenses.length, 0);
  assert.ok(next.context.expenseDraft);
});

for (const edit of [false, true]) {
  test(`interrupted ${edit ? "edit" : "create"} can retry when the first snapshot never reached storage`, async () => {
    const first = harness({ edit }); const before = copy(first.context.state);
    void first.context.saveExpense("event");
    const next = reload(first, { state: before, editId: edit ? "expense-existing" : "" });
    await accept(next, next.context.saveExpense("event"));
    assert.equal(next.event().expenses.length, 1);
    assert.equal(next.event().expenses[0].name, "Dinner");
  });
}

test("a rejected resumed create retains the draft and retries without duplicating the expense", async () => {
  const first = harness(); void first.context.saveExpense("event");
  const next = reload(first);
  const rejected = next.context.saveExpense("event");
  assert.equal(next.writes.length, 1);
  next.writes[0].resolve({ ok: false }); await rejected;
  assert.ok(next.context.expenseDraft);
  assert.equal(next.closures.length, 0);
  const retry = next.context.saveExpense("event");
  assert.equal(next.writes.length, 2);
  next.writes[1].resolve({ ok: true }); await retry;
  assert.equal(next.writes[1].payload.events[0].expenses.length, 1);
});

test("interrupted restaurant batches retry each saved item exactly once", async () => {
  const first = harness({ quick: true }); void first.context.saveQuickExpenses("event");
  const ids = first.event().expenses.map(expense => expense.id);
  const next = reload(first);
  await accept(next, next.context.saveQuickExpenses("event"));
  assert.deepEqual(Array.from(next.event().expenses, expense => expense.id), Array.from(ids));
  assert.equal(next.writes[0].payload.events[0].expenses.length, 2);
});

test("a restaurant retry preserves a peer edit and keeps its unsaved input", async () => {
  const first = harness({ quick: true }); void first.context.saveQuickExpenses("event");
  first.event().expenses[0].name = "Peer soup";
  first.event().expenses[0].updatedAt = "2099-01-01T00:00:00.000Z";
  const next = reload(first);
  const pending = next.context.saveQuickExpenses("event");
  if (next.writes[0]) next.writes[0].resolve({ ok: true });
  await pending;
  assert.equal(next.writes.length, 0);
  assert.equal(next.event().expenses.length, 2);
  assert.equal(next.event().expenses[0].name, "Peer soup");
  assert.ok(next.context.expenseDraft);
});

test("a restaurant retry after a pre-write restart uses the original item identities", async () => {
  const first = harness({ quick: true }); const before = copy(first.context.state);
  void first.context.saveQuickExpenses("event");
  const expected = copy(first.event().expenses);
  const next = reload(first, { state: before });
  await accept(next, next.context.saveQuickExpenses("event"));
  assert.deepEqual(copy(next.event().expenses), expected);
});

for (const scenario of ["deleted", "changed-input", "partial", "rejected"]) {
  test(`interrupted restaurant retry handles ${scenario} without duplicating or discarding intent`, async () => {
    const first = harness({ quick: true }); void first.context.saveQuickExpenses("event");
    const expected = copy(first.event().expenses);
    if (scenario === "deleted") {
      const deleted = first.event().expenses.shift();
      first.event().deletedExpenses = [{ id: deleted.id, updatedAt: "2099-01-01T00:00:00.000Z" }];
    }
    if (scenario === "partial") first.event().expenses.pop();
    const next = reload(first);
    if (scenario === "changed-input") next.context.expenseDraft.quickItems[0].amount = "99";
    const request = next.context.saveQuickExpenses("event");
    if (["deleted", "changed-input"].includes(scenario)) {
      if (next.writes[0]) next.writes[0].resolve({ ok: true });
      await request;
      assert.equal(next.writes.length, 0);
      assert.ok(next.context.expenseDraft);
    } else if (scenario === "partial") {
      await accept(next, request);
      assert.deepEqual(copy(next.event().expenses).sort((a, b) => a.id.localeCompare(b.id)),
        expected.sort((a, b) => a.id.localeCompare(b.id)));
    } else {
      next.writes[0].resolve({ ok: false }); await request;
      assert.ok(next.context.expenseDraft);
      const retry = next.context.saveQuickExpenses("event");
      assert.equal(next.writes.length, 2);
      next.writes[1].resolve({ ok: true }); await retry;
      assert.deepEqual(copy(next.writes[1].payload.events[0].expenses), expected);
    }
  });
}

for (const quick of [false, true]) {
  test(`${quick ? "restaurant" : "single"} recovery respects revoked permission`, async () => {
    const first = harness({ quick }); void first.context[quick ? "saveQuickExpenses" : "saveExpense"]("event");
    const next = reload(first);
    next.context.canCurrentParticipantEdit = () => false;
    await next.context[quick ? "saveQuickExpenses" : "saveExpense"]("event");
    assert.equal(next.writes.length, 0);
    assert.ok(next.context.expenseDraft);
  });
}

test("corrupt pending expense metadata cannot turn recovery into a new financial write", async () => {
  const first = harness(); void first.context.saveExpense("event");
  first.context.expenseDraft.pendingExpenseSave ??= { expense: copy(first.event().expenses[0]), created: true };
  first.context.expenseDraft.pendingExpenseSave.beforeExpense = { id: "unrelated" };
  first.context.rememberExpenseDraft();
  const next = reload(first);
  const request = next.context.saveExpense("event");
  if (next.writes[0]) next.writes[0].resolve({ ok: true });
  await request;
  assert.equal(next.writes.length, 0);
  assert.ok(next.context.expenseDraft);
});
