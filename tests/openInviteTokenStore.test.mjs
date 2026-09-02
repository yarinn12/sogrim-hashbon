import test from "node:test";
import assert from "node:assert/strict";

import {
  loadLegacyOpenInviteCandidate,
  loadVerifiedOpenInviteToken,
  reconcileOpenInviteAccountScope,
  saveVerifiedOpenInviteToken
} from "../src/data/openInviteTokenStore.mjs";

const TOKEN = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";

function config(accountId = "account-a", accountSpaceId = "workspace-a") {
  return {
    storage: {
      mode: "supabase",
      spaceId: accountSpaceId,
      account: {
        userId: accountId,
        spaceId: accountSpaceId
      }
    }
  };
}

function event(eventSpaceId = "event-space-a") {
  return {
    id: "event-a",
    sharedSpaceId: eventSpaceId
  };
}

function memoryStorage(entries = []) {
  const store = new Map(entries);
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    entries() {
      return [...store.entries()];
    }
  };
}

test("a verified open invite is scoped to the account, workspace and event space", () => {
  const storage = memoryStorage();
  reconcileOpenInviteAccountScope(config(), storage);
  const saved = saveVerifiedOpenInviteToken(config(), event(), TOKEN, storage);

  assert.equal(saved.token, TOKEN);
  assert.equal(loadVerifiedOpenInviteToken(config(), event(), storage)?.token, TOKEN);
  assert.equal(
    loadVerifiedOpenInviteToken(config("account-b"), event(), storage),
    null
  );
  assert.equal(
    loadVerifiedOpenInviteToken(config("account-a", "workspace-b"), event(), storage),
    null
  );
  assert.equal(
    loadVerifiedOpenInviteToken(config(), event("event-space-b"), storage),
    null
  );
});

test("saving a server-verified token removes the unscoped legacy candidate", () => {
  const storage = memoryStorage([
    ["sogrim-open-invite-token:event-a", TOKEN]
  ]);

  assert.equal(loadLegacyOpenInviteCandidate(event(), storage), TOKEN);
  saveVerifiedOpenInviteToken(config(), event(), TOKEN, storage);

  assert.equal(loadLegacyOpenInviteCandidate(event(), storage), null);
  assert.equal(loadVerifiedOpenInviteToken(config(), event(), storage)?.token, TOKEN);
});

test("an account boundary clears verified and legacy raw invite tokens", () => {
  const storage = memoryStorage([
    ["sogrim-open-invite-token:event-legacy", TOKEN]
  ]);
  reconcileOpenInviteAccountScope(config(), storage);
  saveVerifiedOpenInviteToken(config(), event(), TOKEN, storage);

  assert.equal(reconcileOpenInviteAccountScope(config("account-b", "workspace-b"), storage), true);
  assert.equal(loadVerifiedOpenInviteToken(config(), event(), storage), null);
  assert.equal(
    storage.entries().some(([key]) => key === "sogrim-open-invite-token:event-legacy"),
    false
  );
});

test("a corrupted or merely token-shaped record is never treated as verified", () => {
  const storage = memoryStorage();
  reconcileOpenInviteAccountScope(config(), storage);
  const saved = saveVerifiedOpenInviteToken(config(), event(), TOKEN, storage);
  const storageKey = saved.storageKey;

  storage.setItem(storageKey, JSON.stringify({ token: TOKEN }));
  assert.equal(loadVerifiedOpenInviteToken(config(), event(), storage), null);
});

test("a temporary account identity gap keeps the stored scope and verified token", () => {
  const storage = memoryStorage([
    [
      "settle-friends-account-session",
      JSON.stringify({
        access_token: "account-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "account-a",
          user_metadata: {
            account_space_id: "workspace-a",
            account_space_key: "workspace-secret-that-is-long-enough-123"
          }
        }
      })
    ]
  ]);
  const offlineConfig = { storage: { mode: "local" } };

  reconcileOpenInviteAccountScope(offlineConfig, storage);
  saveVerifiedOpenInviteToken(offlineConfig, event(), TOKEN, storage);

  assert.equal(
    loadVerifiedOpenInviteToken(offlineConfig, event(), storage)?.token,
    TOKEN
  );

  storage.removeItem("settle-friends-account-session");
  assert.equal(reconcileOpenInviteAccountScope(offlineConfig, storage), false);

  storage.setItem(
    "settle-friends-account-session",
    JSON.stringify({
      access_token: "account-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "account-a",
        user_metadata: {
          account_space_id: "workspace-a",
          account_space_key: "workspace-secret-that-is-long-enough-123"
        }
      }
    })
  );
  assert.equal(loadVerifiedOpenInviteToken(offlineConfig, event(), storage)?.token, TOKEN);
});
