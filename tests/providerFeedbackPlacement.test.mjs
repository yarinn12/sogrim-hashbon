import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile("src/publicAccountAuthLayer.mjs", "utf8")).replaceAll("\r\n", "\n");
const start = source.indexOf("function renderAccountGate(");
const end = source.indexOf("\n}\n", start) + 2;
assert.ok(start >= 0 && end > start);

test("provider rejection is rendered beside the provider controls rather than beneath the expanded email form", () => {
  let gate;
  const context = vm.createContext({
    runtimeConfig: { launch: { authEmailDeliveryReady: true } },
    googleEnabled: true, appleEnabled: true, emailAuthExpanded: true,
    GATE_ID: "auth-gate",
    document: {
      querySelector: () => null, getElementById: () => null,
      createElement: () => ({ setAttribute() {}, querySelector: () => null }),
      body: { append: element => { gate = element; } }
    },
    accountInviteContext: () => null, accountInviteMarkup: () => "",
    providerOptionsMarkup: () => '<button id="provider-control">Google</button>',
    escapeHtml: value => value, escapeAttribute: value => value,
    iconSvg: () => "", markAccountAuthReady() {},
    renderWebGoogleButton: async () => {}, focusAccountInput() {}
  });
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext('renderAccountGate({ error: "Provider rejected", providerFeedback: true })', context);
  const feedback = gate.innerHTML.indexOf('id="account-auth-feedback"');
  const provider = gate.innerHTML.indexOf('id="provider-control"');
  assert.ok(feedback >= 0 && feedback < provider, "the visible failure must precede the next provider attempt");
  assert.equal(gate.innerHTML.split('id="account-auth-feedback"').length - 1, 1);
  assert.match(gate.innerHTML, /role="alert">Provider rejected/);
});
