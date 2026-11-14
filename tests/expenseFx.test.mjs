import test from "node:test";
import assert from "node:assert/strict";
import { convertExpenseInput, currencyFractionDigits, fetchOpenAccessRate, formatSourceAmount, parseSourceAmount, rateIsStale, validateExpenseFx, FX_LEGACY_ECB_SOURCE, FX_OPEN_ACCESS_SOURCE } from "../src/domain/expenseFx.mjs";

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

test("Open Access fetch sends only a base currency, reads exact rate and update times, and caches until the next update", async () => {
  const requested = [];
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const body = JSON.stringify({ result: "success", provider: "https://www.exchangerate-api.com", base_code: "USD",
    time_last_update_unix: Date.parse("2026-10-11T00:00:00Z") / 1000,
    time_next_update_unix: Date.parse("2026-10-12T00:00:00Z") / 1000, time_eol_unix: 0,
    rates: { USD: 1, ILS: 3.123456789, VND: 25855.7 } });
  const options = { now: () => new Date("2026-10-11T12:00:00Z"), storage, fetchImpl: async (url, options) => {
    requested.push({ url, options });
    return { ok: true, text: async () => body };
  } };
  const response = await fetchOpenAccessRate("USD", "ILS", options);
  assert.equal(requested[0].url, "https://open.er-api.com/v6/latest/USD");
  assert.equal(response.rate, "3.123456789");
  assert.equal(response.sourceDate, "2026-10-11");
  assert.equal(response.sourceUpdatedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(response.nextUpdateAt, "2026-10-12T00:00:00.000Z");
  assert.equal(response.stale, false);
  assert.equal((await fetchOpenAccessRate("USD", "VND", options)).rate, "25855.7");
  assert.equal(requested.length, 1);
  await fetchOpenAccessRate("USD", "ILS", { ...options, forceRefresh: true });
  assert.equal(requested.length, 2);
  assert.ok(!values.get("settle-friends-open-access-fx-v1:USD").includes("participantId"));
  assert.equal(rateIsStale("2026-09-30", new Date("2026-10-11T12:00:00Z")), true);
  await assert.rejects(() => fetchOpenAccessRate("USD", "ILS", { storage: null, fetchImpl: async () => ({ ok: false, status: 429 }) }), /שער אישי/);
  await assert.rejects(() => fetchOpenAccessRate("USD", "ILS", { storage: null, fetchImpl: async () => ({ ok: true, text: async () => body.replace('"base_code":"USD"', '"base_code":"EUR"') }) }), /שער אישי/);
});

test("new automatic snapshots keep only the used pair while legacy ECB snapshots remain valid", () => {
  const input = { sourceCurrency: "USD", targetCurrency: "ILS", sourceAmount: "10",
    sourcePayers: [{ participantId: "a", amount: "10" }], rate: "3.5", mode: "automatic",
    sourceDate: "2026-10-11", fetchedAt: "2026-10-11T12:00:00.000Z" };
  const current = convertExpenseInput({ ...input, rateSource: FX_OPEN_ACCESS_SOURCE,
    sourceUpdatedAt: "2026-10-11T00:00:00.000Z", nextUpdateAt: "2026-10-12T00:00:00.000Z" });
  assert.equal(validateExpenseFx(current, "ILS"), true);
  assert.equal(current.fxConversion.source, FX_OPEN_ACCESS_SOURCE);
  assert.equal("rates" in current.fxConversion, false);
  const legacy = convertExpenseInput({ ...input, rateSource: FX_LEGACY_ECB_SOURCE });
  assert.equal(validateExpenseFx(legacy, "ILS"), true);
  assert.equal("sourceUpdatedAt" in legacy.fxConversion, false);
});

test("automatic JSON rate parsing expands exponents exactly and rejects unsafe range or precision", async () => {
  const quote = (rateToken) => `{"result":"success","provider":"https://www.exchangerate-api.com","base_code":"USD","time_last_update_unix":1791676800,"time_next_update_unix":1791763200,"time_eol_unix":0,"rates":{"ILS":${rateToken}}}`;
  const options = (token) => ({ storage: null, now: () => new Date("2026-10-11T12:00:00Z"),
    fetchImpl: async () => ({ ok: true, text: async () => quote(token) }) });
  assert.equal((await fetchOpenAccessRate("USD", "ILS", options("1.25E+2"))).rate, "125");
  assert.equal((await fetchOpenAccessRate("USD", "ILS", options("1e-7"))).rate, "0.0000001");
  for (const token of ["1e-17", "1e100", "-1e-7"]) {
    await assert.rejects(() => fetchOpenAccessRate("USD", "ILS", options(token)), /שער אישי/);
  }
  assert.throws(() => convertExpenseInput({ sourceCurrency: "USD", targetCurrency: "ILS",
    sourceAmount: "90071992547409.91", sourcePayers: [{ participantId: "a", amount: "90071992547409.91" }],
    rate: "1000", mode: "manual" }), /טווח/);
});
