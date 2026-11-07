import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { eventSettlementOptionsView } from "../src/ui/eventSettlementOptions.mjs";

const source = await readFile("src/app.mjs", "utf8");
const start = source.indexOf("function renderNewEventSettlement() {");
const end = source.indexOf("function renderNewEventInlinePicker(", start);

function renderDraft(draft) {
  assert.ok(start >= 0 && end > start);
  const options = [];
  const context = vm.createContext({
    newEventDraft: draft, ensureNewEventDraft() {}, eventSettlementOptionsView,
    renderAppBackButton: () => "", renderNotice: () => '<div role="status">existing notice</div>',
    renderEventCreationProgress: step => `<nav>${step}</nav>`,
    renderNewEventInlinePicker(option) { options.push(option); return `<section>${option.hint}</section>`; }
  });
  vm.runInContext(source.slice(start, end), context);
  return { html: context.renderNewEventSettlement(), options };
}

test("app settlement adapter explains exact transfers without claiming they are rounded", () => {
  const draft = { roundSettlementTransfers: false, directSettlementTransfers: true, name: "Keep draft", currency: "USD" };
  const before = JSON.stringify(draft);
  const { options } = renderDraft(draft);
  assert.equal(options[0].selectedValue, "exact");
  assert.match(options[0].hint, /ללא עיגול/);
  assert.doesNotMatch(options[0].hint, /מעגלים/);
  assert.equal(JSON.stringify(draft), before);
});

test("all settlement flag combinations retain actions, values and a matching explanation", () => {
  for (const roundSettlementTransfers of [true, false]) {
    for (const directSettlementTransfers of [true, false]) {
      const draft = { roundSettlementTransfers, directSettlementTransfers, name: "Draft", currency: "EUR", participantIds: ["owner"] };
      const before = JSON.stringify(draft);
      const { html, options: [rounding, repayment] } = renderDraft(draft);
      assert.equal(JSON.stringify(draft), before);
      assert.equal(rounding.action, "new-event-rounding-choice");
      assert.equal(repayment.action, "new-event-repayment-choice");
      assert.equal(rounding.selectedValue, roundSettlementTransfers ? "rounded" : "exact");
      assert.equal(repayment.selectedValue, directSettlementTransfers ? "direct" : "optimized");
      assert.deepEqual(JSON.parse(JSON.stringify(rounding.options)).map(x => x.value), ["rounded", "exact"]);
      assert.deepEqual(JSON.parse(JSON.stringify(repayment.options)).map(x => x.value), ["direct", "optimized"]);
      assert.equal(rounding.valueLabel, rounding.options.find(x => x.value === rounding.selectedValue).label);
      assert.equal(repayment.valueLabel, repayment.options.find(x => x.value === repayment.selectedValue).label);
      assert.match(rounding.hint, roundSettlementTransfers ? /ההוצאות נשארות מדויקות/ : /ללא עיגול/);
      assert.match(repayment.hint, directSettlementTransfers ? /למי ששילם עבורו/ : /למשתתף אחר ממי ששילם/);
      assert.match(html, /role="status">existing notice/);
      assert.match(html, /data-action="open-new-event-participants"/);
      assert.doesNotMatch(html, /data-action="create-event"/);
    }
  }
});

test("settlement presentation preserves the existing falsy flag behavior", () => {
  const view = eventSettlementOptionsView({});
  assert.equal(view.rounding.selectedValue, "exact");
  assert.equal(view.repayment.selectedValue, "optimized");
});


test("settlement presentation is precached for offline creation", async () => {
  const worker = await readFile("sw.js", "utf8");
  const start = worker.indexOf("const CACHE_FILES = [");
  const files = worker.slice(start, worker.indexOf("];", start));
  assert.match(files, /"\/src\/ui\/eventSettlementOptions\.mjs"/);
});
