import test from "node:test";
import assert from "node:assert/strict";

import {
  CloudStateAuthError,
  CloudStateConflictError,
  loadCloudState,
  readAccessibleSharedCloudStates,
  readCloudState,
  saveCloudState
} from "../src/data/cloudStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

test("a signed-in account can rediscover shared events after its local index is lost", async () => {
  const config = createConfig("personal-account-space");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space"
  };
  const requests = [];
  const rows = await readAccessibleSharedCloudStates(config, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{
      id: "shared-event-korea",
      state: { events: [{ id: "event-korea", name: "קוריאה" }] },
      updated_at: "2026-08-24T10:00:00.000Z"
    }]);
  });

  assert.equal(rows.length, 1);
  assert.match(requests[0].url, /snapshot_kind=eq\.shared_event/);
  assert.equal(requests[0].options.headers.authorization, "Bearer account-access-token");
});

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

test("cloud requests identify an expired account token for one safe refresh", async () => {
  const config = createConfig("expired-account");
  config.storage.account = {
    userId: "user-one",
    accessToken: "expired-token",
    spaceId: "expired-account"
  };

  await assert.rejects(
    loadCloudState(config, state, async () => ({ ok: false, status: 401 })),
    (error) =>
      error instanceof CloudStateAuthError &&
      error.code === "CLOUD_STATE_AUTH_EXPIRED" &&
      error.status === 401
  );
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
  assert.equal(requests[1].options.headers.prefer, "return=representation");
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.id, "friends-create");
  assert.deepEqual(body.state, state);
  assert.match(body.access_key_hash, /^[a-f0-9]{64}$/);
});

test("a fresh account waits for its participant before creating a personal snapshot", async () => {
  const config = createConfig("fresh-account-space");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "fresh-account-space"
  };
  const emptyState = {
    currentParticipantId: "",
    participants: [],
    groups: [],
    events: []
  };
  const requests = [];

  const loaded = await loadCloudState(config, emptyState, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([]);
  });

  assert.deepEqual(loaded, emptyState);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
});

test("a fresh account creates its personal snapshot after its participant exists", async () => {
  const config = createConfig("fresh-valid-account-space");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "fresh-valid-account-space"
  };
  const personalState = {
    ...state,
    currentParticipantId: "account-user-one",
    participants: [
      { id: "account-user-one", displayName: "Owner", kind: "user" }
    ]
  };
  const requests = [];

  await loadCloudState(config, personalState, async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? jsonResponse([])
      : jsonResponse([{ updated_at: "2026-07-17T10:00:00.000Z" }]);
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "POST");
  assert.equal(
    JSON.parse(requests[1].options.body).state.currentParticipantId,
    "account-user-one"
  );
});

test("saveCloudState inserts a missing app snapshot without merging duplicates", async () => {
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
  assert.equal(requests[0].options.headers.prefer, "return=representation");
});

test("an account snapshot create conflict reloads, merges, and retries as an update", async () => {
  const accountConfig = createConfig("account-create-conflict-retry");
  accountConfig.storage.account = {
    userId: "user-conflict",
    accessToken: "account-access-token",
    spaceId: "account-create-conflict-retry"
  };
  const remoteState = {
    ...state,
    groups: [{ id: "remote-group", name: "Remote group", memberIds: ["owner"] }]
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return { ok: false, status: 409 };
    if (requests.length === 2) {
      return jsonResponse([{
        state: remoteState,
        updated_at: "2026-07-17T10:00:00.000Z"
      }]);
    }
    return jsonResponse([{ updated_at: "2026-07-17T10:00:01.000Z" }]);
  };

  const result = await saveCloudStateWithConflictRetry({
    state,
    loadLatest: () => readCloudState(accountConfig, fetchImpl),
    save: (candidate) => saveCloudState(accountConfig, candidate, fetchImpl),
    retryDelay: () => 0
  });

  assert.equal(result.conflictCount, 1);
  assert.deepEqual(requests.map(({ options }) => options.method), ["POST", undefined, "PATCH"]);
  assert.equal(requests[0].options.headers.prefer, "return=representation");
  assert.match(requests[2].url, /updated_at=eq\./);
  assert.deepEqual(JSON.parse(requests[2].options.body).state.groups, remoteState.groups);
});

test("shared snapshot updates use the atomic server-validated RPC", async () => {
  const config = createConfig("shared-event-new");
  config.storage.snapshotKind = "shared_event";
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space"
  };
  const requests = [];

  await readCloudState(config, async () =>
    jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }])
  );
  await saveCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({
      status: "updated",
      updatedAt: "2026-07-17T10:00:01.000Z"
    });
  });

  assert.equal(
    requests[0].url,
    "https://demo.supabase.co/rest/v1/rpc/update_shared_event_snapshot"
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(
    requests[0].options.headers.authorization,
    "Bearer account-access-token"
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_snapshot_id: "shared-event-new",
    p_space_key: config.storage.spaceKey,
    p_expected_updated_at: "2026-07-17T10:00:00.000Z",
    p_state: state
  });
});

test("shared snapshot RPC conflicts never overwrite the newer state", async () => {
  const config = createConfig("shared-event-conflict");
  config.storage.snapshotKind = "shared_event";
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space"
  };
  await readCloudState(config, async () =>
    jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }])
  );

  await assert.rejects(
    saveCloudState(config, state, async () =>
      jsonResponse({
        status: "conflict",
        updatedAt: "2026-07-17T10:00:02.000Z"
      })
    ),
    CloudStateConflictError
  );
});

test("account ownership is only assigned when a snapshot is first inserted", async () => {
  const accountConfig = createConfig("account-owned");
  accountConfig.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "account-owned"
  };
  const requests = [];

  await saveCloudState(accountConfig, state, async (_url, options) => {
    requests.push(options);
    return jsonResponse([{ updated_at: "2026-07-17T10:00:00.000Z" }]);
  });
  await saveCloudState(accountConfig, state, async (_url, options) => {
    requests.push(options);
    return jsonResponse([{ updated_at: "2026-07-17T10:00:01.000Z" }]);
  });

  assert.equal(JSON.parse(requests[0].body).owner_user_id, "user-one");
  assert.equal(
    Object.hasOwn(JSON.parse(requests[1].body), "owner_user_id"),
    false
  );
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
