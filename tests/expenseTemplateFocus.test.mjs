import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const functionSource = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
};
function harness(name = "") {
  const frames = [];
  const document = { activeElement: null, body: { classList: { contains: () => true, add() {} } } };
  const element = props => ({ ...props, closest: () => null, focus() { document.activeElement = this; } });
  class Input {
    constructor(value) { this.value = value; }
    focus() { document.activeElement = this; }
  }
  const draft = { name };
  let dialog;
  const render = () => {
    const input = new Input(draft.name);
    const buttons = ["אוכל", "שתייה"].map(template => element({ dataset: { template } }));
    dialog = { ...element({}), input, buttons, scrollTop: 0,
      contains: target => target === input || buttons.includes(target),
      querySelector: selector => selector.includes('data-template="אוכל"') ? buttons[0] :
        selector.includes('data-template="שתייה"') ? buttons[1] : null };
    document.activeElement = null;
  };
  render();
  const context = vm.createContext({ expenseDraft: draft, document, HTMLInputElement: Input,
    EXPENSE_TEMPLATES: ["אוכל", "שתייה"], CSS: { escape: value => value }, render,
    window: {}, dialogReturnFocus: {}, setDialogBackgroundInert() {},
    requestAnimationFrame: callback => frames.push(callback),
    app: { querySelector: selector => selector === ".expense-modal" ? dialog : dialog.input,
      querySelectorAll: () => dialog.buttons }
  });
  vm.runInContext(functionSource("function reactivateDialogAfterRender(", "function rememberDialogReturnFocus("), context);
  vm.runInContext(functionSource("function applyExpenseTemplate(", "function nextExpensePayerId("), context);
  return { document, draft, get dialog() { return dialog; }, render,
    apply: template => context.applyExpenseTemplate(template),
    flush: () => { for (const callback of frames.splice(0)) callback(); } };
}

test("a late template callback preserves the user's next input focus", () => {
  const h = harness("שם אישי"); h.apply("אוכל"); h.dialog.input.focus(); h.flush();
  assert.equal(h.document.activeElement, h.dialog.input);
  assert.equal(h.draft.name, "שם אישי");
});
test("a stale template callback cannot focus a newly rendered expense dialog", () => {
  const h = harness(); h.apply("אוכל"); h.render(); h.flush();
  assert.equal(h.document.activeElement, null);
});
test("templates preserve custom names and replace empty or template names", () => {
  const h = harness("שם אישי"); h.apply("אוכל"); h.flush();
  assert.equal(h.draft.name, "שם אישי");
  h.dialog.input.value = ""; h.apply("אוכל"); h.flush();
  assert.equal(h.draft.name, "אוכל");
  assert.equal(h.document.activeElement, h.dialog.buttons[0]);
  h.apply("שתייה"); h.flush();
  assert.equal(h.draft.name, "שתייה");
  assert.equal(h.document.activeElement, h.dialog.buttons[1]);
});
