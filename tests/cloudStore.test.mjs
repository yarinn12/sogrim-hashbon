import test from "node:test";
import assert from "node:assert/strict";

import {
  CloudStateConflictError,
  loadCloudState,
  saveCloudState
} from "../src/data/cloudStore.mjs";

function createConfig(spaceId) {
  return {
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      table: "app_snapshots",
      spaceId,
      spaceKey: "abcdefghijklmnopqrstuvwxyz_123456"
    }
  };
}

const state = {
  currentParticipantId: "owner",
  participants: [{ id: "owner", displayName: "Owner", kind: "user" }],
  groups: [],
  events: []
};

test("loadCloudState reads the current app snapshot from Supabase REST", async () => {
  const config = createConfig("friends-read");
  const requests = [];
  const loaded = await loadCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }]);
  });

  assert.deepEqual(loaded, state);
  assert.equal(
    requests[0].url,
    "https://demo.supabase.co/rest/v1/app_snapshots?id=eq.friends-read&select=state,updated_at"
  );
  assert.equal(requests[0].options.headers.apikey, "anon-key");
  assert.equal(requests[0].options.headers.authorization, "Bearer anon-key");
  assert.equal(requests[0].options.headers["x-space-key"], config.storage.spaceKey);
});

test("shared event requests use the signed-in account token when available", async () => {
  const config = createConfig("shared-event-space");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space"
  };

  await loadCloudState(config, state, async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer account-access-token");
    return jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }]);
  });
});

test("loadCloudState creates a snapshot when the space does not exist yet", async () => {
  const config = createConfig("friends-create");
  const requests = [];
  const loaded = await loadCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? jsonResponse([])
      : jsonResponse([{ updated_at: "2026-07-17T10:00:00.000Z" }]);
  });

  assert.deepEqual(loaded, state);
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].options.headers.prefer, "resolution=merge-duplicates,return=representation");
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.id, "friends-create");
  assert.deepEqual(body.state, state);
  assert.match(body.access_key_hash, /^[a-f0-9]{64}$/);
});

test("saveCloudState upserts the latest app snapshot", async () => {
  const isolatedConfig = {
    ...createConfig("friends-new")
  };
  const requests = [];
  await saveCloudState(isolatedConfig, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{ updated_at: "2026-07-17T10:00:00.000Z" }]);
  });

  assert.equal(
    requests[0].url,
    "https://demo.supabase.co/rest/v1/app_snapshots"
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.prefer, "resolution=merge-duplicates,return=representation");
});

test("saveCloudState rejects a concurrent overwrite", async () => {
  const isolatedConfig = {
    ...createConfig("friends-conflict")
  };

  await loadCloudState(isolatedConfig, state, async () =>
    jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }])
  );

  await assert.rejects(
    saveCloudState(isolatedConfig, state, async (url, options) => {
      assert.match(url, /updated_at=eq\./);
      assert.equal(options.method, "PATCH");
      return jsonResponse([]);
    }),
    CloudStateConflictError
  );
});

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
