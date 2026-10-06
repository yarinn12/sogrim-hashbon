import test from "node:test";
import assert from "node:assert/strict";
import { refreshAccountSession } from "../src/data/accountAuth.mjs";

const config = { storage: { mode: "supabase", url: "https://refresh-fixture.supabase.co", anonKey: "fixture-key" } };
const session = { access_token: "expired-access", refresh_token: "rotating-refresh" };

test("startup reconciliation and an app refresh share one token rotation, then later refreshes make a new request", async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requests = 0;
  const fetchImpl = async (url, options) => {
    requests++;
    assert.equal(new URL(url).searchParams.get("grant_type"), "refresh_token");
    assert.equal(JSON.parse(options.body).refresh_token, session.refresh_token);
    await held;
    return { ok: true, json: async () => ({ access_token: "fresh-access", refresh_token: "rotated-refresh", expires_in: 3600 }) };
  };
  const first = refreshAccountSession(config, session, fetchImpl, { timeoutMs: 2500 });
  const second = refreshAccountSession(config, session, fetchImpl);
  // The HTTP helper begins fetch on a microtask; observe both scheduled calls
  // before asserting at the final request boundary.
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(requests, 1, "the same refresh token must not be submitted twice concurrently"); }
  finally { release(); }
  const results = await Promise.all([first, second]);
  assert.equal(results[0].access_token, "fresh-access");
  assert.deepEqual(results[0], results[1]);
  await refreshAccountSession(config, session, fetchImpl);
  assert.equal(requests, 2, "completed refreshes must not be cached");
});

test("different accounts and backends never share a refresh result", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    bodies.push({ url, token: JSON.parse(options.body).refresh_token });
    return { ok: true, json: async () => ({ access_token: new URL(url).hostname, refresh_token: JSON.parse(options.body).refresh_token, expires_in: 3600 }) };
  };
  await Promise.all([
    refreshAccountSession(config, session, fetchImpl),
    refreshAccountSession(config, { ...session, refresh_token: "another-account" }, fetchImpl),
    refreshAccountSession({ storage: { ...config.storage, url: "https://other-fixture.supabase.co" } }, session, fetchImpl)
  ]);
  assert.equal(bodies.length, 3);
});

test("a failed shared refresh allows a later retry", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return requests === 1
      ? { ok: false, status: 503, json: async () => ({ message: "Temporary outage" }) }
      : { ok: true, json: async () => ({ access_token: "recovered-access", refresh_token: "fresh-refresh", expires_in: 3600 }) };
  };
  const attempts = await Promise.allSettled([
    refreshAccountSession(config, session, fetchImpl),
    refreshAccountSession(config, session, fetchImpl)
  ]);
  assert.equal(requests, 1);
  assert.ok(attempts.every(attempt => attempt.status === "rejected"));
  assert.equal((await refreshAccountSession(config, session, fetchImpl)).access_token, "recovered-access");
  assert.equal(requests, 2);
});
