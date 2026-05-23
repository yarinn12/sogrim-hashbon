import test from "node:test";
import assert from "node:assert/strict";

import { loadCloudState, saveCloudState } from "../src/data/cloudStore.mjs";

const config = {
  storage: {
    mode: "supabase",
    url: "https://demo.supabase.co",
    anonKey: "anon-key",
    table: "app_snapshots",
    spaceId: "friends-beta"
  }
};

const state = {
  currentParticipantId: "owner",
  participants: [{ id: "owner", displayName: "Owner", kind: "user" }],
  groups: [],
  events: []
};

test("loadCloudState reads the current app snapshot from Supabase REST", async () => {
  const requests = [];
  const loaded = await loadCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse([{ state }]);
  });

  assert.deepEqual(loaded, state);
  assert.equal(
    requests[0].url,
    "https://demo.supabase.co/rest/v1/app_snapshots?id=eq.friends-beta&select=state"
  );
  assert.equal(requests[0].options.headers.apikey, "anon-key");
  assert.equal(requests[0].options.headers.authorization, "Bearer anon-key");
});

test("loadCloudState creates a snapshot when the space does not exist yet", async () => {
  const requests = [];
  const loaded = await loadCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? jsonResponse([]) : jsonResponse({ ok: true });
  });

  assert.deepEqual(loaded, state);
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].options.headers.prefer, "resolution=merge-duplicates");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    id: "friends-beta",
    state
  });
});

test("saveCloudState upserts the latest app snapshot", async () => {
  const requests = [];
  await saveCloudState(config, state, async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({ ok: true });
  });

  assert.equal(
    requests[0].url,
    "https://demo.supabase.co/rest/v1/app_snapshots"
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.prefer, "resolution=merge-duplicates");
});

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
