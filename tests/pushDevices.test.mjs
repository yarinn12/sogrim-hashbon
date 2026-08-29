import test from "node:test";
import assert from "node:assert/strict";

import {
  clearStoredPushToken,
  defaultPushPreferences,
  disablePushDevice,
  loadStoredPushPreferences,
  pushPreferenceStorageKey,
  pushPreferencesStorageKey,
  registerPushDevice,
  saveStoredPushPreferences,
  saveStoredPushToken,
  storedPushToken
} from "../src/data/pushDevices.mjs";

const config = {
  storage: {
    mode: "supabase",
    url: "https://project.supabase.co",
    anonKey: "publishable-key",
    account: {
      userId: "user-1",
      accessToken: "access-token"
    }
  }
};

test("push device registration is authenticated and stores no user id from input", async () => {
  let request;
  const result = await registerPushDevice(
    config,
    {
      token: "a".repeat(64),
      platform: "android",
      preferences: {
        eventUpdates: true,
        paymentReminders: false
      }
    },
    async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  );

  assert.equal(result.ok, true);
  assert.match(request.url, /\/rest\/v1\/rpc\/register_push_device$/);
  assert.equal(request.options.headers.authorization, "Bearer access-token");
  const body = JSON.parse(request.options.body);
  assert.equal(body.p_platform, "android");
  assert.equal(body.p_preferences.paymentReminders, false);
  assert.equal("user_id" in body, false);
});

test("push device disable uses the signed-in account token", async () => {
  let request;
  const result = await disablePushDevice(
    config,
    "b".repeat(64),
    async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  );

  assert.equal(result.ok, true);
  assert.match(request.url, /\/rest\/v1\/rpc\/disable_push_device$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    p_token: "b".repeat(64)
  });
});

test("push device registration releases a hanging mobile request", async () => {
  let requestSignal = null;

  await assert.rejects(
    registerPushDevice(
      config,
      { token: "d".repeat(64), platform: "ios" },
      async (_url, options) => {
        requestSignal = options.signal;
        return new Promise(() => {});
      },
      5
    ),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );

  assert.equal(requestSignal?.aborted, true);
});

test("push device registration exposes an expired account session", async () => {
  await assert.rejects(
    registerPushDevice(
      config,
      { token: "e".repeat(64), platform: "ios" },
      async () => ({ ok: false, status: 401 })
    ),
    (error) => error?.code === "AUTH_REQUIRED" && error?.status === 401
  );
});

test("push token memory is scoped to one account", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const token = "c".repeat(64);

  assert.equal(pushPreferenceStorageKey("user-1"), "settle-friends-push-enabled:user-1");
  assert.equal(saveStoredPushToken("user-1", token, storage), true);
  assert.equal(storedPushToken("user-1", storage), token);
  assert.equal(storedPushToken("user-2", storage), "");
  clearStoredPushToken("user-1", storage);
  assert.equal(storedPushToken("user-1", storage), "");
});

test("push notification choices are normalized and scoped to one account", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(
    pushPreferencesStorageKey("user-1"),
    "settle-friends-push-preferences:user-1"
  );
  assert.deepEqual(loadStoredPushPreferences("user-1", storage), {
    eventUpdates: true,
    paymentReminders: true
  });
  assert.equal(
    saveStoredPushPreferences(
      "user-1",
      { eventUpdates: false, paymentReminders: true },
      storage
    ),
    true
  );
  assert.deepEqual(loadStoredPushPreferences("user-1", storage), {
    eventUpdates: false,
    paymentReminders: true
  });
  assert.deepEqual(loadStoredPushPreferences("user-2", storage), {
    eventUpdates: true,
    paymentReminders: true
  });

  values.set(pushPreferencesStorageKey("user-1"), "{broken");
  assert.deepEqual(
    loadStoredPushPreferences("user-1", storage),
    defaultPushPreferences()
  );
});
