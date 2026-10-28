import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { iconSvg } from "../src/uiIcons.mjs";
const source = readFileSync(process.env.ACCESSIBILITY_TEST_LAYER || "src/publicAccessibilityLayer.mjs", "utf8"), uiPath = new URL("../src/ui/accessibilityPresentation.mjs", import.meta.url), view = existsSync(uiPath) ? await import(uiPath) : null;
function fn(name) {
  const a = source.indexOf("function " + name + "(");
  assert.ok(a >= 0, name);
  const next = source.slice(a + 1).search(/\r?\nfunction /);
  return source.slice(a, next < 0 ? source.length : a + 1 + next);
}
function open() {
  const calls = [], html = [];
  class Element {
    constructor(name) {
      this.name = name;
      this.isConnected = true;
    }
    focus(options) {
      calls.push({ focus: this.name, options });
      document.activeElement = this;
    }
    contains(e) {
      return e === this;
    }
  }
  const trigger = new Element("trigger"), center = new Element("center");
  let mounted = false;
  const document = { activeElement: trigger, querySelector: (s) => s === ".accessibility-center" ? center : mounted ? {} : null, body: { insertAdjacentHTML: (position, value) => {
    assert.equal(position, "beforeend");
    html.push(value);
    mounted = true;
  } }, documentElement: { classList: { add: (value) => calls.push(value) } } };
  const context = { document, HTMLElement: Element, BACKDROP_SELECTOR: ".accessibility-center-backdrop", RETURN_FOCUS_STORAGE_KEY: "return-focus", window: { sessionStorage: { setItem: (...a) => calls.push(a) }, setTimeout: () => {
  } }, returnFocus: null, iconSvg, renderAccessibilityCenterView: view?.renderAccessibilityCenterView, setBackgroundInert: (v) => calls.push({ inert: v }), publishAccessibilityCenterState: (v) => calls.push({ open: v }), syncAccessibilityControls: () => calls.push("sync"), pushAccessibilityHistoryState: () => calls.push("history"), requestAnimationFrame: () => {
  } };
  const helper = source.includes("function renderTextSizeOption(") ? fn("renderTextSizeOption") : "";
  runInNewContext(helper + "\n" + fn("openAccessibilityCenter") + ";openAccessibilityCenter(trigger)", { ...context, trigger });
  return { html: html[0], calls };
}
test("accessibility opens the approved direct copy and shared back icon", () => {
  const { html } = open();
  assert.match(html, /aria-label="חזרה לאפליקציה"/);
  assert.ok(html.includes(iconSvg("chevron-left")));
  assert.match(html, /השינויים חלים מיד ונשמרים במכשיר הזה/);
  assert.doesNotMatch(html, /תצוגה נוחה יותר|accessibility-center-eyebrow|מידע, התאמות ויצירת קשר/);
  assert.ok(html.indexOf("accessibility-done-button") < html.indexOf("accessibility-reset-button"));
});
test("accessibility presentation retains the actual preference values, switches and statement target", () => {
  const { html } = open();
  assert.deepEqual([...html.matchAll(/value="([^"]+)"/g)].map((m) => m[1]), ["system", "large", "extra-large"]);
  assert.equal([...html.matchAll(/role="switch"/g)].length, 2);
  for (const s of ["data-accessibility-contrast", "data-accessibility-motion", "data-reset-accessibility", "data-accessibility-status", 'role="status" aria-live="polite"', 'href="./accessibility.html"', 'aria-labelledby="accessibility-center-title"', 'aria-describedby="accessibility-center-description"']) assert.ok(html.includes(s), s);
  assert.equal([...html.matchAll(/data-close-accessibility/g)].length, 2);
});
test("the actual opening adapter preserves inertness, history, control synchronization and initial focus", () => {
  const h = open();
  assert.ok(h.calls.some((c) => c?.inert === true));
  assert.ok(h.calls.some((c) => c?.open === true));
  assert.ok(h.calls.includes("sync"));
  assert.ok(h.calls.includes("history"));
  const focus = h.calls.find((c) => c?.focus);
  assert.equal(focus.focus, "center");
  assert.equal(focus.options.preventScroll, true);
});
test("the pure accessibility presentation ships in both offline inventories", () => {
  assert.ok(view?.renderAccessibilityCenterView, "Missing pure accessibility view");
  const sw = readFileSync("sw.js", "utf8");
  assert.equal(sw.split('"/src/ui/accessibilityPresentation.mjs"').length - 1, 2);
  const ui = readFileSync(uiPath, "utf8");
  assert.doesNotMatch(ui, /localStorage|sessionStorage|fetch\(|saveAccessibilityPreferences|applyAccessibilityPreferences/);
});
