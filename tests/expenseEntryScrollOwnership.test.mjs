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
  let current = { scrollTop: 171, querySelector: () => first };
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
    get dialog() { return current; },
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


test("expense entry resets the outer modal before opening focus at enlarged text", () => {
  const h = harness();
  h.activate();
  assert.equal(h.dialog.scrollTop, 0, "the outer modal must not shift the header and footer out of place");
  h.dialog.scrollTop = 52;
  h.flush();
  assert.equal(h.dialog.scrollTop, 52, "no delayed reset may override a later user gesture");
});
function restoreHarness(step){
 const frames=[],dialog={scrollTop:0,dataset:{expenseStep:'review'}};
 const context=vm.createContext({renderGeneration:1,app:{querySelector:s=>s==='.expense-modal'?dialog:null},document:{body:{classList:{add(){}}},activeElement:{isConnected:true}},setDialogBackgroundInert(){},requestAnimationFrame:cb=>frames.push(cb),getEvent(){}});
 const a=source.indexOf('function restoreRenderInteractionState('),b=source.indexOf('function dialogRenderSelector(',a);vm.runInContext(source.slice(a,b),context);
 context.restoreRenderInteractionState({dialogSelector:'.expense-modal',dialogScrollTop:171,expenseStep:step},1);frames.forEach(f=>f());return dialog;
}
test('the previous expense stage cannot restore its outer scroll over the new review stage',()=>{assert.equal(restoreHarness('participants').scrollTop,0);});
test('a redraw of the same expense stage keeps its previous outer scroll',()=>{assert.equal(restoreHarness('review').scrollTop,171);});
