import test from "node:test";
import assert from "node:assert/strict";
import { convertExpenseInput, currencyFractionDigits, fetchEcbRate, formatSourceAmount, parseSourceAmount, rateIsStale, validateExpenseFx } from "../src/domain/expenseFx.mjs";

test("source currency precision does not change the existing two-decimal event ledger", () => {
  assert.equal(currencyFractionDigits("JPY"), 0);
  assert.equal(currencyFractionDigits("KWD"), 3);
  assert.equal(parseSourceAmount("123", "JPY"), 123n);
  assert.equal(parseSourceAmount("1.234", "KWD"), 1234n);
  assert.equal(formatSourceAmount("1234", "KWD"), "1.234");
  assert.throws(() => parseSourceAmount("123.45", "JPY"));
  assert.throws(() => parseSourceAmount("1.2345", "KWD"));
  const converted = convertExpenseInput({ sourceCurrency: "JPY", targetCurrency: "ILS", sourceAmount: "100", sourcePayers: [{ participantId: "a", amount: "100" }], rate: "0.025", mode: "manual" });
  assert.equal(converted.total, 250);
  assert.equal(converted.fxConversion.sourceAmountMinorUnits, "100");
  assert.equal(converted.fxConversion.targetAmountMinorUnits, "250");
  assert.equal(validateExpenseFx({ ...converted }, "ILS"), true);
});

test("payer conversion uses exact decimal arithmetic and deterministic largest remainders", () => {
  const input = { sourceCurrency: "USD", targetCurrency: "ILS", sourceAmount: "0.03", sourcePayers: ["a", "b", "c"].map((participantId) => ({ participantId, amount: "0.01" })), rate: "3.5", mode: "manual" };
  const converted = convertExpenseInput(input);
  assert.equal(converted.total, 11);
  assert.deepEqual(converted.payers.map((payer) => payer.amount), [4, 4, 3]);
  assert.equal(converted.payers.reduce((sum, payer) => sum + payer.amount, 0), converted.total);
  assert.equal(validateExpenseFx({ ...converted }, "ILS"), true);
  assert.equal(validateExpenseFx({ ...converted, total: 12 }, "ILS"), false);
  assert.throws(() => convertExpenseInput({ ...input, sourcePayers: [{ participantId: "a", amount: "0.02" }] }));
  assert.throws(() => convertExpenseInput({ ...input, sourcePayers: [{ participantId: "", amount: "0.03" }] }));
  assert.throws(() => convertExpenseInput({ ...input, rate: "0.00000001" }));
});

test("automatic fetch sends only the currency pair and rejects malformed or stale rates", async () => {
  const requested = [];
  const response = await fetchEcbRate("USD", "ILS", { now: () => new Date("2026-10-11T12:00:00Z"), fetchImpl: async (url, options) => {
    requested.push({ url, options });
    return { ok: true, text: async () => '{"date":"2026-10-10","base":"USD","quote":"ILS","rate":3.123456789}' };
  } });
  assert.equal(requested[0].url, "https://api.frankfurter.dev/v2/providers/ecb/rate/usd/ils");
  assert.equal(response.rate, "3.123456789");
  assert.equal(response.sourceDate, "2026-10-10");
  assert.equal(response.stale, false);
  assert.equal(rateIsStale("2026-09-30", new Date("2026-10-11T12:00:00Z")), true);
  await assert.rejects(() => fetchEcbRate("USD", "ILS", { fetchImpl: async () => ({ ok: false, status: 404 }) }), /שער אישי/);
  await assert.rejects(() => fetchEcbRate("USD", "ILS", { fetchImpl: async () => ({ ok: true, text: async () => '{"date":"2026-10-10","base":"EUR","quote":"ILS","rate":3.5}' }) }), /שער אישי/);
});
