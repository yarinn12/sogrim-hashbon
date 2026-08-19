import test from "node:test";
import assert from "node:assert/strict";

import {
  applyClientSpaceToConfig,
  parseInviteSpaceId,
  parseInviteSpaceKey,
  peekClientSpaceId,
  peekClientSpaceKey,
  resolveClientSpaceId,
  resolveClientSpaceKey
} from "../src/domain/cloudSpace.mjs";

test("parseInviteSpaceId reads a safe space id from an invite URL", () => {
  assert.equal(
    parseInviteSpaceId("https://sogrim-hesbon-app.vercel.app/?event=event-1&space=space-friends"),
    "space-friends"
  );
  assert.equal(
    parseInviteSpaceId("https://sogrim-hesbon-app.vercel.app/?event=event-1&space=../bad"),
    null
  );
  assert.equal(
    parseInviteSpaceId("https://sogrim-hesbon-app.vercel.app/?event=event-1&space=default"),
    null
  );
});

test("compact invite paths expose the same safe cloud credentials", () => {
  const url = "https://sogrim-hesbon-app.vercel.app/i/event-1/space-party/abcdefghijklmnopqrstuvwxyzABCDEF";

  assert.equal(parseInviteSpaceId(url), "space-party");
  assert.equal(parseInviteSpaceKey(url), "abcdefghijklmnopqrstuvwxyzABCDEF");
});

test("an event invite key never becomes the personal account key", () => {
  const storage = fakeStorage();
  const url = "https://sogrim-hesbon-app.vercel.app/?event=event-1&space=space-party&key=abcdefghijklmnopqrstuvwxyz_123456";

  assert.equal(parseInviteSpaceKey(url), "abcdefghijklmnopqrstuvwxyz_123456");
  assert.equal(
    resolveClientSpaceKey({
      currentUrl: url,
      spaceId: "space-personal",
      storage,
      createKey: () => "personal_account_key_123456789012"
    }),
    "personal_account_key_123456789012"
  );
  assert.equal(
    peekClientSpaceKey("https://sogrim-hesbon-app.vercel.app/", "space-personal", storage),
    "personal_account_key_123456789012"
  );
});

test("resolveClientSpaceId ignores an event invite and creates a personal space", () => {
  const storage = fakeStorage();

  const spaceId = resolveClientSpaceId({
    currentUrl: "https://sogrim-hesbon-app.vercel.app/?event=event-1&space=space-party",
    storage,
    createId: () => "space-new"
  });

  assert.equal(spaceId, "space-new");
  assert.equal(peekClientSpaceId("https://sogrim-hesbon-app.vercel.app/", storage), "space-new");
});

test("resolveClientSpaceId creates a private client space when none exists", () => {
  const storage = fakeStorage();

  const spaceId = resolveClientSpaceId({
    currentUrl: "https://sogrim-hesbon-app.vercel.app/",
    configuredSpaceId: "default",
    storage,
    createId: () => "space-private"
  });

  assert.equal(spaceId, "space-private");
  assert.equal(peekClientSpaceId("https://sogrim-hesbon-app.vercel.app/", storage), "space-private");
});

test("resolveClientSpaceId does not reuse a configured global space for a new client", () => {
  const storage = fakeStorage();

  const spaceId = resolveClientSpaceId({
    currentUrl: "https://sogrim-hesbon-app.vercel.app/",
    configuredSpaceId: "friends-beta",
    storage,
    createId: () => "space-private"
  });

  assert.equal(spaceId, "space-private");
});

test("applyClientSpaceToConfig scopes Supabase storage to the client space", () => {
  const config = {
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      table: "app_snapshots",
      spaceId: "default"
    }
  };

  assert.deepEqual(applyClientSpaceToConfig(config, "space-party").storage, {
    ...config.storage,
    spaceId: "space-party"
  });
  assert.equal(
    applyClientSpaceToConfig(
      config,
      "space-party",
      "abcdefghijklmnopqrstuvwxyz_123456"
    ).storage.spaceKey,
    "abcdefghijklmnopqrstuvwxyz_123456"
  );
  assert.deepEqual(applyClientSpaceToConfig({ storage: { mode: "local" } }, "space-party"), {
    storage: { mode: "local" }
  });
});

function fakeStorage() {
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
