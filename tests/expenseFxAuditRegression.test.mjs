import test from "node:test";
import assert from "node:assert/strict";
import { setEventCurrency } from "../src/domain/appActions.mjs";
import { remapExpenseDraftAccountLinks } from "../src/domain/expenseDraftMemory.mjs";
import { convertExpenseInput, fetchEcbRate } from "../src/domain/expenseFx.mjs";
import { mergeSharedStates, validateSharedStateFinancials } from "../src/domain/sharedStateMerge.mjs";

const accountId = "account-11111111-1111-4111-8111-111111111111";
const converted = () => convertExpenseInput({ sourceCurrency: "USD", targetCurrency: "ILS",
  sourceAmount: "10", sourcePayers: [{ participantId: accountId, amount: "10" }],
  rate: "3.5", mode: "manual" });
const expense = () => ({ id: "expense", name: "Lunch", ...converted(),
  sharedByParticipantIds: [accountId], createdByParticipantId: accountId,
  updatedAt: "2026-10-10T12:00:00.000Z" });
const stateFor = (record = expense()) => ({ currentParticipantId: accountId,
  participants: [{ id: accountId, displayName: "Owner" }], groups: [],
  events: [{ id: "trip", currency: "ILS", participantIds: [accountId], adminIds: [accountId],
    expenses: [record], transfers: [], notes: [] }] });

test("a converted event keeps its currency instead of producing an unsaveable ledger", () => {
  const before = stateFor();
  const after = setEventCurrency(before, "trip", "USD", { allowExistingExpenses: true });
  assert.equal(after.events[0].currency, "ILS");
  assert.deepEqual(validateSharedStateFinancials(after), []);
});

test("account linking combines three-decimal source payers without losing precision", () => {
  const draft = { eventId: "trip", sourceCurrency: "JOD", total: "0.579", payers: [
    { participantId: "guest", amount: "0.123" },
    { participantId: accountId, amount: "0.456" }
  ] };
  remapExpenseDraftAccountLinks(draft, { id: "trip", participantIds: [accountId],
    participantAccountLinks: [{ sourceParticipantId: "guest", targetParticipantId: accountId,
      linkedAt: "2026-10-10T12:00:00.000Z" }] });
  assert.deepEqual(draft.payers.map(payer => payer.participantId), [accountId]);
  assert.equal(draft.payers[0].amount, "0.579");
  assert.equal(convertExpenseInput({ sourceCurrency: "JOD", targetCurrency: "ILS",
    sourceAmount: draft.total, sourcePayers: draft.payers, rate: "5", mode: "manual" }).total, 290);
});

test("a legacy name edit retains FX provenance but financial edits and explicit removal do not", () => {
  const original = expense();
  const newer = { ...original, name: "Renamed", updatedAt: "2026-10-11T12:00:00.000Z" };
  delete newer.fxConversion;
  const renamed = mergeSharedStates(stateFor(original), stateFor(newer)).events[0].expenses[0];
  assert.deepEqual(renamed.fxConversion, original.fxConversion);
  const changed = mergeSharedStates(stateFor(original), stateFor({ ...newer, total: newer.total + 1 })).events[0].expenses[0];
  assert.equal(changed.fxConversion, undefined);
  const removed = mergeSharedStates(stateFor(original), stateFor({ ...newer,
    fxConversionRemovedAt: newer.updatedAt })).events[0].expenses[0];
  assert.equal(removed.fxConversion, undefined);
});

test("an automatic JSON exponent rate is parsed as the full decimal value", async () => {
  const quote = await fetchEcbRate("USD", "ILS", { now: () => new Date("2026-10-11T12:00:00Z"),
    fetchImpl: async () => ({ ok: true, text: async () =>
      '{"date":"2026-10-10","base":"USD","quote":"ILS","rate":1e-7}' }) });
  assert.equal(quote.rate, "0.0000001");
});
