import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/publicFramerMotionLayer.mjs", import.meta.url), "utf8");

function node(classes = "", attributes = {}) {
  const tokens = new Set(classes.split(" ").filter(Boolean));
  const element = {
    attributes, children: [], textContent: "", connected: true, classWrites: 0,
    classList: {
      contains: (token) => tokens.has(token),
      add(token) { element.classWrites += 1; tokens.add(token); },
      remove(token) { element.classWrites += 1; tokens.delete(token); },
      [Symbol.iterator]: () => tokens.values()
    },
    getAttribute: (key) => attributes[key] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest(selector) { return selector === "[data-event-id]" && attributes["data-event-id"] ? element : null; },
    matches(selector) { return selector === "button:disabled" ? attributes.disabled === true : selector === "summary" && tokens.has("summary"); }
  };
  return element;
}

function harness() {
  const h = { rows: [], busy: [], details: [], money: [], calls: [], frames: [], reduced: false, queries: 0, screenReads: 0 };
  h.screen = node("screen", { "data-screen-kind": "event", "data-event-id": "event-a" });
  h.hero = null;
  const root = node();
  const document = {
    documentElement: root, hidden: false,
    contains: (element) => element.connected,
    querySelector(selector) {
      h.queries += 1;
      if (selector === "#app > .screen") { h.screenReads += 1; return h.screen; }
      if (selector === ".product-home-screen .top") return h.hero;
      return null;
    },
    querySelectorAll(selector) {
      h.queries += 1;
      if (selector.includes(".expense-row[data-expense-id]")) return h.rows;
      if (selector.startsWith("#app [aria-busy]")) return h.busy;
      if (selector === ".motion-control-busy") return h.busy.filter((element) => element.classList.contains("motion-control-busy"));
      if (selector === "details") return h.details;
      if (selector.includes(".summary-value")) return h.money;
      return [];
    }
  };
  h.context = vm.createContext({
    document,
    window: { matchMedia: () => ({ matches: h.reduced }), setTimeout() {} },
    requestAnimationFrame(callback) { h.frames.push(callback); },
    Motion: {
      animate(target, keyframes, options) {
        let finish;
        const finished = new Promise((resolve) => { finish = resolve; });
        const control = { completeCalls: 0, complete() { this.completeCalls += 1; finish(); }, then: (resolve, reject) => finished.then(resolve, reject) };
        h.calls.push({ target, keyframes, options, control });
        return control;
      }
    }
  });
  vm.runInContext(source.replace(/\nstartMotionPolish\(\);\s*$/, ""), h.context);
  h.frame = () => { const pending = h.frames.splice(0); pending.forEach((callback) => callback()); };
  return h;
}

test("unchanged busy controls do not rewrite their class on every enhancement", () => {
  const h = harness();
  const button = node("", { "aria-busy": "true" });
  h.busy = [button];
  for (let i = 0; i < 100; i += 1) h.context.syncBusyStates();
  assert.equal(button.classWrites, 1, "repeated writes feed the class observer and keep scanning the whole screen");
  button.attributes["aria-busy"] = "false";
  h.context.syncBusyStates();
  assert.equal(button.classList.contains("motion-control-busy"), false);
  assert.equal(button.classWrites, 2);
});

test("a batch of new rows animates at most six, not six more on each observer pass", () => {
  const h = harness();
  h.context.animateNewRows();
  h.rows = Array.from({ length: 18 }, (_, index) => node("expense-row", { "data-expense-id": `expense-${index}` }));
  for (let i = 0; i < 4; i += 1) h.context.animateNewRows();
  assert.equal(h.calls.length, 6);
  assert.equal(h.rows.filter((row) => row.classList.contains("motion-row-added")).length, 6);
});

test("rows seen with reduced motion do not replay in batches when motion is enabled", () => {
  const h = harness();
  h.context.animateNewRows();
  h.reduced = true;
  h.rows = Array.from({ length: 12 }, (_, index) => node("expense-row", { "data-expense-id": `expense-${index}` }));
  h.context.animateNewRows();
  h.reduced = false;
  h.context.animateNewRows();
  assert.equal(h.calls.length, 0);
});

test("notes in one event have distinct motion identities", () => {
  const h = harness();
  const first = node("event-note-row", { "data-event-id": "event-a", "data-note-id": "note-a" });
  const second = node("event-note-row", { "data-event-id": "event-a", "data-note-id": "note-b" });
  h.rows = [first];
  h.context.animateNewRows();
  h.rows.push(second);
  h.context.animateNewRows();
  assert.notEqual(h.context.rowKey(first), h.context.rowKey(second));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].target, second);
});

test("navigating to an existing list does not replay its rows as newly added", () => {
  const h = harness();
  h.context.animateNewRows();
  h.screen.attributes["data-event-id"] = "event-b";
  h.rows = [node("expense-row", { "data-expense-id": "existing-b" })];
  h.context.animateNewRows();
  assert.equal(h.calls.length, 0);
});

test("one details opening has a single animation owner", () => {
  const h = harness();
  const panel = node("panel");
  const disclosure = node("details");
  const summary = node("summary");
  summary.closest = (selector) => selector === "details" ? disclosure : summary;
  disclosure.children = [summary, panel];
  disclosure.open = false;
  h.details = [disclosure];
  h.context.animateDisclosureChanges();
  h.context.animateActionFeedback?.({ target: summary, detail: 1 });
  disclosure.open = true;
  h.frame();
  h.context.animateDisclosureChanges();
  assert.equal(h.calls.filter((call) => call.target === panel).length, 1);
});

test("initial home content is visible without a half-second entrance", async () => {
  const h = harness();
  h.hero = node("top");
  h.hero.querySelector = () => ({ textContent: "Welcome" });
  await h.context.animateHomeHero();
  assert.equal(h.calls.length, 0);
});

for (const reason of ["system preference", "app preference", "hidden page", "detached element"]) {
  test(`running motion settles when it is obsolete: ${reason}`, () => {
    const h = harness();
    const panel = node("panel");
    h.context.animateDisclosureElements([panel]);
    assert.equal(h.calls.length, 1);
    if (reason === "system preference") h.reduced = true;
    if (reason === "app preference") h.context.document.documentElement.classList.add("accessibility-reduced-motion");
    if (reason === "hidden page") h.context.document.hidden = true;
    if (reason === "detached element") panel.connected = false;
    assert.equal(typeof h.context.finishInactiveMotion, "function");
    h.context.finishInactiveMotion();
    assert.equal(h.calls[0].control.completeCalls, 1);
    h.context.finishInactiveMotion();
    assert.equal(h.calls[0].control.completeCalls, 1, "completion releases ownership exactly once");
  });
}

test("repeated animation on one target releases the previous controller", async () => {
  const h = harness();
  const panel = node("panel");
  h.context.animateDisclosureElements([panel]);
  h.context.animateDisclosureElements([panel]);
  assert.equal(h.calls[0].control.completeCalls, 1);
  await Promise.resolve();
  await Promise.resolve();
  h.reduced = true;
  h.context.finishInactiveMotion();
  assert.equal(h.calls[1].control.completeCalls, 1, "old completion cannot release the newer controller");
});

test("hidden pages do not run the whole enhancement scan", () => {
  const h = harness();
  h.context.document.hidden = true;
  h.context.scheduleFramerMotionEnhancement();
  h.frame();
  assert.equal(h.queries, 0);
});

test("120 money values share one screen identity read per enhancement", () => {
  const h = harness();
  h.money = Array.from({ length: 120 }, (_, index) => {
    const amount = node("amount");
    amount.textContent = String(index);
    return amount;
  });
  h.context.animateMoneyChanges();
  assert.equal(h.screenReads, 1);
  const before = h.context.moneyMotionKey(h.money[0], 0);
  assert.equal(before, h.context.moneyMotionKey(h.money[0], 0, "event:event-a:"));
});

test("remembered row identities stay bounded during a long session", () => {
  const h = harness();
  for (let index = 0; index < 2000; index += 1) {
    h.context.rememberRow(node("expense-row", { "data-expense-id": `expense-${index}` }));
  }
  assert.equal(vm.runInContext("rememberedRowKeys.size", h.context), 1024);
});

test("successful motion releases its controller without forcing completion again", async () => {
  const h = harness();
  h.context.animateDisclosureElements([node("panel")]);
  h.calls[0].control.complete();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  h.reduced = true;
  h.context.finishInactiveMotion();
  assert.equal(h.calls[0].control.completeCalls, 1);
  assert.equal(vm.runInContext("activeMotionAnimations.size", h.context), 0);
});
