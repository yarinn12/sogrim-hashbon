import test from "node:test";
import assert from "node:assert/strict";

import {
  clearAccountSession,
  saveAccountSession
} from "../src/data/accountAuth.mjs";

test("runtime config always uses the latest stored account token", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  let configRequests = 0;

  const location = {
    href: "https://sogrim-hashbon.vercel.app/",
    hostname: "sogrim-hashbon.vercel.app",
    protocol: "https:"
  };

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async () => {
    configRequests += 1;
    return {
      ok: true,
      async json() {
        return {
          publicUrl: "https://sogrim-hashbon.vercel.app",
          storage: {
            mode: "supabase",
            url: "https://project.supabase.co",
            anonKey: "anon-key",
            table: "shared_state"
          }
        };
      }
    };
  };

  try {
    saveAccountSession(accountSession("old-token"), storage);
    const localStore = await import(
      `../src/data/localStore.mjs?runtime-config-refresh=${Date.now()}`
    );

    const initialConfig = await localStore.loadRuntimeConfig();
    assert.equal(initialConfig.storage.account.accessToken, "old-token");

    saveAccountSession(accountSession("refreshed-token"), storage);
    const refreshedConfig = await localStore.loadRuntimeConfig();
    assert.equal(refreshedConfig.storage.account.accessToken, "refreshed-token");
    assert.equal(configRequests, 1);

    clearAccountSession(storage);
    const signedOutConfig = await localStore.loadRuntimeConfig();
    assert.equal(signedOutConfig.storage.account, undefined);
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

function accountSession(accessToken) {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "user-1",
      user_metadata: {
        account_space_id: "space-account-one",
        account_space_key: "abcdefghijklmnopqrstuvwxyzABCDEF"
      }
    }
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function restoreGlobal(key, value) {
  if (value === undefined) {
    delete globalThis[key];
    return;
  }
  globalThis[key] = value;
}
