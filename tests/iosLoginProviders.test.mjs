import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicOrigin = "https://app.example.test";
const backendOrigin = "https://project.example.test";
const publicKey = "fixture-public-key-never-print";
const state = "fixture-oauth-state-never-print";
const servicesId = "com.sogrimhashbon.app.web";

function config() {
  return { storage: { mode: "supabase", url: backendOrigin, anonKey: publicKey } };
}

function appleLocation(overrides = {}) {
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.search = new URLSearchParams({
    client_id: servicesId,
    redirect_uri: `${backendOrigin}/auth/v1/callback`,
    scope: "name email",
    state,
    ...overrides
  }).toString();
  return url.toString();
}

function fixture({ publicConfig = config(), settings = { external: { apple: true } }, location = appleLocation(), status = 302, responses = {} } = {}) {
  const requests = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    if (Object.hasOwn(responses, url.pathname)) return responses[url.pathname](options);
    if (url.pathname === "/api/config") return Response.json(publicConfig);
    if (url.pathname === "/auth/v1/settings") return Response.json(settings);
    if (url.pathname === "/auth/v1/authorize") return new Response(null, { status, headers: { location } });
    throw new Error("Unexpected fixture request");
  };
  return { fetchImpl, requests };
}

async function verify(options = {}) {
  const { verifyIosLoginProviders } = await import("../scripts/verify-ios-login-providers.mjs");
  return verifyIosLoginProviders({ publicOrigin, ...options });
}

test("iOS workflow gates the archive and upload on public Apple provider readiness", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ios-testflight.yml", import.meta.url), "utf8");
  const gate = workflow.indexOf("run: npm run qa:ios:providers");
  assert.ok(gate >= 0, "iOS release has no public Apple provider gate");
  assert.ok(gate < workflow.indexOf("- name: Run release checks"), "provider failures must block native preparation");
  assert.ok(gate < workflow.indexOf("- name: Archive signed iOS app"));
  assert.ok(gate < workflow.indexOf("- name: Upload app to TestFlight"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["qa:ios:providers"], "node scripts/verify-ios-login-providers.mjs");
});

test("public provider gate follows only the three anonymous GET boundaries and never signs in", async () => {
  const { fetchImpl, requests } = fixture();
  const result = await verify({ fetchImpl });
  assert.equal(result.ready, true);
  assert.ok(result.checks.every(check => check.ok));
  assert.deepEqual(requests.map(request => request.url.pathname), ["/api/config", "/auth/v1/settings", "/auth/v1/authorize"]);
  for (const { options } of requests) {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
  }
  assert.equal(requests[0].options.headers.apikey, undefined);
  assert.equal(requests[1].options.headers.apikey, publicKey);
  assert.equal(requests[2].options.headers.apikey, publicKey);
  assert.equal(requests[2].url.searchParams.get("provider"), "apple");
  assert.equal(requests[2].url.searchParams.get("redirect_to"), `${publicOrigin}/auth/callback`);
  assert.equal(requests[2].url.searchParams.get("scopes"), null, "verify the backend's default Apple scopes");
  assertSafeReport(result);
});

for (const apple of [false, undefined, "true"]) {
  test(`Apple provider readiness fails closed for settings.apple=${apple}`, async () => {
    const { fetchImpl, requests } = fixture({ settings: { external: { apple } } });
    const result = await verify({ fetchImpl });
    assert.equal(result.ready, false);
    assert.equal(requests.length, 2, "disabled provider must not start authorization");
    assertSafeReport(result);
  });
}

for (const [index, publicConfig] of [null, {}, { storage: { mode: "local" } }, { storage: { ...config().storage, anonKey: "" } }, { storage: { ...config().storage, url: "http://project.example.test" } }, { storage: { ...config().storage, url: `https://user:${publicKey}@project.example.test` } }].entries()) {
  test(`invalid public backend configuration fails before sending a public key (case ${index + 1})`, async () => {
    const { fetchImpl, requests } = fixture({ publicConfig });
    const result = await verify({ fetchImpl });
    assert.equal(result.ready, false);
    assert.equal(requests.length, 1);
    assertSafeReport(result);
  });
}

for (const [name, location] of [
  ["wrong host", appleLocation().replace("appleid.apple.com", "appleid.apple.com.example.test")],
  ["wrong path", appleLocation().replace("/auth/authorize", "/auth/callback")],
  ["HTTP", appleLocation().replace("https:", "http:")],
  ["wrong Services ID", appleLocation({ client_id: "com.wrong.app" })],
  ["missing email scope", appleLocation({ scope: "name" })],
  ["missing name scope", appleLocation({ scope: "email" })],
  ["unexpected scope", appleLocation({ scope: "email name profile" })],
  ["wrong callback", appleLocation({ redirect_uri: `${publicOrigin}/auth/callback` })],
  ["malformed location", "not-a-url"],
  ["missing location", ""]
]) {
  test(`authorization gate rejects ${name}`, async () => {
    const { fetchImpl } = fixture({ location });
    const result = await verify({ fetchImpl });
    assert.equal(result.ready, false);
    assertSafeReport(result);
  });
}

test("scope order is immaterial", async () => {
  const { fetchImpl } = fixture({ location: appleLocation({ scope: "email name" }) });
  assert.equal((await verify({ fetchImpl })).ready, true);
});

for (const path of ["/api/config", "/auth/v1/settings", "/auth/v1/authorize"]) {
  for (const failure of ["http", "network", "timeout"]) {
    test(`${path} ${failure} failure blocks release without leaking response details`, async () => {
      let signal;
      const { fetchImpl } = fixture({ responses: {
        [path]: async options => {
          signal = options.signal;
          if (failure === "http") return new Response(`${publicKey} ${state} ${appleLocation()}`, { status: 503 });
          if (failure === "network") throw new Error(`${publicKey} ${state} ${appleLocation()}`);
          return new Promise(() => {});
        }
      } });
      const result = await verify({ fetchImpl, timeoutMs: 20 });
      assert.equal(result.ready, false);
      if (failure === "timeout") assert.equal(signal.aborted, true);
      assertSafeReport(result);
    });
  }
}

test("a stalled JSON body is also bounded", async () => {
  const { fetchImpl } = fixture({ responses: {
    "/api/config": async () => ({ ok: true, json: async () => new Promise(() => {}) })
  } });
  assert.equal((await verify({ fetchImpl, timeoutMs: 20 })).ready, false);
});

test("malformed JSON cannot pass the public configuration gate", async () => {
  const { fetchImpl } = fixture({ responses: {
    "/api/config": async () => new Response("not-json")
  } });
  assert.equal((await verify({ fetchImpl })).ready, false);
});

test("an HTTP success without an authorization redirect fails", async () => {
  const { fetchImpl } = fixture({ status: 200 });
  assert.equal((await verify({ fetchImpl })).ready, false);
});

function assertSafeReport(result) {
  const output = JSON.stringify(result);
  for (const forbidden of [publicKey, state, appleLocation(), "client_id=", "redirect_to="]) {
    assert.equal(output.includes(forbidden), false, "report must contain only fixed check labels and booleans");
  }
}
