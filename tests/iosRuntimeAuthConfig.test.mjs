import test from "node:test";
import assert from "node:assert/strict";

const bundled = {
  publicUrl: "https://sogrim-hesbon-app.vercel.app",
  auth: { googleClientId: "web-client.apps.googleusercontent.com", googleIosClientId: "ios-client.apps.googleusercontent.com" },
  launch: { googleAuthReady: true, googleIosAuthReady: true },
  storage: { mode: "supabase", url: "https://ios-config.supabase.co", anonKey: "fixture-public-key" }
};
let sequence = 0;

async function loadRefreshed({ remote = {}, platform = "ios", bootstrap = bundled } = {}) {
  const keys = ["window", "location", "localStorage", "fetch", "Capacitor", "SogrimNativeRuntimeConfig"];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
  const location = { href: "capacitor://localhost/", protocol: "capacitor:", hostname: "localhost" };
  const networkConfig = {
    ...bundled,
    auth: { googleClientId: bundled.auth.googleClientId, googleIosClientId: "" },
    launch: { googleAuthReady: true, googleIosAuthReady: false, accountDeletionReady: false },
    ...remote
  };
  Object.assign(globalThis, {
    window: { localStorage: storage, location, addEventListener() {} }, location, localStorage: storage,
    Capacitor: { isNativePlatform: () => platform !== "web", getPlatform: () => platform, Plugins: {} },
    SogrimNativeRuntimeConfig: bootstrap,
    fetch: async () => ({ ok: true, json: async () => structuredClone(networkConfig) })
  });
  if (platform === "web") Object.assign(location, { href: "https://app.example.test/", protocol: "https:", hostname: "app.example.test" });
  try {
    const store = await import(`../src/data/localStore.mjs?ios-auth-refresh=${++sequence}`);
    const initial = await store.loadRuntimeConfig();
    const refreshed = await store.refreshRuntimeConfigNow();
    const cached = await store.loadRuntimeConfig();
    return { initial, refreshed, cached };
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test("iOS keeps its bundled Google client after a successful web-only runtime config refresh", async () => {
  const result = await loadRefreshed();
  for (const config of [result.initial, result.refreshed, result.cached]) {
    assert.equal(config.auth.googleIosClientId, bundled.auth.googleIosClientId);
    assert.equal(config.launch.googleIosAuthReady, true);
  }
  assert.equal(result.refreshed.launch.accountDeletionReady, false, "other fresh server policy must remain authoritative");
});

for (const platform of ["android", "web"]) {
  test(`${platform} does not inherit the iOS client from an unrelated bootstrap`, async () => {
    const { refreshed } = await loadRefreshed({ platform });
    assert.equal(refreshed.auth.googleIosClientId, "");
    assert.equal(refreshed.launch.googleIosAuthReady, false);
  });
}

test("an explicitly configured server iOS client is retained", async () => {
  const auth = { ...bundled.auth, googleIosClientId: "explicit-ios.apps.googleusercontent.com" };
  const { refreshed } = await loadRefreshed({ remote: { auth, launch: { googleAuthReady: true, googleIosAuthReady: true } } });
  assert.equal(refreshed.auth.googleIosClientId, auth.googleIosClientId);
});

for (const remote of [
  { auth: { googleClientId: "other-web.apps.googleusercontent.com", googleIosClientId: "" } },
  { storage: { ...bundled.storage, url: "https://other-project.supabase.co" } },
  { storage: { mode: "local" } },
  { launch: { googleAuthReady: false, googleIosAuthReady: false } }
]) {
  test(`iOS does not apply a bundled client across an incompatible or disabled server configuration: ${JSON.stringify(remote)}`, async () => {
    const { refreshed } = await loadRefreshed({ remote });
    assert.equal(refreshed.auth.googleIosClientId, "");
    assert.equal(refreshed.launch.googleIosAuthReady, false);
  });
}

test("an iOS build without a bundled native Google client stays unavailable", async () => {
  const { refreshed } = await loadRefreshed({ bootstrap: { ...bundled, auth: { googleClientId: bundled.auth.googleClientId } } });
  assert.equal(refreshed.auth.googleIosClientId, "");
  assert.equal(refreshed.launch.googleIosAuthReady, false);
});
