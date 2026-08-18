import test from "node:test";
import assert from "node:assert/strict";

import {
  currencyOptions,
  currencySelectLabel,
  formatCurrency,
  normalizeCurrency
} from "../src/domain/currencies.mjs";
import { setEventCurrency } from "../src/domain/appActions.mjs";

test("supported currencies format minor units with a clear symbol", () => {
  assert.equal(formatCurrency(2750, "ILS"), "₪27.50");
  assert.equal(formatCurrency(2750, "USD"), "$27.50");
  assert.equal(formatCurrency(2750, "EUR"), "€27.50");
  assert.equal(formatCurrency(2750, "CHF"), "CHF 27.50");
});

test("unknown and missing currencies safely fall back to ILS", () => {
  assert.equal(normalizeCurrency(), "ILS");
  assert.equal(normalizeCurrency("btc"), "ILS");
  assert.equal(formatCurrency(1200, "unknown"), "₪12.00");
});

test("currency options are unique and expose readable labels", () => {
  const options = currencyOptions();
  assert.ok(options.length >= 25);
  assert.equal(new Set(options.map((option) => option.id)).size, options.length);
  assert.ok(options.every((option) => option.country));
  assert.equal(currencySelectLabel("USD"), "דולר אמריקאי (ארצות הברית) · $");
  assert.equal(currencySelectLabel("EUR"), "אירו (גוש האירו) · €");
  assert.equal(currencySelectLabel("JPY"), "ין (יפן) · ¥");
});

test("an event currency with expenses changes only after explicit approval", () => {
  const emptyEvent = {
    id: "event-1",
    currency: "ILS",
    expenses: []
  };
  const withExpense = {
    id: "event-2",
    currency: "USD",
    expenses: [{ id: "expense-1" }]
  };
  const state = { events: [emptyEvent, withExpense] };

  const changed = setEventCurrency(state, "event-1", "EUR");
  const locked = setEventCurrency(changed, "event-2", "GBP");
  const approved = setEventCurrency(changed, "event-2", "GBP", {
    allowExistingExpenses: true
  });

  assert.equal(changed.events[0].currency, "EUR");
  assert.equal(locked.events[1].currency, "USD");
  assert.equal(approved.events[1].currency, "GBP");
});
