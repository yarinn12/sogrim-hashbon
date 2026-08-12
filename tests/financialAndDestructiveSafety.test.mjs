import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateSettlement } from "../src/domain/settlement.mjs";
import {
  closeEvent,
  deleteEvent,
  removeExpense,
  reopenEvent,
  setEventCurrency,
  updateTransferStatus
} from "../src/domain/appActions.mjs";

const app = readFileSync("src/app.mjs", "utf8");

const P = (id) => ({ id, displayName: id, kind: "user" });
const sum = (balances) => Object.values(balances).reduce((a, b) => a + b, 0);

function stateWithEvent(overrides = {}) {
  return {
    currentParticipantId: "me",
    participants: [P("me"), P("d")],
    groups: [],
    deletedEvents: [],
    events: [
      {
        id: "e1",
        name: "E",
        eventType: "standard",
        currency: "ILS",
        participantIds: ["me", "d"],
        adminIds: ["me"],
        createdByParticipantId: "me",
        expenses: [
          {
            id: "x1",
            name: "a",
            total: 1000,
            payers: [{ participantId: "me", amount: 1000 }],
            sharedByParticipantIds: ["me", "d"]
          }
        ],
        transfers: [],
        ...overrides
      }
    ]
  };
}

test("balances always net to zero across awkward splits", () => {
  const cases = [
    [[P("a")], [{ id: "1", name: "t", total: 5000, payers: [{ participantId: "a", amount: 5000 }], sharedByParticipantIds: ["a"] }]],
    [[P("a"), P("b")], []],
    [
      [P("a"), P("b"), P("c"), P("d"), P("e"), P("f"), P("g")],
      [
        {
          id: "3",
          name: "t",
          total: 10001,
          payers: [
            { participantId: "a", amount: 3333 },
            { participantId: "b", amount: 3334 },
            { participantId: "c", amount: 3334 }
          ],
          sharedByParticipantIds: ["a", "b", "c", "d", "e", "f", "g"]
        }
      ]
    ],
    [
      [P("a"), P("b"), P("c")],
      [{ id: "8", name: "t", total: 1, payers: [{ participantId: "a", amount: 1 }], sharedByParticipantIds: ["a", "b", "c"] }]
    ]
  ];

  for (const [participants, expenses] of cases) {
    const result = calculateSettlement(participants, expenses);
    assert.equal(sum(result.balances), 0, "agorot never leak");
    for (const value of Object.values(result.balances)) {
      assert.equal(Number.isInteger(value), true, "balances stay integer agorot");
    }
  }
});

test("cumulative rounding over many odd expenses does not drift", () => {
  const expenses = Array.from({ length: 37 }, (_, index) => ({
    id: `m${index}`,
    name: "t",
    total: 333 + index,
    payers: [{ participantId: "a", amount: 333 + index }],
    sharedByParticipantIds: ["a", "b", "c"]
  }));

  const result = calculateSettlement([P("a"), P("b"), P("c")], expenses);
  const spent = expenses.reduce((total, expense) => total + expense.total, 0);

  assert.equal(sum(result.balances), 0, "no drift accumulates across 37 expenses");
  assert.equal(result.balances.a > 0, true, "the sole payer is owed money");
  assert.equal(
    Math.abs(result.balances.b + result.balances.c),
    result.balances.a,
    "debtors owe exactly what the payer is owed"
  );
  for (const value of Object.values(result.balances)) {
    assert.equal(Number.isInteger(value), true, "agorot stay integer");
  }
  assert.ok(result.balances.a <= spent, "nobody is owed more than was spent");
});

test("settlement transfers reconcile exactly against the debtor side", () => {
  const result = calculateSettlement(
    [P("avi"), P("noam"), P("dani")],
    [
      {
        id: "x1",
        name: "t",
        total: 12000,
        payers: [
          { participantId: "noam", amount: 5000 },
          { participantId: "dani", amount: 7000 }
        ],
        sharedByParticipantIds: ["avi", "noam", "dani"]
      }
    ]
  );

  const owed = Object.values(result.balances)
    .filter((value) => value < 0)
    .reduce((total, value) => total + Math.abs(value), 0);
  const moved = result.transfers.reduce((total, transfer) => total + transfer.amount, 0);

  assert.equal(moved, owed, "transfers move exactly what is owed");
  assert.deepEqual(
    result.transfers.map((t) => `${t.fromParticipantId}->${t.toParticipantId}:${t.amount}`).sort(),
    ["avi->dani:3000", "avi->noam:1000"]
  );
});

test("a payer who did not share is fully reimbursed", () => {
  const result = calculateSettlement(
    [P("a"), P("b")],
    [{ id: "5", name: "t", total: 1000, payers: [{ participantId: "a", amount: 1000 }], sharedByParticipantIds: ["b"] }]
  );

  assert.equal(result.balances.a, 1000);
  assert.equal(result.balances.b, -1000);
  assert.equal(sum(result.balances), 0);
});

test("inconsistent expenses raise issues instead of corrupting balances", () => {
  const ghost = calculateSettlement(
    [P("a"), P("b")],
    [{ id: "6", name: "t", total: 900, payers: [{ participantId: "a", amount: 900 }], sharedByParticipantIds: ["a", "b", "ghost"] }]
  );
  const overpaid = calculateSettlement(
    [P("a"), P("b")],
    [
      {
        id: "7",
        name: "t",
        total: 1000,
        payers: [
          { participantId: "a", amount: 900 },
          { participantId: "b", amount: 900 }
        ],
        sharedByParticipantIds: ["a", "b"]
      }
    ]
  );

  assert.ok(ghost.issues.length > 0, "an unknown sharer is reported");
  assert.equal(sum(ghost.balances), 0);
  assert.ok(overpaid.issues.length > 0, "payer overpayment is reported");
  assert.equal(sum(overpaid.balances), 0);
});

test("currency with existing expenses requires an explicit override", () => {
  const withExpense = setEventCurrency(stateWithEvent(), "e1", "USD");
  assert.equal(withExpense.events[0].currency, "ILS", "currency cannot change under existing expenses");
  const approved = setEventCurrency(stateWithEvent(), "e1", "USD", {
    allowExistingExpenses: true
  });
  assert.equal(approved.events[0].currency, "USD");

  const empty = stateWithEvent({ expenses: [] });
  assert.equal(setEventCurrency(empty, "e1", "USD").events[0].currency, "USD");
});

test("the currency control stays available but existing money requires confirmation", () => {
  assert.match(app, /const hasExistingExpenses = event\.expenses\.length > 0;/);
  assert.match(app, /\$\{!canManage \? "disabled" : ""\}/);
  assert.match(app, /kind: "change-event-currency"/);
  assert.match(app, /allowExistingExpenses: true/);
});

test("a locked event still accepts transfer settlement", () => {
  const state = stateWithEvent({
    locked: true,
    transfers: [
      { id: "t1", fromParticipantId: "d", toParticipantId: "me", amount: 500, status: "pending" }
    ]
  });

  const settled = updateTransferStatus(state, "e1", "t1", { status: "paid" });
  assert.equal(settled.events[0].transfers[0].status, "paid", "debts can be closed after locking");
});

test("deleting an event twice leaves one tombstone and no duplicates", () => {
  let state = deleteEvent(stateWithEvent(), "e1");
  const afterFirst = state.events.length;
  state = deleteEvent(state, "e1");

  assert.equal(afterFirst, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.deletedEvents.filter((item) => item.id === "e1").length, 1);
});

test("removing the same expense twice is a no-op", () => {
  let state = removeExpense(stateWithEvent(), "e1", "x1");
  assert.equal(state.events[0].expenses.length, 0);
  state = removeExpense(state, "e1", "x1");
  assert.equal(state.events[0].expenses.length, 0);
});

test("destructive actions on unknown ids never throw or mutate", () => {
  const state = stateWithEvent();
  assert.equal(removeExpense(state, "e1", "missing").events[0].expenses.length, 1);
  assert.equal(deleteEvent(state, "missing").events.length, 1);
  assert.equal(updateTransferStatus(state, "missing", "t", { status: "paid" }).events.length, 1);
});

test("close and reopen round trips cleanly and repeatedly", () => {
  let state = closeEvent(stateWithEvent(), "e1");
  assert.equal(state.events[0].locked, true);
  state = closeEvent(state, "e1");
  assert.equal(state.events[0].locked, true, "closing twice stays closed");
  state = reopenEvent(state, "e1");
  assert.equal(state.events[0].locked, false);
  assert.equal(state.events[0].expenses.length, 1, "reopening preserves the ledger");
});

test("every destructive action is gated behind an explicit confirmation", () => {
  for (const kind of [
    "reset-application",
    "archive-group",
    "remove-participant",
    "delete-expense",
    "leave-event",
    "delete-event"
  ]) {
    assert.match(app, new RegExp(`kind: "${kind}"`), `${kind} opens a confirmation dialog`);
  }
  assert.match(app, /data-action="confirm-important-action"/);
  assert.match(app, /data-action="cancel-important-action"/);
});

test("confirming clears the pending action before running it, so a double tap cannot repeat it", () => {
  const confirm = app.slice(
    app.indexOf("async function confirmImportantAction()"),
    app.indexOf("async function executeImportantAction")
  );

  assert.match(confirm, /if \(!pendingAction\) return;/);
  assert.ok(
    confirm.indexOf("importantActionDialog = null;") <
      confirm.indexOf("await executeImportantAction(pendingAction)"),
    "the dialog is cleared before the await, closing the double-tap window"
  );
});

test("expense saving is guarded against concurrent submits", () => {
  assert.match(app, /if \(!expenseDraft \|\| expenseSaveInProgress\) return;/);
  assert.match(app, /expenseSaveInProgress = true;/);
  assert.match(app, /expenseSaveInProgress = false;/);
});

test("the event action menu explains removal scope before confirmation", () => {
  assert.match(app, /const removesForEveryone = canManageStatus;/);
  assert.match(app, /מחיקה לכל המשתתפים, לאחר אישור נוסף/);
  assert.match(app, /הסרה מהאירועים שלי, לאחר אישור נוסף/);
});

test("randomised settlements never break the money invariants", () => {
  let seed = 12345;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  for (let iteration = 0; iteration < 1500; iteration += 1) {
    const count = 2 + rnd(7);
    const participants = Array.from({ length: count }, (_, index) => P(`p${index}`));
    const ids = participants.map((participant) => participant.id);
    const expenses = [];

    for (let e = 0; e < 1 + rnd(6); e += 1) {
      const total = 1 + rnd(50000);
      const payerCount = 1 + rnd(Math.min(3, count));
      const payers = [];
      let remaining = total;
      for (let k = 0; k < payerCount; k += 1) {
        const amount =
          k === payerCount - 1
            ? remaining
            : 1 + rnd(Math.max(1, remaining - (payerCount - k - 1)));
        payers.push({ participantId: ids[rnd(count)], amount });
        remaining -= amount;
      }
      const shared = ids.filter(() => rnd(2) === 0);
      expenses.push({
        id: `e${e}`,
        name: "t",
        total,
        payers,
        sharedByParticipantIds: shared.length ? shared : [ids[0]]
      });
    }

    const result = calculateSettlement(participants, expenses);
    const owed = Object.values(result.balances)
      .filter((value) => value < 0)
      .reduce((total, value) => total + Math.abs(value), 0);
    const moved = result.transfers.reduce((total, transfer) => total + transfer.amount, 0);

    assert.equal(sum(result.balances), 0, `iteration ${iteration}: balances must net to zero`);
    assert.equal(moved, owed, `iteration ${iteration}: transfers must reconcile`);
    for (const value of Object.values(result.balances)) {
      assert.equal(Number.isInteger(value), true, `iteration ${iteration}: integer agorot`);
    }
    for (const transfer of result.transfers) {
      assert.ok(transfer.amount > 0, `iteration ${iteration}: no zero or negative transfers`);
    }
    assert.ok(
      result.transfers.length <= count - 1,
      `iteration ${iteration}: settlement stays within the minimum-transfer bound`
    );
  }
});
