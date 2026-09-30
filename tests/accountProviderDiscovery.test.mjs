import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource as readFile } from "./helpers/readSource.mjs";

// Run the production request, state transition and rendering boundary. An
// alternate source is only for demonstrating the pre-fix regression.
const source = await readFile(process.env.AUTH_PROVIDER_TEST_SOURCE || "src/publicAccountAuthLayer.mjs", "utf8");
const declarations = source.slice(source.indexOf('const GATE_ID ='), source.indexOf('globalThis.SogrimAccountProfile'));
const discoveryStart = source.search(/async function (?:providerEnabled|readAccountProviderSettings)\(/);
const discovery = source.slice(discoveryStart, source.indexOf('function canResumeOffline(', discoveryStart));
const platforms = source.slice(source.indexOf('function isNativeAndroid('), source.indexOf('async function renderWebGoogleButton('));
const gateRenderer = source.slice(source.indexOf('function renderAccountGate('), source.indexOf('function renderAccountRecoveryGate('));

function harness({ platform = "ios", device = "iPhone", responses = [] } = {}) {
  let calls = 0;
  let lastResponse = responses.at(-1);
  let renderedGate = null;
  const timers = new Map();
  let timerId = 0;
  const nodes = new Map();
  const email = { hidden: false };
  const toggle = { hidden: false, setAttribute() {} };
  const slot = {
    html: "",
    querySelector(selector) { return nodes.get(selector) ?? null; },
    insertAdjacentHTML(_position, html) { this.html += html; parse(html); },
    set innerHTML(html) { this.html = html; nodes.clear(); parse(html); },
    get innerHTML() { return this.html; }
  };
  function parse(html) {
    for (const [selector, marker] of [
      ['[data-account-action="google"]', 'data-account-action="google"'],
      ['[data-account-google-control]', 'data-account-google-control'],
      ['[data-account-action="apple"]', 'data-account-action="apple"'],
      ['[data-account-provider-status]', 'data-account-provider-status']
    ]) {
      if (html.includes(marker)) nodes.set(selector, {
        classList: { contains: () => true },
        remove() { nodes.delete(selector); }
      });
    }
  }
  const context = vm.createContext({
    AbortController, URL, console,
    Capacitor: { isNativePlatform: () => platform !== "web", getPlatform: () => platform },
    navigator: { userAgent: device === "iPad" ? "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    window: {
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout(id) { timers.delete(id); }
    },
    document: {
      getElementById(id) { return id === "account-email-auth" ? email : { remove() {} }; },
      querySelector(selector) {
        if (selector === "[data-google-auth-slot]") return slot;
        if (selector === '[data-account-action="toggle-email"]') return toggle;
        return { setAttribute() {}, remove() {} };
      },
      createElement() { return { setAttribute() {}, querySelector: () => ({ addEventListener() {} }) }; },
      body: { append(gate) { renderedGate = gate; } }
    },
    async fetch(_url, { signal }) {
      calls++;
      const response = responses.length ? responses.shift() : lastResponse;
      lastResponse = response;
      if (response === "timeout") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      if (response === "failure") throw new Error("network failure");
      if (response === "http-error") return { ok: false };
      return { ok: true, json: async () => ({ external: response }) };
    },
    renderWebGoogleButton: async () => {}, prepareNativeGoogleSignIn: async () => {},
    accountInviteContext: () => null, accountInviteMarkup: () => "", iconSvg: () => "", googleIcon: () => "",
    escapeHtml: value => value, escapeAttribute: value => value,
    handleAccountSubmit() {}, markAccountAuthReady() {}, focusAccountInput() {}
  });
  vm.runInContext(declarations + platforms + discovery + gateRenderer, context);
  vm.runInContext(`runtimeConfig = { storage: { url: "https://fixture.supabase.co", anonKey: "fixture-public-key" }, auth: { googleClientId: "web-client", googleIosClientId: "ios-client" }, launch: { authEmailDeliveryReady: true } };`, context);
  const run = code => vm.runInContext(code, context);
  // Anchor on the setup assignment, allowing the fix to add platform gating.
  const setupStart = source.indexOf('  googleEnabled =', source.indexOf('removeSessionValue(AUTH_CHANGED_MARKER)'));
  run(source.slice(setupStart, source.indexOf('  // Start preparing Google', setupStart)));
  slot.innerHTML = run('providerOptionsMarkup()');
  return {
    run, slot, nodes, email, toggle,
    get calls() { return calls; },
    snapshot: () => run('({ google: googleEnabled, apple: appleEnabled, markup: providerOptionsMarkup() })'),
    render(mode = "login") { run(`renderAccountGate({mode: ${JSON.stringify(mode)}})`); return renderedGate.innerHTML; },
    refresh: () => run('refreshProviderOptions()'),
    async tick() {
      await new Promise(resolve => setImmediate(resolve));
      const pending = [...timers.values()];
      timers.clear();
      for (const timer of pending) timer.fn();
      await new Promise(resolve => setImmediate(resolve));
    },
    async finish(promise) {
      for (let i = 0; i < 12; i++) await this.tick();
      await promise;
    }
  };
}

for (const device of ["iPhone", "iPad"]) {
  test(`${device} native startup never offers Google without confirmed Apple and keeps email usable`, async () => {
    const app = harness({ device, responses: [{ google: true, apple: true }] });
    assert.equal(app.snapshot().google, false, "Google must wait for equivalent Apple login");
    assert.equal(app.snapshot().apple, false, "unconfirmed Apple must not be offered");
    for (const mode of ["login", "signup"]) {
      const html = app.render(mode);
      assert.doesNotMatch(html, /class="account-email-auth" hidden/);
      assert.match(html, /name="email"/);
      assert.match(html, /name="password"/);
      assert.match(html, /data-account-mode="signup"/);
    }
    await app.refresh();
    assert.equal(app.calls, 1, "one settings response must decide both providers");
    assert.equal(app.snapshot().google, true);
    assert.equal(app.snapshot().apple, true);
    assert.match(app.snapshot().markup, /data-account-action="apple"/);
  });
}

test("an explicitly disabled Apple provider cannot leave native Google alone or expose a broken Apple button", async () => {
  const app = harness({ responses: [{ google: true, apple: false }] });
  await app.refresh();
  assert.equal(app.snapshot().google, false);
  assert.equal(app.snapshot().apple, false);
  assert.doesNotMatch(app.render(), /class="account-email-auth" hidden/);
});

for (const failure of ["failure", "http-error", "timeout"]) {
  test(`native provider discovery retries ${failure} and recovers both providers`, async () => {
    const app = harness({ responses: [failure, { google: true, apple: true }] });
    const refresh = app.refresh();
    assert.equal(app.snapshot().google, false);
    assert.equal(app.snapshot().apple, false);
    await app.finish(refresh);
    assert.equal(app.calls, 2);
    assert.equal(app.snapshot().google, true);
    assert.equal(app.snapshot().apple, true);
  });
}

test("persistent discovery failure offers retry and leaves email signup and sign-in available", async () => {
  const app = harness({ responses: ["failure"] });
  await app.finish(app.refresh());
  assert.equal(app.calls, 3, "automatic retry must be bounded");
  assert.equal(app.snapshot().google, false);
  assert.equal(app.snapshot().apple, false);
  assert.match(app.snapshot().markup, /data-account-action="retry-providers"/);
  assert.doesNotMatch(app.render(), /class="account-email-auth" hidden/);
});

test("missing Apple availability is unknown and retries instead of confirming Google alone", async () => {
  const app = harness({ responses: [{ google: true }, { google: true, apple: true }] });
  await app.finish(app.refresh());
  assert.equal(app.calls, 2);
  assert.equal(app.snapshot().apple, true);
  assert.equal(app.snapshot().google, true);
});

test("overlapping refreshes share one provider settings request", async () => {
  const app = harness();
  app.run('globalThis.pendingRequests = 0; fetch = () => { pendingRequests++; return new Promise(resolve => { globalThis.releaseSettings = resolve; }); };');
  const first = app.refresh();
  const second = app.refresh();
  assert.equal(app.run('pendingRequests'), 1);
  app.run('releaseSettings({ok: true, json: async () => ({external: {google: true, apple: true}})});');
  await Promise.all([first, second]);
  assert.equal(app.snapshot().google, true);
  assert.equal(app.snapshot().apple, true);
});

test("transient refresh failure retains already confirmed Apple and the pressed Google node", async () => {
  const app = harness({ responses: [{ google: true, apple: true }] });
  await app.refresh();
  const googleNode = app.nodes.get('[data-account-action="google"]');
  app.run('fetch = async () => { throw new Error("offline"); }');
  await app.finish(app.refresh());
  assert.equal(app.snapshot().apple, true);
  assert.equal(app.snapshot().google, true);
  assert.equal(app.nodes.get('[data-account-action="google"]'), googleNode);
});

test("explicit provider disable after a successful check reveals email without replacing its form", async () => {
  const app = harness({ responses: [{ google: true, apple: true }] });
  await app.refresh();
  app.email.hidden = true;
  app.run('emailAuthExpanded = false; fetch = async () => ({ok: true, json: async () => ({external: {google: true, apple: false}})});');
  await app.refresh();
  assert.equal(app.snapshot().google, false);
  assert.equal(app.snapshot().apple, false);
  assert.equal(app.email.hidden, false);
});

for (const platform of ["android", "web"]) {
  test(`${platform} retains configured Google login when Apple is disabled`, async () => {
    const app = harness({ platform, responses: [{ google: true, apple: false }] });
    assert.equal(app.snapshot().google, true);
    await app.refresh();
    assert.equal(app.snapshot().google, true);
    assert.equal(app.snapshot().apple, false);
  });
}
