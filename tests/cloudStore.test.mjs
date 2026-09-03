import test from "node:test";
import assert from "node:assert/strict";

import {
  CloudStateAuthError,
  CloudStateConflictError,
  CloudStateIdentityError,
  loadCloudState,
  readAccessibleSharedCloudStates,
  readCloudState,
  readCloudStateIfChanged,
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
    if (url.includes("id=gt.")) return jsonResponse([]);
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

test("shared event recovery reads every page before treating membership as authoritative", async () => {
  const config = createConfig("personal-account-space-paged");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space-paged"
  };
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    id: `shared-event-${index}`,
    state: { events: [{ id: `event-${index}` }] },
    updated_at: "2026-09-02T08:00:00.000Z"
  }));
  const requests = [];

  const rows = await readAccessibleSharedCloudStates(config, async (url) => {
    requests.push(url);
    if (url.includes("id=gt.shared-event-last")) return jsonResponse([]);
    return jsonResponse(url.includes("id=gt.shared-event-499")
      ? [{
          id: "shared-event-last",
          state: { events: [{ id: "event-last" }] },
          updated_at: "2026-09-02T07:59:59.000Z"
        }]
      : firstPage);
  });

  assert.equal(rows.length, 501);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /order=id\.asc&limit=500/);
  assert.match(requests[1], /id=gt\.shared-event-499/);
});

test("a server row cap below the client page size cannot truncate membership recovery", async () => {
  const config = createConfig("personal-account-space-server-cap");
  config.storage.account = {
    userId: "user-one",
    accessToken: "account-access-token",
    spaceId: "personal-account-space-server-cap"
  };
  const allRows = ["a", "b", "c"].map((id) => ({
    id: `shared-event-${id}`,
    state: { events: [{ id: `event-${id}` }] },
    updated_at: "2026-09-02T08:00:00.000Z"
  }));
  const requests = [];

  const rows = await readAccessibleSharedCloudStates(config, async (url) => {
    requests.push(url);
    const match = String(url).match(/id=gt\.([^&]+)/);
    const cursor = match ? decodeURIComponent(match[1]) : "";
    const remaining = allRows.filter((row) => row.id > cursor);
    const page = remaining.slice(0, 2);
    return jsonResponse(page, {
      "content-range": page.length
        ? `0-${page.length - 1}/${allRows.length}`
        : `*/${allRows.length}`
    });
  });

  assert.deepEqual(rows.map((row) => row.id), [
    "shared-event-a",
    "shared-event-b",
    "shared-event-c"
  ]);
  assert.equal(requests.length, 2);
});

test("a missing account token is never treated as an empty shared-event membership list", async () => {
  const config = createConfig("personal-account-space-no-token");
  config.storage.account = {
    userId: "user-one",
    accessToken: "",
    spaceId: "personal-account-space-no-token"
  };

  await assert.rejects(
    readAccessibleSharedCloudStates(config, async () => {
      throw new Error("the network must not be called without a token");
    }),
    CloudStateAuthError
  );
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

test("readCloudState honors the caller startup timeout", async () => {
  const config = createConfig("friends-timeout");
  const startedAt = Date.now();

  await assert.rejects(
    readCloudState(config, () => new Promise(() => {}), { timeoutMs: 10 }),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.ok(Date.now() - startedAt < 500, "cloud startup reads must stay bounded");
});

test("readCloudState keeps a successful response body inside the startup timeout", async () => {
  const config = createConfig("friends-body-timeout");
  let requestSignal = null;

  await assert.rejects(
    Promise.race([
      readCloudState(
        config,
        async (_url, options) => {
          requestSignal = options.signal;
          return {
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          };
        },
        { timeoutMs: 10 }
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("cloud response body stayed unbounded")), 250)
      )
    ]),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
  assert.equal(requestSignal?.aborted, true);
});

test("an unchanged cloud snapshot uses a version-only read", async () => {
  const config = createConfig("friends-version-only");
  await readCloudState(config, async () =>
    jsonResponse([{ state, updated_at: "2026-08-31T10:00:00.000Z" }])
  );
  const requests = [];
  const result = await readCloudStateIfChanged(config, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{ updated_at: "2026-08-31T10:00:00.000Z" }]);
  });

  assert.deepEqual(result, { changed: false, missing: false, state: null });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /select=updated_at$/);
  assert.doesNotMatch(requests[0].url, /select=state/);
});

test("a changed cloud snapshot downloads state only after its version changes", async () => {
  const config = createConfig("friends-version-changed");
  await readCloudState(config, async () =>
    jsonResponse([{ state, updated_at: "2026-08-31T10:00:00.000Z" }])
  );
  const updatedState = { ...state, groups: [{ id: "group-new", name: "New" }] };
  const requests = [];
  const result = await readCloudStateIfChanged(config, async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? jsonResponse([{ updated_at: "2026-08-31T10:00:01.000Z" }])
      : jsonResponse([{ state: updatedState, updated_at: "2026-08-31T10:00:01.000Z" }]);
  });

  assert.equal(result.changed, true);
  assert.equal(result.missing, false);
  assert.deepEqual(result.state, updatedState);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /select=updated_at$/);
  assert.match(requests[1].url, /select=state,updated_at$/);
});

test("a foreground observer is not silenced by an unrelated background read", async () => {
  const config = createConfig("shared-observer-race");
  const originalState = { ...state, groups: [] };
  const updatedState = { ...state, groups: [{ id: "group-live", name: "Live" }] };
  const observerKey = "visible-event-workspace";

  const initial = await readCloudStateIfChanged(
    config,
    async () => jsonResponse([{
      state: originalState,
      updated_at: "2026-08-31T10:00:00.000Z"
    }]),
    { observerKey }
  );
  assert.equal(initial.changed, true);

  // A separate startup/profile flow downloads the newer snapshot first. That
  // global read must not advance the visible workspace observer's cursor.
  await readCloudState(config, async () => jsonResponse([{
    state: updatedState,
    updated_at: "2026-08-31T10:00:01.000Z"
  }]));

  const requests = [];
  const observed = await readCloudStateIfChanged(
    config,
    async (url) => {
      requests.push(url);
      return requests.length === 1
        ? jsonResponse([{ updated_at: "2026-08-31T10:00:01.000Z" }])
        : jsonResponse([{
            state: updatedState,
            updated_at: "2026-08-31T10:00:01.000Z"
          }]);
    },
    { observerKey }
  );

  assert.equal(observed.changed, true);
  assert.deepEqual(observed.state, updatedState);
  assert.equal(requests.length, 2);
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

test("a signed-out browser does not retry creation of a missing ownerless snapshot", async () => {
  const config = createConfig("missing-ownerless-space");
  const requests = [];
  const loaded = await loadCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([]);
  });

  assert.deepEqual(loaded, state);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
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

test("an empty read forgets the cached snapshot version before recreation", async () => {
  const config = createConfig("snapshot-recreated-after-empty-read");
  await readCloudState(config, async () =>
    jsonResponse([{ state, updated_at: "2026-07-17T10:00:00.000Z" }])
  );
  await readCloudState(config, async () => jsonResponse([]));

  const requests = [];
  await saveCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{ updated_at: "2026-07-17T10:00:01.000Z" }]);
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "POST");
  assert.doesNotMatch(requests[0].url, /updated_at=eq\./);
});

test("an account snapshot create conflict reloads, merges, and retries as an update", async () => {
  const accountConfig = createConfig("account-create-conflict-retry");
  accountConfig.storage.account = {
    userId: "user-conflict",
    accessToken: "account-access-token",
    spaceId: "account-create-conflict-retry"
  };
  const accountState = {
    ...state,
    currentParticipantId: "account-user-conflict",
    participants: [{ id: "account-user-conflict", displayName: "Owner", kind: "user" }]
  };
  const remoteState = {
    ...accountState,
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
    state: accountState,
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
  const accountState = {
    ...state,
    currentParticipantId: "account-user-one",
    participants: [{ id: "account-user-one", displayName: "Owner", kind: "user" }]
  };
  const requests = [];

  await saveCloudState(accountConfig, accountState, async (_url, options) => {
    requests.push(options);
    return jsonResponse([{ updated_at: "2026-07-17T10:00:00.000Z" }]);
  });
  await saveCloudState(accountConfig, accountState, async (_url, options) => {
    requests.push(options);
    return jsonResponse([{ updated_at: "2026-07-17T10:00:01.000Z" }]);
  });

  assert.equal(JSON.parse(requests[0].body).owner_user_id, "user-one");
  assert.equal(
    Object.hasOwn(JSON.parse(requests[1].body), "owner_user_id"),
    false
  );
});

test("an invalid personal workspace identity is rejected before a network write", async () => {
  const accountConfig = createConfig("account-identity-pending");
  accountConfig.storage.account = {
    userId: "user-two",
    accessToken: "account-access-token",
    spaceId: "account-identity-pending"
  };
  let contacted = false;

  await assert.rejects(
    saveCloudState(
      accountConfig,
      {
        ...state,
        currentParticipantId: ""
      },
      async () => {
        contacted = true;
        return jsonResponse([]);
      }
    ),
    CloudStateIdentityError
  );
  assert.equal(contacted, false);
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

function jsonResponse(payload, responseHeaders = {}) {
  return {
    ok: true,
    headers: {
      get(name) {
        const target = String(name ?? "").toLowerCase();
        const entry = Object.entries(responseHeaders).find(
          ([key]) => key.toLowerCase() === target
        );
        return entry?.[1] ?? null;
      }
    },
    async json() {
      return payload;
    }
  };
}
