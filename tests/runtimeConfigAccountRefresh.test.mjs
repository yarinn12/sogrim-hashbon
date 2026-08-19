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
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
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
          publicUrl: "https://sogrim-hesbon-app.vercel.app",
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

test("native runtime config identifies the Android app build without user data", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousCapacitor = globalThis.Capacitor;
  let requestedUrl = "";
  let requestedOptions = null;

  const location = {
    href: "https://localhost/",
    hostname: "localhost",
    protocol: "https:"
  };

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {
      App: {
        async getInfo() {
          return { build: "28", version: "3.5" };
        }
      }
    }
  };
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedOptions = options;
    return {
      ok: true,
      async json() {
        return {
          publicUrl: "https://sogrim-hesbon-app.vercel.app",
          storage: { mode: "local" }
        };
      }
    };
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?native-runtime-config=${Date.now()}`
    );
    await localStore.loadRuntimeConfig();

    assert.equal(
      requestedUrl,
      "https://sogrim-hesbon-app.vercel.app/api/config"
    );
    assert.equal(requestedOptions.cache, "no-store");
    assert.deepEqual(requestedOptions.headers, {
      "X-Sogrim-Platform": "android",
      "X-Sogrim-App-Build": "28",
      "X-Sogrim-App-Version": "3.5"
    });
    assert.equal(
      Object.keys(requestedOptions.headers).some((key) =>
        /user|account|email|token/i.test(key)
      ),
      false
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("Capacitor", previousCapacitor);
  }
});

test("native runtime config fails over to the recovery API without changing shared links", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousCapacitor = globalThis.Capacitor;
  const requestedUrls = [];
  const location = {
    href: "https://localhost/",
    hostname: "localhost",
    protocol: "https:"
  };

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: { App: { async getInfo() { return { build: "70", version: "3.51" }; } } }
  };
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) throw new Error("primary unavailable");
    return {
      ok: true,
      async json() {
        return {
          publicUrl: "https://sogrim-hashbon-recovery.onrender.com",
          storage: {
            mode: "supabase",
            url: "https://project.supabase.co",
            anonKey: "anon-key"
          }
        };
      }
    };
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?native-runtime-failover=${Date.now()}`
    );
    const config = await localStore.loadRuntimeConfig();

    assert.deepEqual(requestedUrls, [
      "https://sogrim-hesbon-app.vercel.app/api/config",
      "https://sogrim-hashbon-recovery.onrender.com/api/config"
    ]);
    assert.equal(config.apiBaseUrl, "https://sogrim-hashbon-recovery.onrender.com");
    assert.equal(config.publicUrl, "https://sogrim-hashbon-recovery.onrender.com");
    assert.equal(config.storage.mode, "supabase");
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("Capacitor", previousCapacitor);
  }
});

test("native recovery keeps the bundled public link while moving server calls", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousCapacitor = globalThis.Capacitor;
  const previousBootstrap = globalThis.SogrimNativeRuntimeConfig;
  const requestedUrls = [];
  const location = {
    href: "https://localhost/",
    hostname: "localhost",
    protocol: "https:"
  };

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: { App: { async getInfo() { return { build: "70", version: "3.51" }; } } }
  };
  globalThis.SogrimNativeRuntimeConfig = {
    publicUrl: "https://sogrim-hesbon-app.vercel.app",
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      anonKey: "native-anon-key"
    }
  };
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) throw new Error("primary unavailable");
    return {
      ok: true,
      async json() {
        return {
          publicUrl: "https://sogrim-hashbon-recovery.onrender.com",
          storage: {
            mode: "supabase",
            url: "https://project.supabase.co",
            anonKey: "recovery-anon-key"
          }
        };
      }
    };
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?native-runtime-bootstrap-failover=${Date.now()}`
    );
    const initialConfig = await localStore.loadRuntimeConfig();
    assert.equal(initialConfig.apiBaseUrl, "https://sogrim-hesbon-app.vercel.app");

    for (let attempt = 0; attempt < 20 && requestedUrls.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const recoveredConfig = await localStore.loadRuntimeConfig();

    assert.deepEqual(requestedUrls, [
      "https://sogrim-hesbon-app.vercel.app/api/config",
      "https://sogrim-hashbon-recovery.onrender.com/api/config"
    ]);
    assert.equal(recoveredConfig.apiBaseUrl, "https://sogrim-hashbon-recovery.onrender.com");
    assert.equal(recoveredConfig.publicUrl, "https://sogrim-hesbon-app.vercel.app");
    assert.equal(recoveredConfig.storage.anonKey, "recovery-anon-key");
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("Capacitor", previousCapacitor);
    restoreGlobal("SogrimNativeRuntimeConfig", previousBootstrap);
  }
});

test("native runtime config uses the bundled bootstrap without blocking on the network", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousCapacitor = globalThis.Capacitor;
  const previousBootstrap = globalThis.SogrimNativeRuntimeConfig;
  let releaseNetwork;
  let configRequests = 0;
  const location = {
    href: "https://localhost/",
    hostname: "localhost",
    protocol: "https:"
  };

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {
      App: {
        async getInfo() {
          return { build: "59", version: "3.36" };
        }
      }
    }
  };
  globalThis.SogrimNativeRuntimeConfig = {
    publicUrl: "https://sogrim-hesbon-app.vercel.app",
    auth: { googleClientId: "native-google-client" },
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      anonKey: "native-anon-key",
      table: "shared_state"
    }
  };
  globalThis.fetch = async () => {
    configRequests += 1;
    await new Promise((resolve) => {
      releaseNetwork = resolve;
    });
    return {
      ok: true,
      async json() {
        return globalThis.SogrimNativeRuntimeConfig;
      }
    };
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?native-runtime-bootstrap=${Date.now()}`
    );
    const config = await Promise.race([
      localStore.loadRuntimeConfig(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("blocked")), 50)
      )
    ]);

    assert.equal(config.storage.mode, "supabase");
    assert.equal(config.auth.googleClientId, "native-google-client");
    assert.equal(config.apiBaseUrl, "https://sogrim-hesbon-app.vercel.app");
    assert.equal(localStore.runtimeConfigUsesFallback(), false);
    assert.equal(configRequests, 1);
    releaseNetwork?.();
  } finally {
    releaseNetwork?.();
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("Capacitor", previousCapacitor);
    restoreGlobal("SogrimNativeRuntimeConfig", previousBootstrap);
  }
});

test("runtime config exposes when it had to use the local fallback", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
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
    throw new Error("offline");
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?runtime-config-fallback=${Date.now()}`
    );
    const config = await localStore.loadRuntimeConfig();

    assert.equal(config.storage.mode, "local");
    assert.equal(localStore.runtimeConfigUsesFallback(), true);
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

test("runtime config retry replaces a temporary fallback without reloading the app", async () => {
  const storage = memoryStorage();
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const location = {
    href: "https://sogrim-hesbon-app.vercel.app/",
    hostname: "sogrim-hesbon-app.vercel.app",
    protocol: "https:"
  };
  let requests = 0;

  globalThis.window = {
    addEventListener() {},
    localStorage: storage,
    location
  };
  globalThis.location = location;
  globalThis.localStorage = storage;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) throw new Error("temporary failure");
    return {
      ok: true,
      async json() {
        return {
          publicUrl: "https://sogrim-hesbon-app.vercel.app",
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
    const localStore = await import(
      `../src/data/localStore.mjs?runtime-config-retry=${Date.now()}`
    );
    const fallback = await localStore.loadRuntimeConfig();
    const recovered = await localStore.retryRuntimeConfig();

    assert.equal(fallback.storage.mode, "local");
    assert.equal(recovered.storage.mode, "supabase");
    assert.equal(localStore.runtimeConfigUsesFallback(), false);
    assert.equal(requests, 2);
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
