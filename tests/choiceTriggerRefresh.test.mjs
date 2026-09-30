import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/publicChoicePickerLayer.mjs", import.meta.url), "utf8");
const syncChoiceTrigger = vm.runInNewContext(`(${source.slice(
  source.indexOf("function syncChoiceTrigger("),
  source.indexOf("function choiceAccessibleLabel(")
).trim()})`);

function fixture(text = "Maor · member") {
  let labelNode = { text };
  const classes = new Set();
  const copy = {
    get textContent() { return labelNode.text; },
    set textContent(value) { labelNode = { text: value }; }
  };
  const trigger = {
    querySelector: () => copy,
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } }
  };
  return { trigger, classes, copy, node: () => labelNode };
}

test("choice refresh preserves an unchanged label node across a held press", () => {
  const h = fixture();
  const selected = { textContent: "  Maor  · member ", value: "maor" };
  const select = { selectedOptions: [selected], options: [selected] };
  const pressedLabel = h.node();
  for (let frame = 0; frame < 12; frame += 1) syncChoiceTrigger(select, h.trigger);
  assert.equal(h.node(), pressedLabel, "rewriting identical text detaches WebKit's pressed text node");
  assert.equal(h.copy.textContent, "Maor · member");
});

test("choice refresh still updates changed option text and empty choices", () => {
  const h = fixture();
  const selected = { textContent: "Ariel · guest", value: "ariel" };
  const select = { selectedOptions: [selected], options: [selected] };
  syncChoiceTrigger(select, h.trigger);
  assert.equal(h.copy.textContent, "Ariel · guest");
  assert.equal(h.classes.has("is-placeholder"), false);
  selected.textContent = "Ariel · member";
  syncChoiceTrigger(select, h.trigger);
  assert.equal(h.copy.textContent, "Ariel · member");
  syncChoiceTrigger({ selectedOptions: [], options: [] }, h.trigger);
  assert.equal(h.copy.textContent, "בחרו אפשרות");
  assert.equal(h.classes.has("is-placeholder"), true);
});
