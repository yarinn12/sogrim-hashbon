import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

function harness() {
  const frames = [], timers = [], scrolls = [];
  const h = { modals: [], nodes: [] };
  const document = { activeElement: null };
  class Element {
    constructor(action = "", { modal = false, hidden = false } = {}) {
      this.dataset = { action }; this.isConnected = true; this.modal = modal;
      this.hidden = hidden; this.inert = false; this.disabled = false; this.parent = null;
    }
    focus() { if (!this.blockFocus && !this.inert && !this.disabled) document.activeElement = this; }
    contains(target) { return target === this || target?.parent === this; }
    matches(selector) { return this.modal && selector.includes('role="dialog"'); }
    closest(selector) {
      if (selector.includes("[inert]") || selector.includes("[hidden]")) {
        return (selector.includes("[inert]") && (this.inert || this.parent?.inert)) ||
          (selector.includes("[hidden]") && this.hidden) ? this : null;
      }
      return this.modal ? this : this.parent?.modal ? this.parent : null;
    }
    getClientRects() { return this.hidden ? [] : [{}]; }
    querySelectorAll() { return h.nodes.filter(node => this.contains(node)); }
    querySelector() { return this.querySelectorAll()[0] ?? null; }
  }
  const root = new Element(), body = new Element(), app = new Element();
  body.classList = { open: false, contains() { return this.open; }, remove() { this.open = false; } };
  document.body = body; document.documentElement = root; document.activeElement = body;
  document.querySelectorAll = () => h.modals;
  document.querySelector = () => h.modals[0] ?? null;
  app.querySelectorAll = () => h.nodes;
  app.querySelector = selector => selector.includes("aria-modal") ? h.modals[0] ?? null : h.nodes[0] ?? null;
  const context = vm.createContext({ document, app, HTMLElement: Element,
    state: { currentParticipantId: "owner-a" }, screen: { name: "event", eventId: "event-a" },
    dialogReturnFocus: null, pendingDialogReturnFocus: null, dialogReturnScrollY: 320, pendingDialogReturnScrollY: 0,
    window: { scrollY: 0, scrollTo(x, y) { scrolls.push(y); this.scrollY = y; }, setTimeout: cb => timers.push(cb) },
    requestAnimationFrame: cb => frames.push(cb), clearDialogBackgroundInert() {}
  });
  vm.runInContext(section("function createActionFocusDescriptor(", "function archiveGroupInState(") +
    section("function rememberDialogReturnFocus(", "function setDialogBackgroundInert("), context);
  return Object.assign(h, { context, document, app, Element, frames, scrolls,
    node(action, options) { const n = new Element(action, options); h.nodes.push(n); return n; },
    descriptor: target => context.createActionFocusDescriptor(target),
    restore: descriptor => context.restoreActionFocus(descriptor),
    pending(descriptor) { context.pendingDialogReturnFocus = descriptor; context.restorePendingDialogReturnFocus(); },
    frame() { for (const cb of frames.splice(0)) cb(); },
    timers() { for (const cb of timers.splice(0)) cb(); }
  });
}

for (const path of ["action", "pending"]) {
  test(`${path} return focus preserves a newer field selection`, () => {
    const h = harness(), opener = h.node("open-event-settings"), input = h.node("event-search");
    const descriptor = h.descriptor(opener);
    input.focus();
    if (path === "action") h.restore(descriptor); else h.pending(descriptor);
    assert.equal(h.document.activeElement, input);
  });
  test(`${path} return focus cannot escape an independent modal outside the app`, () => {
    const h = harness(), opener = h.node("open-event-settings"), modal = new h.Element("", { modal: true });
    h.modals = [modal]; modal.focus();
    if (path === "action") h.restore(h.descriptor(opener)); else h.pending(h.descriptor(opener));
    assert.equal(h.document.activeElement, modal);
    assert.equal(h.context.pendingDialogReturnFocus, null);
  });
  test(`${path} return focus cannot follow its old action into another event`, () => {
    const h = harness(), opener = h.node("open-event-settings");
    const descriptor = h.descriptor(opener);
    h.context.screen = { name: "event", eventId: "event-b" };
    if (path === "action") h.restore(descriptor); else h.pending(descriptor);
    assert.equal(h.document.activeElement, h.document.body);
  });
}

test("return focus retry stops when the user chooses another control", () => {
  const h = harness(), opener = h.node("open-event-settings"), input = h.node("search");
  opener.blockFocus = true; h.restore(h.descriptor(opener));
  assert.equal(h.frames.length, 1);
  opener.blockFocus = false; input.focus(); h.frame();
  assert.equal(h.document.activeElement, input);
  assert.equal(h.frames.length, 0);
});

test("return focus from the previous account cannot select a current account control", () => {
  const h = harness(), opener = h.node("open-event-settings"), descriptor = h.descriptor(opener);
  h.context.state.currentParticipantId = "owner-b"; h.restore(descriptor);
  assert.equal(h.document.activeElement, h.document.body);
});

test("ordinary close still restores focus to a connected opener", () => {
  const h = harness(), opener = h.node("open-event-settings");
  h.pending(h.descriptor(opener));
  assert.equal(h.document.activeElement, opener);
});

test("ordinary action return resolves an opener replaced by a same-screen render", () => {
  const h = harness(), opener = h.node("open-event-settings"), descriptor = h.descriptor(opener);
  opener.isConnected = false; h.nodes = [];
  const replacement = h.node("open-event-settings"); h.restore(descriptor);
  assert.equal(h.document.activeElement, replacement);
});

test("closing a confirmation may restore a control inside its remaining parent dialog", () => {
  const h = harness(), modal = new h.Element("", { modal: true }), opener = h.node("delete-note");
  opener.parent = modal; h.modals = [modal]; modal.focus();
  h.restore(h.descriptor(opener));
  assert.equal(h.document.activeElement, opener);
});

test("old close scroll cannot move a newer modal", () => {
  const h = harness(); h.context.deactivateDialog();
  h.document.body.classList.open = true;
  h.modals = [new h.Element("", { modal: true })];
  h.frame(); assert.deepEqual(h.scrolls, []);
});

test("old close scroll cannot jump a newer screen", () => {
  const h = harness(); h.context.deactivateDialog();
  h.context.screen = { name: "profile" }; h.frame();
  assert.deepEqual(h.scrolls, []);
});

test("old close scroll does not undo scrolling performed before its frame", () => {
  const h = harness(); h.context.deactivateDialog();
  h.context.window.scrollY = 75; h.frame();
  assert.deepEqual(h.scrolls, []);
});

test("ordinary close still restores the previous page position", () => {
  const h = harness(); h.context.deactivateDialog(); h.frame();
  assert.deepEqual(h.scrolls, [320]);
});

test("pending focus resolves the exact choice trigger after a rerender", () => {
  const h = harness(), opener = h.node(""); opener.dataset.choiceSelectAction = "event-currency";
  const descriptor = h.descriptor(opener); opener.isConnected = false; h.nodes = [];
  const unrelated = h.node(""); unrelated.dataset.choiceSelectAction = "event-rounding";
  const replacement = h.node(""); replacement.dataset.choiceSelectAction = "event-currency";
  h.pending(descriptor);
  assert.equal(h.document.activeElement, replacement);
});

test("pending focus matches the participant and group, not only the shared action name", () => {
  const h = harness(), opener = h.node("edit-member");
  Object.assign(opener.dataset, { groupId: "group-a", participantId: "person-a" });
  const descriptor = h.descriptor(opener); opener.isConnected = false; h.nodes = [];
  Object.assign(h.node("edit-member").dataset, { groupId: "group-b", participantId: "person-b" });
  const replacement = h.node("edit-member");
  Object.assign(replacement.dataset, { groupId: "group-a", participantId: "person-a" });
  h.pending(descriptor);
  assert.equal(h.document.activeElement, replacement);
});

test("hidden modal markup does not prevent ordinary return focus", () => {
  const h = harness(), opener = h.node("open-event-settings");
  h.modals = [new h.Element("", { modal: true, hidden: true })];
  h.pending(h.descriptor(opener));
  assert.equal(h.document.activeElement, opener);
});

for (const flag of ["disabled", "inert", "hidden"]) {
  test(`return focus never activates a ${flag} target`, () => {
    const h = harness(), opener = h.node("open-event-settings"); opener[flag] = true;
    h.restore(h.descriptor(opener));
    assert.equal(h.document.activeElement, h.document.body);
    assert.equal(h.frames.length, 0);
  });
}

test("dialog return bookkeeping retains the full trigger identity and owner context", () => {
  const h = harness(), opener = h.node("edit-member");
  Object.assign(opener.dataset, { groupId: "group-a", participantId: "person-a" });
  h.context.rememberDialogReturnFocus(opener);
  assert.equal(h.context.dialogReturnFocus.groupId, "group-a");
  assert.equal(h.context.dialogReturnFocus.participantId, "person-a");
  assert.equal(h.context.dialogReturnFocus.returnContext, h.context.dialogReturnContext());
});
