import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = source.indexOf("function activateExpenseEntryDialog()");
const end = source.indexOf("function createQuickItemDraft(", start);
assert.ok(start >= 0 && end > start);

function harness() {
  const frames = [], focused = [];
  const first = { scrollTop: 180 };
  let current = { querySelector: () => first };
  const context = vm.createContext({
    expenseDraft: { eventId: "event-a", mode: "shared", flowStep: "name" },
    getEvent: () => ({ eventType: "standard" }),
    eventTypeConfig: id => ({ id }),
    EVENT_TYPE_RESTAURANT: "restaurant",
    normalizeRestaurantQuickStage: stage => stage,
    normalizeExpenseFlowStep: step => step,
    expenseFlowFocusSelector: () => '[data-action="expense-name"]',
    activateDialog: (...args) => focused.push(args),
    app: { querySelector: () => current },
    requestAnimationFrame: callback => frames.push(callback)
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    first, focused,
    activate: () => context.activateExpenseEntryDialog(),
    flush: () => frames.splice(0).forEach(callback => callback()),
    replace(surface) { current = { querySelector: () => surface }; },
    close() { current = null; }
  };
}

test("expense entry initializes its scroll before accepting interaction", () => {
  const h = harness();
  h.activate();
  assert.equal(h.first.scrollTop, 0);
  assert.deepEqual(h.focused, [[".expense-modal", '[data-action="expense-name"]']]);
});

test("a delayed expense frame cannot undo a user's scroll", () => {
  const h = harness();
  h.activate();
  h.first.scrollTop = 140;
  h.flush();
  assert.equal(h.first.scrollTop, 140);
});

test("an old expense activation cannot scroll a replacement step", () => {
  const h = harness();
  h.activate();
  const replacement = { scrollTop: 240 };
  h.replace(replacement);
  h.flush();
  assert.equal(replacement.scrollTop, 240);
});

test("closing expense entry before pending frames run is safe", () => {
  const h = harness();
  h.activate();
  h.close();
  assert.doesNotThrow(h.flush);
});
