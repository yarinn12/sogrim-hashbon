import test from "node:test";
import assert from "node:assert/strict";

test("an expired cloud token refreshes once and retries with the same account", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const previousSessionBridge = globalThis.SogrimAccountSession;
  const storage = new MemoryStorage();
  const spaceId = "account-space";
  const spaceKey = "abcdefghijklmnopqrstuvwxyz_123456";
  const state = {
    currentParticipantId: "account-user-one",
    participants: [
      {
        id: "account-user-one",
        displayName: "User One",
        kind: "user"
      }
    ],
    groups: [],
    events: []
  };
  storage.setItem("settle-friends-cloud-space", spaceId);
  storage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(state));
  saveSession(storage, "expired-token");

  globalThis.window = {
    localStorage: storage,
    location: { href: "https://sogrim-hesbon-app.vercel.app/" },
    addEventListener() {},
    dispatchEvent() {}
  };
  globalThis.location = {
    protocol: "https:",
    hostname: "sogrim-hesbon-app.vercel.app"
  };
  globalThis.localStorage = storage;

  let refreshCount = 0;
  const cloudTokens = [];
  globalThis.SogrimAccountSession = {
    async refresh() {
      refreshCount += 1;
      saveSession(storage, "fresh-token");
      return JSON.parse(storage.getItem("settle-friends-account-session"));
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://demo.supabase.co",
          anonKey: "anon-key",
          table: "app_snapshots",
          spaceId
        }
      });
    }

    cloudTokens.push(options.headers.authorization);
    if (cloudTokens.length === 1) return { ok: false, status: 401 };
    return jsonResponse([{ state, updated_at: "2026-08-03T00:00:00.000Z" }]);
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?cloud-auth-retry=${Date.now()}`
    );
    const loaded = await localStore.loadSharedState();

    assert.deepEqual(cloudTokens, ["Bearer expired-token", "Bearer fresh-token"]);
    assert.equal(refreshCount, 1);
    assert.deepEqual(loaded.events, []);
    assert.equal(loaded.currentParticipantId, "account-user-one");
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
    restoreGlobal("SogrimAccountSession", previousSessionBridge);
  }
});

test("an account workspace persists the signed-in participant instead of the first event member", async () => {
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousLocalStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  const spaceId = "account-space-two";
  const spaceKey = "abcdefghijklmnopqrstuvwxyz_654321";
  const state = {
    currentParticipantId: "account-user-two",
    participants: [
      { id: "account-user-one", displayName: "User One", kind: "user" },
      { id: "account-user-two", displayName: "User Two", kind: "user" }
    ],
    friendContacts: [],
    groups: [],
    events: []
  };
  storage.setItem("settle-friends-cloud-space", spaceId);
  storage.setItem(`settle-friends-cloud-key:${spaceId}`, spaceKey);
  storage.setItem(`settle-friends-state:${spaceId}`, JSON.stringify(state));
  storage.setItem(
    "settle-friends-account-session",
    JSON.stringify({
      access_token: "token-two",
      refresh_token: "refresh-two",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "user-two",
        user_metadata: {
          account_space_id: spaceId,
          account_space_key: spaceKey
        }
      }
    })
  );

  globalThis.window = {
    localStorage: storage,
    location: { href: "https://sogrim-hesbon-app.vercel.app/" },
    addEventListener() {},
    dispatchEvent() {}
  };
  globalThis.location = {
    protocol: "https:",
    hostname: "sogrim-hesbon-app.vercel.app"
  };
  globalThis.localStorage = storage;

  const writtenStates = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/config")) {
      return jsonResponse({
        storage: {
          mode: "supabase",
          url: "https://demo.supabase.co",
          anonKey: "anon-key",
          table: "app_snapshots",
          spaceId
        }
      });
    }
    if (options.method === "POST" || options.method === "PATCH") {
      writtenStates.push(JSON.parse(options.body).state);
      return jsonResponse([{ updated_at: "2026-08-16T00:00:00.000Z" }]);
    }
    return jsonResponse([]);
  };

  try {
    const localStore = await import(
      `../src/data/localStore.mjs?account-identity-save=${Date.now()}`
    );
    const result = await localStore.saveSharedState(state);

    assert.equal(result.ok, true, result.error?.stack);
    assert.ok(writtenStates.length >= 1);
    assert.deepEqual(
      writtenStates.map((writtenState) => writtenState.currentParticipantId),
      writtenStates.map(() => "account-user-two")
    );
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("location", previousLocation);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("fetch", previousFetch);
  }
});

function saveSession(storage, accessToken) {
  storage.setItem(
    "settle-friends-account-session",
    JSON.stringify({
      access_token: accessToken,
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "user-one",
        user_metadata: {
          account_space_id: "account-space",
          account_space_key: "abcdefghijklmnopqrstuvwxyz_123456"
        }
      }
    })
  );
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

function restoreGlobal(key, value) {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
}

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}
