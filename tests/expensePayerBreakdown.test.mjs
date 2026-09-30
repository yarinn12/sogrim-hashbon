import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./helpers/readSource.mjs";
import { formatCurrency, normalizeCurrency } from "../src/domain/currencies.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";

const source = await readSource("src/app.mjs", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing renderer dependency: ${name}`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

function renderRow(currency, payers, names = ["ירין יצחק", "לירון אברהם"], totalOverride) {
  const participants = names.map((displayName, index) => ({ id: `person-${index}`, displayName }));
  const event = { id: "event-payer-breakdown", currency, participantIds: participants.map(p => p.id) };
  const context = vm.createContext({
    formatCurrency, normalizeCurrency, calculateSettlement,
    canCurrentParticipantEdit: () => true,
    eventParticipants: () => participants,
    participantName: id => participants.find(p => p.id === id)?.displayName ?? "משתתף",
    iconSvg: () => ""
  });
  for (const name of ["eventCurrency", "formatEventMoney", "escapeHtml", "escapeAttribute", "renderExpenseRow"]) {
    vm.runInContext(functionSource(name), context);
  }
  return context.renderExpenseRow(event, {
    id: "expense-payer-breakdown", name: "ארוחה", total: totalOverride ?? payers.reduce((sum, payer) => sum + payer.amount, 0),
    payers, sharedByParticipantIds: event.participantIds
  });
}

function visibleSummary(html) {
  const summary = html.slice(html.indexOf("<button"), html.indexOf("</button>"));
  return summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("the collapsed expense row pairs each payer with their actual amount, including cents and event currency", () => {
  const payers = [{ participantId: "person-0", amount: 5012 }, { participantId: "person-1", amount: 7087 }];
  for (const [currency, symbol] of [["ILS", "₪"], ["USD", "$"], ["KRW", "₩"]]) {
    const html = renderRow(currency, payers);
    const summary = visibleSummary(html);
    assert.ok(summary.includes(`ירין יצחק ${symbol}50.12`), `${currency}: Yarin's payment is visible beside his name`);
    assert.ok(summary.includes(`לירון אברהם ${symbol}70.87`), `${currency}: Liron's payment is visible beside his name`);
    assert.ok(html.includes(`${symbol}120.99`), "The full expense total remains visible");
  }
});

test("a single payer also shows their paid amount without opening the expense", () => {
  const html = renderRow("ILS", [{ participantId: "person-0", amount: 123456 }]);
  assert.ok(visibleSummary(html).includes("ירין יצחק ₪1,234.56"));
});

test("payer display names remain escaped in the visible breakdown and searchable", () => {
  const html = renderRow("ILS", [{ participantId: "person-0", amount: 2500 }], ['ירין <img src=x onerror="alert(1)">']);
  assert.ok(visibleSummary(html).includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; ₪25.00"));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-expense-search="ארוחה ירין &lt;img/);
});

test("an invalid saved payer amount keeps the expense visible with its review warning", () => {
  for (const amount of [undefined, NaN, "5000", 50.5]) {
    const html = renderRow("ILS", [{ participantId: "person-0", amount }], ["ירין יצחק"], 5000);
    assert.ok(visibleSummary(html).includes("ירין יצחק סכום לא תקין"));
    assert.match(html, /צריך תיקון · לא נכנסה לחישוב/);
  }
});
