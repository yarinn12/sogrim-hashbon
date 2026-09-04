import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { rollbackSettingsOnlyStateChange } from "../src/data/settingsSaveRollback.mjs";
import { setEventRoundSettlementTransfers, setEventCurrency } from "../src/domain/appActions.mjs";
import { reconcileSettlementTransfers, settlementOptionsForEvent } from "../src/domain/settlement.mjs";

function initial() {
  const participants = [{ id: "a", displayName: "A" }, { id: "b", displayName: "B" }];
  const event = { id: "event", participantIds: ["a", "b"], currency: "ILS", roundSettlementTransfers: true,
    createdAt: "2026-01-01T00:00:00.000Z", settingsUpdatedAt: "2026-01-01T00:00:00.000Z", notes: [],
    expenses: [{ id: "expense", total: 1050, payers: [{ participantId: "a", amount: 1050 }], sharedByParticipantIds: ["a", "b"] }] };
  event.transfers = reconcileSettlementTransfers(participants, event.expenses, [], settlementOptionsForEvent(event)).transfers;
  return { currentParticipantId: "a", participants, events: [event] };
}

test("durable rounding rollback recomputes the old plan without removing incoming notes", () => {
  const before = initial(), attempted = setEventRoundSettlementTransfers(before, "event", false);
  const latest = structuredClone(attempted); latest.events[0].notes.push({ id: "remote" });
  const result = rollbackSettingsOnlyStateChange(latest, before, attempted);
  assert.equal(result.events[0].roundSettlementTransfers, true);
  assert.deepEqual(result.events[0].transfers, before.events[0].transfers);
  assert.equal(result.events[0].notes[0].id, "remote");
});

test("a mixed setting and expense write is not classified as settings-only", () => {
  const before = initial(), attempted = setEventCurrency(before, "event", "USD", { allowExistingExpenses: true });
  attempted.events = structuredClone(attempted.events); attempted.events[0].expenses[0].total += 100;
  assert.equal(rollbackSettingsOnlyStateChange(attempted, before, attempted), null);
});

test("a setting rollback cannot silently absorb a payment-status edit", () => {
  const before = initial(), attempted = setEventRoundSettlementTransfers(before, "event", false);
  attempted.events[0].transfers[0].status = "paid";
  assert.equal(rollbackSettingsOnlyStateChange(attempted, before, attempted), null);
});

test("a setting rollback keeps the next account and deleted events untouched", () => {
  const before = initial(), attempted = setEventRoundSettlementTransfers(before, "event", false);
  const other = { ...structuredClone(attempted), currentParticipantId: "b" };
  assert.equal(rollbackSettingsOnlyStateChange(other, before, attempted), other);
  const deleted = { ...structuredClone(attempted), events: [], deletedEvents: [{ id: "event" }] };
  assert.deepEqual(rollbackSettingsOnlyStateChange(deleted, before, attempted), deleted);
});

test("a newer canonical setting value/clock wins over a rejected older request", () => {
  const before = initial(), attempted = setEventRoundSettlementTransfers(before, "event", false);
  const latest = structuredClone(attempted);
  latest.events[0].settingsFieldUpdatedAt.roundSettlementTransfers = "2099-01-01T00:00:00.000Z";
  assert.deepEqual(rollbackSettingsOnlyStateChange(latest, before, attempted), latest);
});

for (const field of ["participantIds", "expenses"]) {
  for (const value of [undefined, {}]) {
    test(`incomplete ${field}=${JSON.stringify(value)} returns no classification instead of throwing`, () => {
      const before = initial(), attempted = setEventRoundSettlementTransfers(before, "event", false);
      before.events[0][field] = value;
      attempted.events[0][field] = value;
      assert.equal(rollbackSettingsOnlyStateChange(attempted, before, attempted), null);
    });
  }
}

for (const helper of ["rollbackNoteOnlyStateChange", "rollbackSettingsOnlyStateChange"]) {
  test(`an unexpected ${helper} failure cannot interrupt the durable revert and notice`, () => {
    const source = readFileSync(new URL("../src/data/localStore.mjs", import.meta.url), "utf8");
    const start = source.indexOf("const latestState = loadState();");
    const end = source.indexOf("reverted = true;", start) + "reverted = true;".length;
    assert.ok(start > 0 && end > start);
    const calls = [];
    const previousState = initial();
    const context = vm.createContext({ previousState, stateSnapshot: {}, loadState: () => ({}),
      rollbackNoteOnlyStateChange: () => null, rollbackSettingsOnlyStateChange: () => null,
      saveState: value => calls.push({ kind: "save", value }),
      emitOperationDeferred: () => {}, suppressRevertNotice: false, syncSelection: {},
      error: new Error("Original write failure"), foregroundMutation: true, mayNotifyFailure: () => true, requestStartedAt: 1,
      publishSharedSaveReverted: () => calls.push({ kind: "notice" }), reverted: false });
    context[helper] = () => { throw new TypeError("Synthetic helper failure"); };
    assert.doesNotThrow(() => vm.runInContext(source.slice(start, end), context));
    assert.equal(calls[0].kind, "save"); assert.equal(calls[0].value, previousState);
    assert.equal(calls[1].kind, "notice"); assert.equal(context.reverted, true);
  });
}
