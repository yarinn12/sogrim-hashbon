import assert from "node:assert/strict";
import test from "node:test";
import { readCloudState, readCloudStateIfChanged } from "../src/data/cloudStore.mjs";
import { clearAccountSession, ACCOUNT_SESSION_STORAGE_KEY } from "../src/data/accountAuth.mjs";

const V0 = "2026-09-06T09:00:00.000Z";
const V1 = "2026-09-06T09:00:01.000Z";
const V2 = "2026-09-06T09:00:02.000Z";
const observerKey = "visible-event-workspace";
const original = { events: [{ id: "event", notes: [] }] };
const updated = { events: [{ id: "event", notes: [{ id: "peer-note", body: "From the other device" }] }] };

for (const warm of [false, true]) {
  test(`an overlapping background read cannot advance the ${warm ? "warm" : "cold"} observer past its delivered payload`, async () => {
    const config = configFor(`observer-concurrent-${warm}`, "user-a");
    if (warm) await readCloudStateIfChanged(config, async () => json([{ state: original, updated_at: V0 }]), { observerKey });
    const observerReady = deferred(), backgroundReady = deferred();
    const observerResponse = deferred(), backgroundResponse = deferred();
    const observing = readCloudStateIfChanged(config, async url => {
      if (new URL(url).searchParams.get("select") === "updated_at") return json([{ updated_at: V1 }]);
      observerReady.resolve();
      return observerResponse.promise;
    }, { observerKey });
    await observerReady.promise;
    const background = readCloudState(config, async () => {
      backgroundReady.resolve();
      return backgroundResponse.promise;
    });
    await backgroundReady.promise;
    observerResponse.resolve(json([{ state: original, updated_at: V1 }]));
    backgroundResponse.resolve(json([{ state: updated, updated_at: V2 }]));
    const [visible] = await Promise.all([observing, background]);
    assert.deepEqual(visible.state, original, "the observer actually received V1, not V2");
    const requests = [];
    const next = await readCloudStateIfChanged(config, async url => {
      const select = new URL(url).searchParams.get("select");
      requests.push(select);
      return json([select === "updated_at" ? { updated_at: V2 } : { state: updated, updated_at: V2 }]);
    }, { observerKey });
    assert.equal(next.changed, true, "the other device's note must not be skipped as already seen");
    assert.deepEqual(next.state, updated);
    assert.deepEqual(requests, ["updated_at", "state,updated_at"]);
  });
}

test("a newly active account receives the shared event even when the previous account saw its version", async () => {
  const configA = configFor("observer-account-switch", "user-a");
  const configB = configFor("observer-account-switch", "user-b");
  const fetchImpl = async url => json([new URL(url).searchParams.get("select") === "updated_at"
    ? { updated_at: V1 } : { state: updated, updated_at: V1 }]);
  await readCloudStateIfChanged(configA, fetchImpl, { observerKey });
  const firstB = await readCloudStateIfChanged(configB, fetchImpl, { observerKey });
  assert.equal(firstB.changed, true);
  assert.deepEqual(firstB.state, updated);
});

test("a late pre-logout read cannot acknowledge the new session's first payload", async () => {
  const config = configFor("observer-new-session", "user-a");
  const stored = new Map([[ACCOUNT_SESSION_STORAGE_KEY, "fixture-session"], ["fixture-outbox", "unsent-note"]]);
  const started = deferred(), response = deferred();
  const old = readCloudStateIfChanged(config, async () => {
    started.resolve();
    return response.promise;
  }, { observerKey });
  await started.promise;
  clearAccountSession({ removeItem: key => stored.delete(key) });
  assert.equal(stored.has(ACCOUNT_SESSION_STORAGE_KEY), false);
  assert.equal(stored.get("fixture-outbox"), "unsent-note", "invalidating credentials must preserve unsent work");
  response.resolve(json([{ state: updated, updated_at: V1 }]));
  await old;
  const next = await readCloudStateIfChanged(config, async url => {
    assert.equal(new URL(url).searchParams.get("select"), "state,updated_at");
    return json([{ state: updated, updated_at: V1 }]);
  }, { observerKey });
  assert.equal(next.changed, true);
  assert.deepEqual(next.state, updated);
});

test("access-token rotation preserves a same-account observer's version-only reads", async () => {
  const config = configFor("observer-token-rotation", "user-a");
  await readCloudStateIfChanged(config, async () => json([{ state: updated, updated_at: V1 }]), { observerKey });
  const rotated = structuredClone(config);
  rotated.storage.account.accessToken = "rotated-fixture-token";
  const next = await readCloudStateIfChanged(rotated, async (url, options) => {
    assert.equal(new URL(url).searchParams.get("select"), "updated_at");
    assert.equal(options.headers.authorization, "Bearer rotated-fixture-token");
    return json([{ updated_at: V1 }]);
  }, { observerKey });
  assert.deepEqual(next, { changed: false, missing: false, state: null });
});

function configFor(spaceId, userId) {
  return { storage: { mode: "supabase", url: "https://fixture.supabase.co", anonKey: "fixture-key",
    table: "app_snapshots", spaceId, spaceKey: "fixture-shared-space-key-long-enough",
    account: { userId, accessToken: `fixture-token-${userId}`, spaceId: `personal-${userId}` } } };
}
function json(payload) { return { ok: true, status: 200, async json() { return payload; } }; }
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
