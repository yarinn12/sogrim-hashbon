import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const picker = await readFile("src/publicChoicePickerLayer.mjs", "utf8"), app = await readFile("src/app.mjs", "utf8");
const section = (text, start, end) => {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert(a >= 0 && b > a);
  return text.slice(a, b);
};
const makeNode = () => ({ dataset: {}, children: [], classList: { add() {
} }, setAttribute() {
}, append(...children) {
  this.children.push(...children);
} });
function loadPicker() {
  const context = vm.createContext({ document: { createElement: makeNode }, currencySearchText: (code) => code === "THB" ? "באט תאילנד Thailand Thai Baht THB" : "" });
  const normalize = section(picker, "function normalizeChoiceSearch(", "function isSearchableChoiceSelect(");
  vm.runInContext(section(picker, "function renderChoiceOption(", "function renderChoiceSearch(") + normalize, context);
  return context.renderChoiceOption;
}
test("expense currency search indexes Thailand even when its visible label has no country", () => {
  const render = loadPicker();
  const option = render({ value: "THB", textContent: "באט (THB)", disabled: false }, "", true);
  assert(option.dataset.choiceSearch.includes("תאילנד"), "Thai country must be searchable from the expense picker");
  assert(option.dataset.choiceSearch.includes("thailand"));
  assert.equal(option.children[0].children[0].children[0].textContent, "באט (THB)");
});
test("noncurrency options do not acquire currency country aliases", () => {
  const render = loadPicker();
  const option = render({ value: "THB", textContent: "שם משתתף", disabled: false }, "", false);
  assert.equal(option.dataset.choiceSearch, "שם משתתף thb");
});
test("inline currency choices preserve the shared search metadata", () => {
  const ctx = vm.createContext({ escapeHtml: String, escapeAttribute: String, iconSvg: () => "" });
  vm.runInContext(section(app, "function renderNewEventInlinePicker(", "function closeNewEventInlinePicker("), ctx);
  const html = ctx.renderNewEventInlinePicker({ label: "מטבע האירוע", valueLabel: "שקל ישראלי", action: "new-event-currency-choice", selectedValue: "ILS", searchable: true, hint: "", options: [{ value: "THB", label: "באט (תאילנד)", searchText: "THB באט תאילנד Thailand Thai Baht" }] });
  assert.match(html, /data-search-text="[^"]*Thailand/);
});
