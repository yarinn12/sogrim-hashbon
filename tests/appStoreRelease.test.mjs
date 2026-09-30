import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createAppStoreClient, createAppStoreToken, completeTestFlightRelease } from "../scripts/lib/app-store-release.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const credentials = { issuerId: "12345678-1234-1234-1234-1234567890ab", keyId: "APIKEY1234", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) };
const notes = "תיקוני קישור חשבון וסנכרון";
const options = { version: "4.52", build: "182", releaseNotes: notes };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function appleFixture({ visibleAfter = 0, validAfter = 1_300_000, state, version = "4.52", locales = [], race = false, ignoreWrite = false } = {}) {
  let time = 0;
  const calls = [];
  const saved = structuredClone(locales);
  const tokens = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const token = init.headers.Authorization.slice(7);
    const [head, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.ok(verify("sha256", Buffer.from(`${head}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
    tokens.push(claims);
    if (claims.exp <= time / 1000) return json({ errors: [{ detail: "expired" }] }, 401);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname, method: init.method, body });
    if (url.pathname === "/v1/apps") {
      assert.equal(url.searchParams.get("filter[bundleId]"), "com.sogrimhashbon.app");
      return json({ data: [{ id: "app", attributes: { bundleId: "com.sogrimhashbon.app" } }] });
    }
    if (url.pathname === "/v1/builds") {
      assert.equal(url.searchParams.get("filter[app]"), "app");
      assert.equal(url.searchParams.get("filter[version]"), "182");
      return json({ data: time < visibleAfter ? [] : [{ id: "build", attributes: {
        version: "182", processingState: state ?? (time >= validAfter ? "VALID" : "PROCESSING"), usesNonExemptEncryption: false
      }, relationships: { preReleaseVersion: { data: { id: "pre" } } } }],
      included: [{ type: "preReleaseVersions", id: "pre", attributes: { version, platform: "IOS" } }] });
    }
    if (url.pathname === "/v1/builds/build/betaBuildLocalizations") return json({ data: saved });
    if (url.pathname === "/v1/betaBuildLocalizations" && init.method === "POST") {
      assert.equal(body.data.relationships.build.data.id, "build");
      assert.ok(time >= validAfter, "notes must only be saved after VALID");
      if (!ignoreWrite) saved.push({ id: "hebrew", attributes: { ...body.data.attributes, ...(race ? { whatsNew: "concurrent notes" } : {}) } });
      return json({}, race ? 409 : 201);
    }
    if (url.pathname === "/v1/betaBuildLocalizations/hebrew" && init.method === "PATCH") {
      if (!ignoreWrite) saved.find((item) => item.id === "hebrew").attributes.whatsNew = body.data.attributes.whatsNew;
      return json({});
    }
    assert.fail(`Unexpected request ${init.method} ${url.pathname}`);
  };
  return { calls, tokens, saved, fetchImpl, now: () => time, sleep: async (ms) => { time += ms; } };
}

function finish(fixture, overrides = {}) {
  return completeTestFlightRelease({ ...options, request: createAppStoreClient(credentials, fixture), sleep: fixture.sleep, ...overrides });
}

test("processing beyond two token lifetimes still confirms the exact build and saved Hebrew notes", async () => {
  const fixture = appleFixture({ visibleAfter: 300_000 });
  const result = await finish(fixture);
  assert.equal(result.processingState, "VALID");
  assert.equal(result.buildId, "build");
  assert.equal(result.hebrewReleaseNotesVerified, true);
  assert.ok(fixture.tokens.at(-1).iat > fixture.tokens[0].exp);
  assert.deepEqual(fixture.saved, [{ id: "hebrew", attributes: { locale: "he", whatsNew: notes } }]);
  assert.equal(fixture.calls.filter((call) => call.method === "POST").length, 1);
});

test("API tokens have the expected audience, P-256 signature and bounded validity", () => {
  const token = createAppStoreToken(credentials, 1_000_000);
  const [head, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "ES256", kid: credentials.keyId, typ: "JWT" });
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.deepEqual(claims, { iss: credentials.issuerId, aud: "appstoreconnect-v1", iat: 970, exp: 1600 });
  assert.ok(verify("sha256", Buffer.from(`${head}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
});

test("one 401 refreshes credentials; persistent authentication failure remains an error", async () => {
  let calls = 0;
  const request = createAppStoreClient(credentials, { fetchImpl: async () => ++calls === 1 ? json({}, 401) : json({ data: "ok" }) });
  assert.deepEqual(await request("/v1/apps"), { data: "ok" });
  assert.equal(calls, 2);
  calls = 0;
  const denied = createAppStoreClient(credentials, { fetchImpl: async () => { calls += 1; return json({ detail: "SECRET-MARKER" }, 401); } });
  await assert.rejects(denied("/v1/apps"), (error) => error.status === 401 && !error.message.includes("SECRET-MARKER"));
  assert.equal(calls, 2);
});

test("readiness failure and timeout cannot be reported as a successful upload", async () => {
  for (const state of ["FAILED", "INVALID", "UNKNOWN"]) {
    const fixture = appleFixture({ state });
    await assert.rejects(finish(fixture), /processing failed/);
    assert.ok(fixture.calls.every((call) => call.method === "GET"));
  }
  const fixture = appleFixture();
  await assert.rejects(finish(fixture, { attempts: 3 }), /Timed out/);
  assert.equal(fixture.calls.filter((call) => call.path === "/v1/builds").length, 3);
  assert.ok(fixture.calls.every((call) => call.method === "GET"));
});

test("a matching build number from another app version cannot receive release notes", async () => {
  const fixture = appleFixture({ validAfter: 0, version: "4.51" });
  await assert.rejects(finish(fixture), /does not match/);
  assert.ok(fixture.calls.every((call) => call.method === "GET"));
});

test("resuming completion is idempotent and preserves other locales", async () => {
  const fixture = appleFixture({ validAfter: 0, locales: [
    { id: "english", attributes: { locale: "en-US", whatsNew: "keep" } },
    { id: "hebrew", attributes: { locale: "he", whatsNew: "old" } }
  ] });
  await finish(fixture);
  await finish(fixture);
  assert.deepEqual(fixture.calls.filter((call) => call.method !== "GET").map((call) => call.path), ["/v1/betaBuildLocalizations/hebrew"]);
  assert.equal(fixture.saved[0].attributes.whatsNew, "keep");
});

test("a competing Hebrew localization creation is reconciled and read back", async () => {
  const fixture = appleFixture({ validAfter: 0, race: true });
  await finish(fixture);
  assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.saved[0].attributes.whatsNew, notes);
});

test("an acknowledged metadata write that did not persist is rejected", async () => {
  const fixture = appleFixture({ validAfter: 0, ignoreWrite: true });
  await assert.rejects(finish(fixture), /not confirmed after saving/);
});

test("credentials never follow a redirect or go to another API host", async () => {
  const request = createAppStoreClient(credentials, { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "error");
    return json({}, 302);
  } });
  await assert.rejects(request("https://example.com/v1/apps"), /Unexpected/);
  await assert.rejects(request("/v1/apps"), /HTTP 302/);
});

test("invalid release inputs fail before any external request", async () => {
  for (const input of [{ version: "" }, { build: "abc" }, { releaseNotes: "" }, { releaseNotes: "x".repeat(4001) }]) {
    await assert.rejects(completeTestFlightRelease({ ...options, ...input, request: () => assert.fail("network must not be used") }));
  }
});
