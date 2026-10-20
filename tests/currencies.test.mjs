import test from "node:test";
import assert from "node:assert/strict";

import {
  currencyOptions,
  currencySelectLabel,
  currencySearchText,
  formatCurrency,
  normalizeCurrency
} from "../src/domain/currencies.mjs";
import { setEventCurrency } from "../src/domain/appActions.mjs";

test("supported currencies format minor units with a clear symbol", () => {
  assert.equal(formatCurrency(2750, "ILS"), "₪27.50");
  assert.equal(formatCurrency(2750, "USD"), "$27.50");
  assert.equal(formatCurrency(2750, "EUR"), "€27.50");
  assert.equal(formatCurrency(2750, "CHF"), "CHF 27.50");
  assert.equal(formatCurrency(100000, "ILS"), "₪1,000.00");
  assert.equal(formatCurrency(1250050, "USD"), "$12,500.50");
  assert.equal(formatCurrency(-1250050, "CHF"), "-CHF 12,500.50");
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

test("currency choices sort by Hebrew name and include supported two-decimal currencies", () => {
  const options = currencyOptions();
  const collator = new Intl.Collator("he");
  assert.deepEqual(options.map(({ label }) => label),
    options.map(({ label }) => label).sort(collator.compare));
  for (const id of ["BRL", "HKD", "MXN"]) {
    assert.equal(normalizeCurrency(id.toLowerCase()), id);
    assert.match(formatCurrency(1234, id), /12\.34$/);
  }
  assert.equal(normalizeCurrency(), "ILS");
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


test('country search indexes Hebrew, English, currency names and codes', () => {
  for (const [id, queries] of [
    ['THB', ['תאילנד', 'Thailand', 'Thai', 'באט', 'THB']],
    ['JPY', ['יפן', 'Japan', 'yen']],
    ['USD', ['ארצות הברית', 'USA', 'United States']],
    ['EUR', ['יוון', 'Greece', 'France']],
    ['GBP', ['אנגליה', 'England', 'United Kingdom']]
  ]) {
    const text = currencySearchText(id).toLowerCase();
    for (const query of queries) assert(text.includes(query.toLowerCase()), id + ': ' + query);
  }
});

test('every supported currency indexes its existing country without changing its displayed label', () => {
  for (const currency of currencyOptions()) {
    const label = currencySelectLabel(currency.id);
    assert(currencySearchText(currency.id).includes(currency.country));
    assert(currencySearchText(currency.id).includes(currency.id));
    assert.equal(currencySelectLabel(currency.id), label);
  }
});

test('search aliases normalize only known identifiers and do not fall back to shekels', () => {
  assert.equal(currencySearchText(' thb '), currencySearchText('THB'));
  for (const value of [undefined, null, '', 'BTC', '<img>']) assert.equal(currencySearchText(value), '');
});
