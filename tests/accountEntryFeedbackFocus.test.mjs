import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderAccountEntryView } from "../src/ui/accountEntryPresentation.mjs";
import { iconSvg } from "../src/uiIcons.mjs";

// The override supports an isolated OLD run without modifying the working tree.
const sourcePath = process.env.QA_ACCOUNT_FEEDBACK_FOCUS_SOURCE
  || new URL("../src/publicAccountAuthLayer.mjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8").replaceAll("\r\n", "\n");
const functionSource = (name, { optional = false } = {}) => {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0 && optional) return "";
  assert.ok(start >= 0, `missing actual account function ${name}`);
  const tail = source.slice(start);
  const end = tail.search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end);
};
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function createHarness({ desktop = true, providers = false } = {}) {
  const frames = [];
  const gates = [];
  const formSubmissions = [];
  const document = {
    activeElement: null,
    documentElement: {},
    querySelector(selector) {
      if (selector === "#app") return { setAttribute() {} };
      return null;
    },
    getElementById(id) {
      return gates.findLast((gate) => gate.id === id && gate.isConnected) ?? null;
    },
    createElement(tag) {
      assert.equal(tag, "section");
      const gate = {
        id: "", className: "", isConnected: false,
        attributes: new Map(), inputs: new Map(), paragraphs: new Map(),
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        remove() { this.isConnected = false; },
        querySelector(selector) {
          if (selector === "form") return this.form;
          if (selector.startsWith("#")) return this.paragraphs.get(selector.slice(1)) ?? null;
          if (selector === 'input[name="email"], input') return this.inputs.get("email") ?? this.inputs.values().next().value ?? null;
          const name = /^input\[name="([\w-]+)"\]$/.exec(selector)?.[1];
          return name ? this.inputs.get(name) ?? null : null;
        }
      };
      const child = (attributes = {}) => ({
        ...attributes, focusCalls: [], scrollCalls: [], attributes: new Map(),
        get isConnected() { return gate.isConnected; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        focus(options) { this.focusCalls.push(options); document.activeElement = this; },
        scrollIntoView(options) { this.scrollCalls.push(options); }
      });
      Object.defineProperty(gate, "innerHTML", {
        get() { return this.markup; },
        set(html) {
          this.markup = html;
          // Nodes are derived from the real rendered view, including its ID and
          // role choices; the fixture only models focus/scroll connection state.
          for (const match of html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
            const id = /\bid="([^"]+)"/.exec(match[1])?.[1];
            if (id) this.paragraphs.set(id, child({ id, role: /\brole="([^"]+)"/.exec(match[1])?.[1], textContent: match[2] }));
          }
          for (const match of html.matchAll(/<input\b[^>]*\bname="([^"]+)"[^>]*>/g)) {
            this.inputs.set(match[1], child({ name: match[1] }));
          }
          if (html.includes("<form")) this.form = {
            addEventListener(event, handler) { formSubmissions.push({ event, handler }); }
          };
        }
      });
      return gate;
    }
  };
  document.body = {
    append(gate) { gate.isConnected = true; gates.push(gate); }
  };
  document.activeElement = document.body;
  const requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: desktop }), requestAnimationFrame },
    requestAnimationFrame,
    GATE_ID: "public-account-auth-gate",
    runtimeConfig: { launch: { authEmailDeliveryReady: true } },
    googleEnabled: providers, appleEnabled: false, emailAuthExpanded: false,
    accountInviteContext: () => null, accountInviteMarkup: () => "",
    providerOptionsMarkup: () => providers ? '<button type="button" data-account-action="google">Google</button>' : "",
    renderAccountEntryView, escapeHtml, escapeAttribute: escapeHtml, iconSvg,
    handleAccountSubmit() {}, markAccountAuthReady() {}, renderWebGoogleButton: async () => {},
    fetch() { throw new Error("focus regression must not access a network"); }
  };
  runInNewContext([
    functionSource("renderAccountGate"),
    functionSource("focusAccountInput"),
    functionSource("focusAccountFeedback", { optional: true })
  ].join("\n"), context);
  return {
    frames, gates, document, formSubmissions,
    render(model = {}) {
      context.renderAccountGate(model);
      return gates.at(-1);
    },
    focusFeedback(gate) { context.focusAccountFeedback(gate); },
    focusInput(gate, options) { context.focusAccountInput(gate, options); },
    flush() {
      let count = 0;
      while (frames.length) {
        assert.ok(count++ < 20, "focus scheduling must settle");
        frames.shift()();
      }
    }
  };
}

test("successful account status targets and reveals the rendered feedback instead of reopening the input", () => {
  const h = createHarness();
  const gate = h.render({ message: "שלחנו קישור לאיפוס הסיסמה." });
  const feedback = gate.paragraphs.get("account-auth-feedback");
  assert.equal(feedback.role, "status");
  assert.equal(feedback.textContent, "שלחנו קישור לאיפוס הסיסמה.");
  assert.equal(feedback.focusCalls.length, 0, "wait for the rendered gate's frame");
  h.flush();
  assert.equal(feedback.focusCalls.length, 1, "successful feedback must receive focus");
  assert.equal(feedback.attributes.get("tabindex"), "-1");
  assert.equal(feedback.focusCalls[0]?.preventScroll, true);
  assert.equal(feedback.scrollCalls.length, 1);
  assert.equal(feedback.scrollCalls[0].block, "nearest");
  assert.equal(gate.inputs.get("email").focusCalls.length, 0);
  assert.equal(h.document.activeElement, feedback);
  assert.equal(h.formSubmissions[0].event, "submit", "the original submit binding stays installed");
});

test("ordinary account entry keeps the existing desktop email autofocus behavior", () => {
  const h = createHarness();
  const gate = h.render();
  h.flush();
  assert.equal(gate.inputs.get("email").focusCalls.length, 1);
  assert.equal(gate.inputs.get("password").focusCalls.length, 0);
  assert.equal(h.document.activeElement, gate.inputs.get("email"));
  assert.equal(gate.paragraphs.has("account-auth-feedback"), false);
});

test("inline validation retains its explicit mobile field-focus path and error association", () => {
  const h = createHarness({ desktop: false });
  const gate = h.render({ error: "צריך לתקן את הסיסמה.", errorFieldName: "password" });
  assert.equal(h.frames.length, 0, "default gate rendering must not open the mobile keyboard");
  h.focusInput(gate, { includeMobile: true, fieldName: "password" });
  h.flush();
  const password = gate.inputs.get("password"), error = gate.paragraphs.get("account-auth-feedback");
  assert.equal(password.focusCalls.length, 1);
  assert.equal(password.attributes.get("aria-describedby"), error.id);
  assert.equal(password.scrollCalls[0].block, "center");
  assert.equal(error.role, "alert");
  assert.equal(error.focusCalls.length, 0);
});

test("a provider error without status does not acquire the new mobile feedback focus behavior", () => {
  const h = createHarness({ desktop: false, providers: true });
  const gate = h.render({ providerFeedback: true, error: "הכניסה עם Google לא הצליחה." });
  h.flush();
  const error = gate.paragraphs.get("account-auth-feedback");
  assert.equal(error.role, "alert");
  assert.equal(error.focusCalls.length, 0);
  assert.equal(error.scrollCalls.length, 0);
  assert.equal(gate.inputs.get("email").focusCalls.length, 0);
});

test("a detached account gate cannot focus or scroll stale feedback from its scheduled frame", () => {
  const h = createHarness();
  const gate = h.render({ message: "שלחנו קישור אימות." });
  const feedback = gate.paragraphs.get("account-auth-feedback");
  gate.remove();
  h.flush();
  assert.equal(feedback.focusCalls.length, 0);
  assert.equal(feedback.scrollCalls.length, 0);
  assert.equal(h.document.activeElement, h.document.body);
});

test("latest replacement status owns focus while the removed predecessor stays untouched", () => {
  const h = createHarness();
  const previous = h.render({ message: "הודעה קודמת." });
  const latest = h.render({ message: "שלחנו קישור חדש." });
  assert.equal(previous.isConnected, false);
  h.flush();
  const oldFeedback = previous.paragraphs.get("account-auth-feedback");
  const newFeedback = latest.paragraphs.get("account-auth-feedback");
  assert.equal(oldFeedback.focusCalls.length, 0);
  assert.equal(oldFeedback.scrollCalls.length, 0);
  assert.equal(newFeedback.focusCalls.length, 1, "the new successful status must own focus");
  assert.equal(newFeedback.scrollCalls[0].block, "nearest");
  assert.equal(h.document.activeElement, newFeedback);
});

test("feedback focus helper is safe for an absent gate or a gate without a feedback node", () => {
  const h = createHarness({ desktop: false });
  const gate = h.render();
  h.focusFeedback(null);
  h.focusFeedback(gate);
  assert.equal(h.frames.length, 0);
  assert.equal(h.document.activeElement, h.document.body);
});
