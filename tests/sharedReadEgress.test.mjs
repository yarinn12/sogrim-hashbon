import test from "node:test";
import assert from "node:assert/strict";
import { readCloudState, readCloudStateIfChanged, readAccessibleSharedCloudStates } from "../src/data/cloudStore.mjs";
import { invalidateVersionedReadCacheSession } from "../src/data/versionedReadCache.mjs";

const V1 = "2026-09-07T10:00:00.000Z";
const V2 = "2026-09-07T10:00:01.000Z";
const options = { preferCached: true };
const observer = { observerKey: "visible-event" };

function fixture(name) {
  const cfg = { storage: { mode: "supabase", url: "https://local-egress.example.test",
    table: "app_snapshots", anonKey: "synthetic-key", spaceId: `personal-${name}`, spaceKey: "synthetic-space-key",
    account: { userId: name, accessToken: `synthetic-${name}`, spaceId: `personal-${name}` } } };
  const shared = { ...cfg, storage: { ...cfg.storage, spaceId: `shared-${name}`, snapshotKind: "shared_event" } };
  const server = { row: { id: shared.storage.spaceId, updated_at: V1,
    state: { participants: [{ id: name, avatarImage: "data:image/jpeg;base64," + "a".repeat(60_000) }],
      events: [{ id: name, notes: [{ id: "note", body: "initial" }] }] } }, requests: [], bytes: 0, status: 200 };
  server.fetch = async (url) => {
    const query = new URL(url).searchParams;
    const select = query.get("select");
    server.requests.push({ select, index: query.has("snapshot_kind") });
    const rows = server.row ? [Object.fromEntries(select.split(",").map(key => [key, server.row[key]]))] : [];
    const body = JSON.stringify(rows);
    server.bytes += Buffer.byteLength(body);
    return new Response(body, { status: server.status, headers: { "content-range": server.row ? "0-0/1" : "*/0" } });
  };
  server.change = () => {
    server.row.updated_at = V2;
    server.row.state.events[0].notes[0].body = "from device two";
  };
  return { cfg, shared, server, index: () => readAccessibleSharedCloudStates(cfg, server.fetch, options),
    visible: () => readCloudStateIfChanged(shared, server.fetch, observer) };
}

test("first visible observer revalidates the already downloaded membership payload without downloading it again", async () => {
  const { index, visible, server } = fixture("first-observer");
  const rows = await index();
  rows[0].state.events[0].notes[0].body = "unsaved local draft";
  const bytesBefore = server.bytes;
  const next = await visible();
  assert.equal(next.changed, true);
  assert.equal(next.state.events[0].notes[0].body, "initial");
  assert.deepEqual(server.requests.map(r => r.select), ["id,state,updated_at", "updated_at"]);
  assert.ok(server.bytes - bytesBefore < 100);
});

test("a background-delivered change reaches an existing observer without a second payload download", async () => {
  const { index, visible, server } = fixture("background-first");
  await index();
  await visible();
  server.change();
  await index();
  const before = server.requests.length;
  const next = await visible();
  assert.equal(next.changed, true);
  assert.equal(next.state.events[0].notes[0].body, "from device two");
  assert.deepEqual(server.requests.slice(before).map(r => r.select), ["updated_at"]);
  assert.equal((await visible()).changed, false);
});

test("a visible-delivered change reaches the membership reader without a second payload download", async () => {
  const { index, visible, server } = fixture("foreground-first");
  await index();
  await visible();
  server.change();
  const seen = await visible();
  seen.state.events[0].notes[0].body = "local draft";
  const before = server.requests.length;
  const rows = await index();
  assert.equal(rows[0].state.events[0].notes[0].body, "from device two");
  assert.equal(rows[0].updated_at, V2);
  assert.deepEqual(server.requests.slice(before).map(r => r.select), ["id,updated_at"]);
});

for (const status of [401, 403, 402, 503]) {
  test(`a cached membership payload cannot bypass the visible reader's HTTP ${status}`, async () => {
    const { index, visible, server } = fixture(`failure-${status}`);
    await index();
    server.status = status;
    await assert.rejects(visible(), error => error.status === status);
    server.status = 200;
    server.change();
    assert.equal((await visible()).state.events[0].notes[0].body, "from device two");
  });
}

test("revocation after the membership read does not display its cached payload", async () => {
  const { index, visible, server } = fixture("revoked");
  await index();
  server.row = null;
  assert.deepEqual(await visible(), { changed: false, missing: true, state: null });
  assert.deepEqual(await index(), []);
});

test("a forced read still downloads the canonical payload even if membership primed the cache", async () => {
  const { index, shared, server } = fixture("forced");
  await index();
  await readCloudState(shared, server.fetch);
  assert.equal(server.requests.at(-1).select, "state,updated_at");
});

test("a changed version without a matching cached payload fetches the actual new content", async () => {
  const { index, visible, server } = fixture("new-version");
  await index();
  server.change();
  assert.equal((await visible()).state.events[0].notes[0].body, "from device two");
  assert.deepEqual(server.requests.slice(1).map(r => r.select), ["updated_at", "state,updated_at"]);
});

for (const reset of ["logout", "account-switch"]) {
  test(`${reset} cannot reuse the previous session's membership payload`, async () => {
    const { index, shared, visible, server } = fixture(reset);
    await index();
    if (reset === "logout") invalidateVersionedReadCacheSession();
    else shared.storage.account = { ...shared.storage.account, userId: "new-user", accessToken: "new-token" };
    await visible();
    assert.equal(server.requests.at(-1).select, "state,updated_at");
  });
}
