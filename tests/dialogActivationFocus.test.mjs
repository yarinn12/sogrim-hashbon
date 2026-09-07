import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const start = appSource.indexOf("function activateDialog(");
const end = appSource.indexOf("\nfunction rememberDialogReturnFocus(", start);
assert.ok(start >= 0 && end > start);

function harness() {
  const frames = [], inertTargets = [];
  const document = { activeElement: null, body: { classList: { contains: () => false, add() {} } } };
  const element = name => ({ name, focus() { document.activeElement = this; } });
  const makeDialog = () => {
    const first = element("title"), second = element("body");
    return { ...element("dialog"), first, second, scrollTop: 9,
      contains: value => [first, second].includes(value),
      querySelector: selector => selector === "title" ? first : selector === "body" ? second : null };
  };
  let dialog = makeDialog();
  const context = vm.createContext({
    app: { querySelector: () => dialog }, document, dialogReturnFocus: null, dialogReturnScrollY: 0,
    rememberDialogReturnFocus() {}, window: { scrollY: 80, scrollTo() {} },
    requestAnimationFrame: callback => { frames.push(callback); },
    setDialogBackgroundInert: target => inertTargets.push(target)
  });
  vm.runInContext(appSource.slice(start, end), context);
  return { context, document, get dialog() { return dialog; }, inertTargets,
    open: selector => context.activateDialog(".event-modal", selector),
    flush: () => { for (const frame of frames.splice(0)) frame(); },
    replace: () => { dialog = makeDialog(); return dialog; }, remove: () => { dialog = null; } };
}

test("late dialog activation cannot steal focus from a field chosen by the user", () => {
  const h = harness(); h.open(); h.dialog.second.focus(); h.flush();
  assert.equal(h.document.activeElement, h.dialog.second);
  assert.deepEqual(h.inertTargets, [h.dialog]);
});
test("a requested initial field cannot overwrite the user's newer field selection", () => {
  const h = harness(); h.open("title");
  assert.equal(h.document.activeElement, h.dialog.first);
  h.dialog.second.focus(); h.flush();
  assert.equal(h.document.activeElement, h.dialog.second);
});
test("an obsolete dialog callback cannot activate a replacement dialog", () => {
  const h = harness(); h.open(); h.replace(); h.flush();
  assert.equal(h.document.activeElement, null);
  assert.equal(h.inertTargets.length, 0);
});
test("ordinary dialog opening still establishes modal focus and background isolation", () => {
  const h = harness(); h.open(); h.flush();
  assert.equal(h.document.activeElement, h.dialog);
  assert.deepEqual(h.inertTargets, [h.dialog]);
});
test("explicit initial field focus still works when the user has not moved it", () => {
  const h = harness(); h.open("title"); h.flush();
  assert.equal(h.document.activeElement, h.dialog.first);
  assert.deepEqual(h.inertTargets, [h.dialog]);
});
test("closing before activation does not revive a removed modal", () => {
  const h = harness(); h.open(); h.remove(); h.flush();
  assert.equal(h.document.activeElement, null);
  assert.equal(h.inertTargets.length, 0);
});

const restoreStart = appSource.indexOf("function restoreRenderInteractionState(");
const restoreEnd = appSource.indexOf("\nfunction dialogRenderSelector(", restoreStart);
function renderHarness({ modal = false, selected = false, generation = 1 } = {}) {
  const frames = [], roots = [], selections = [], pageScrolls = [];
  const document = { body: { classList: { add() {} } }, documentElement: {} };
  const input = { isConnected: true, focus() { document.activeElement = this; },
    setSelectionRange(...values) { selections.push(values); } };
  const dialog = { isConnected: true, focus() { document.activeElement = this; } };
  const app = { querySelector: selector => selector === '[aria-modal="true"]' && modal ? dialog : null };
  app.focus = () => { document.activeElement = app; };
  document.activeElement = selected ? input : document.body;
  const context = vm.createContext({ app, document, renderGeneration: generation,
    window: { scrollTo(x, y) { pageScrolls.push(y); } }, getEvent: () => null,
    requestAnimationFrame: callback => frames.push(callback), setDialogBackgroundInert() {},
    findFocusReplacement: (root, identity) => {
      roots.push(root);
      return identity?.id === "app" ? (root === app ? app : null) : input;
    }
  });
  vm.runInContext(appSource.slice(restoreStart, restoreEnd), context);
  return { document, input, dialog, app, roots, selections, pageScrolls, context,
    restore: (focus = { selectionStart: 0, selectionEnd: 0 }) => context.restoreRenderInteractionState({ focus, pageScrollY: 277 }, 1),
    flush: () => { for (const frame of frames.splice(0)) frame(); } };
}
test("late render restoration preserves the user's live field and cursor selection", () => {
  const h = renderHarness({ selected: true }); h.restore(); h.flush();
  assert.equal(h.document.activeElement, h.input);
  assert.equal(h.selections.length, 0, "an old selection must not replace a newer caret");
});
test("render restoration cannot return focus or page scroll through a newly opened modal", () => {
  const h = renderHarness({ modal: true }); h.restore({ id: "app" }); h.flush();
  assert.deepEqual(h.pageScrolls, []);
  assert.deepEqual(h.roots, []);
  assert.notEqual(h.document.activeElement, h.app);
});
test("ordinary rerender still restores a detached input's focus and selection", () => {
  const h = renderHarness(); h.restore({ selectionStart: 2, selectionEnd: 4 }); h.flush();
  assert.equal(h.document.activeElement, h.input);
  assert.deepEqual(h.selections, [[2, 4]]);
});
test("a stale render generation cannot restore any focus", () => {
  const h = renderHarness({ generation: 2 }); h.restore(); h.flush();
  assert.equal(h.roots.length, 0);
  assert.equal(h.document.activeElement, h.document.body);
});

const reactivateStart = appSource.indexOf("function reactivateDialogAfterRender(");
assert.ok(reactivateStart >= 0 && start > reactivateStart);
function reactivationHarness({ backgroundMatch = false } = {}) {
  const frames = [];
  const document = { activeElement: null, body: { classList: { contains: () => true, add() {} } } };
  const element = name => ({ name, closest: () => null, focus() { document.activeElement = this; } });
  const background = element("background-field");
  const makeDialog = () => {
    const title = element("title"), body = element("body");
    return { ...element("dialog"), title, body, scrollTop: 0,
      contains: target => [title, body].includes(target),
      querySelector: selector => selector === "title" ? title : null };
  };
  let dialog = makeDialog();
  const context = vm.createContext({ document, window: {}, dialogReturnFocus: {},
    app: { querySelector: selector => selector === ".event-modal" ? dialog :
      selector === "title" ? (backgroundMatch ? background : dialog?.title) : null },
    requestAnimationFrame: callback => frames.push(callback), setDialogBackgroundInert() {}
  });
  vm.runInContext(appSource.slice(reactivateStart, end), context);
  return { document, get dialog() { return dialog; }, background,
    run: () => context.reactivateDialogAfterRender(".event-modal", "title", 40),
    replace: () => { dialog = makeDialog(); },
    flush: () => { for (const callback of frames.splice(0)) callback(); } };
}

test("a validation rerender cannot steal the user's newer field focus or scroll", () => {
  const h = reactivationHarness(); h.run();
  h.dialog.body.focus(); h.dialog.scrollTop = 90; h.flush();
  assert.equal(h.document.activeElement, h.dialog.body);
  assert.equal(h.dialog.scrollTop, 90);
});
test("an obsolete reactivation cannot focus or scroll a replacement modal", () => {
  const h = reactivationHarness(); h.run(); h.replace(); h.flush();
  assert.equal(h.document.activeElement, null);
  assert.equal(h.dialog.scrollTop, 0);
});
test("reactivation finds its requested field only inside its own modal", () => {
  const h = reactivationHarness({ backgroundMatch: true }); h.run(); h.flush();
  assert.equal(h.document.activeElement, h.dialog.title);
  assert.equal(h.dialog.scrollTop, 40);
});
test("ordinary reactivation still focuses its requested field and restores scroll", () => {
  const h = reactivationHarness(); h.run(); h.flush();
  assert.equal(h.document.activeElement, h.dialog.title);
  assert.equal(h.dialog.scrollTop, 40);
});
