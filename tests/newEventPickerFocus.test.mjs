import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const from = source.indexOf("function restoreNewEventInlinePickerFocus(action)");
const to = source.indexOf("function renderNewEventSettlementOption", from);
assert.ok(from >= 0 && to > from);

function harness() {
  const frames = [];
  const document = { activeElement: null };
  const control = () => ({ focus() { document.activeElement = this; } });
  const summary = control(), nextField = control();
  const app = { querySelector: () => ({ closest: () => ({ querySelector: () => summary }) }) };
  const context = vm.createContext({ document, app, CSS: { escape: value => value },
    requestAnimationFrame: callback => frames.push(callback) });
  vm.runInContext(source.slice(from, to), context);
  return { document, summary, nextField, app,
    restore: action => context.restoreNewEventInlinePickerFocus(action),
    flush: () => { for (const callback of frames.splice(0)) callback(); } };
}

for (const action of ["new-event-currency-choice", "new-event-rounding-choice", "new-event-repayment-choice"]) {
  test(`${action} cannot steal focus from the user's next field`, () => {
    const h = harness();
    h.restore(action);
    h.nextField.focus();
    h.flush();
    assert.equal(h.document.activeElement, h.nextField);
  });
}

test("a selected event picker restores keyboard focus before the next interaction", () => {
  const h = harness();
  h.restore("new-event-currency-choice");
  assert.equal(h.document.activeElement, h.summary);
});

test("an event picker leaves no callback that can focus a later screen", () => {
  const h = harness();
  h.restore("new-event-currency-choice");
  h.app.querySelector = () => ({ closest: () => ({ querySelector: () => h.nextField }) });
  h.document.activeElement = null;
  h.flush();
  assert.equal(h.document.activeElement, null);
});
