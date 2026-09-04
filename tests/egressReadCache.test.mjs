import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScopedReadCache } from "../src/data/versionedReadCache.mjs";
import { readCloudState, readCloudStateIfChanged, readAccessibleSharedCloudStates, saveCloudState } from "../src/data/cloudStore.mjs";
import { loadFriendNetwork } from "../src/data/friendsStore.mjs";

const V1 = "2026-09-04T08:00:00.000Z";
const V2 = "2026-09-04T08:01:00.000Z";
const V3 = "2026-09-04T08:02:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const IMAGE = "data:image/jpeg;base64," + "A".repeat(60_000);
const optimized = { preferCached: true };

function config(name) {
  return { storage: { mode: "supabase", url: "https://egress.example.test", table: "app_snapshots",
    anonKey: "test-public-key", spaceId: name, spaceKey: "test-workspace-key",
    account: { userId: USER, accessToken: `test-token-${name}`, spaceId: name } } };
}
function snapshot(id, version = V1) {
  return { id, updated_at: version, snapshot_kind: "shared_event", state: {
    currentParticipantId: `account-${USER}`,
    participants: [{ id: `account-${USER}`, displayName: "Test Owner", avatarImage: IMAGE }],
    groups: [], events: [{ id: `event-${id}`, name: "Test Event", notes: [{ id: "note", text: "first" }] }]
  } };
}
function project(row, fields) {
  return Object.fromEntries(fields.split(",").filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}
function fakeSnapshots(initial, { pageSize = 500 } = {}) {
  const server = { rows: new Map(initial.map((row) => [row.id, structuredClone(row)])), requests: [], bytes: 0,
    fail: null, afterIndex: null };
  server.fetch = async (url, options = {}) => {
    const query = new URL(url).searchParams;
    const select = query.get("select") ?? "state,updated_at";
    const request = { select, ids: query.getAll("id"), method: options.method ?? "GET" };
    server.requests.push(request);
    if (server.fail?.(request)) return new Response("{}", { status: 503 });
    let rows = [...server.rows.values()];
    if (query.has("snapshot_kind")) rows = rows.filter((row) => row.snapshot_kind === "shared_event");
    for (const filter of query.getAll("id")) {
      if (filter.startsWith("eq.")) rows = rows.filter((row) => row.id === filter.slice(3));
      if (filter.startsWith("gt.")) rows = rows.filter((row) => row.id > filter.slice(3));
      if (filter.startsWith("in.(")) {
        const ids = JSON.parse(`[${filter.slice(4, -1)}]`);
        rows = rows.filter((row) => ids.includes(row.id));
      }
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    if (request.method === "PATCH") {
      rows = rows.filter((row) => `eq.${row.updated_at}` === query.get("updated_at"));
      for (const row of rows) Object.assign(row, JSON.parse(options.body));
    }
    const total = rows.length;
    rows = rows.slice(0, pageSize).map((row) => project(row, select));
    const body = JSON.stringify(rows);
    server.bytes += Buffer.byteLength(body);
    if (select === "id,updated_at") server.afterIndex?.();
    return new Response(body, { status: 200, headers: {
      "content-type": "application/json", "content-range": rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`
    } });
  };
  return server;
}
function sharedReads(cfg, server) { return readAccessibleSharedCloudStates(cfg, server.fetch, optimized); }

test("unchanged personal refreshes reuse only server-validated data and reduce response bytes", async () => {
  const cfg = config("personal-egress");
  const server = fakeSnapshots([snapshot(cfg.storage.spaceId)]);
  const first = await readCloudState(cfg, server.fetch, optimized);
  const fullBytes = server.bytes;
  first.events[0].notes[0].text = "local draft must not enter cache";
  for (let tick = 0; tick < 20; tick += 1) {
    const next = await readCloudState(cfg, server.fetch, optimized);
    assert.equal(next.events[0].notes[0].text, "first");
  }
  assert.equal(server.requests.filter((r) => r.select.includes("state")).length, 1);
  assert.equal(server.requests.length, 21);
  assert.ok(server.bytes - fullBytes < fullBytes * 20 * 0.02);
  const row = server.rows.get(cfg.storage.spaceId);
  row.updated_at = V2;
  row.state.events[0].notes[0].text = "second device";
  assert.equal((await readCloudState(cfg, server.fetch, optimized)).events[0].notes[0].text, "second device");
});

test("a successful write receipt cannot relabel an older cached personal payload", async () => {
  const cfg = config("personal-write-receipt");
  const server = fakeSnapshots([snapshot(cfg.storage.spaceId)]);
  const state = await readCloudState(cfg, server.fetch, optimized);
  state.events[0].notes[0].text = "saved new note";
  await saveCloudState(cfg, state, server.fetch);
  assert.equal((await readCloudState(cfg, server.fetch, optimized)).events[0].notes[0].text, "saved new note");
  assert.equal(server.requests.filter((r) => r.method === "GET" && r.select.includes("state")).length, 2);
});

test("forced conflict reads stay full reads and do not silence foreground observers", async () => {
  const cfg = config("personal-observer");
  const server = fakeSnapshots([snapshot(cfg.storage.spaceId)]);
  await readCloudStateIfChanged(cfg, server.fetch, { observerKey: "open-event" });
  await readCloudState(cfg, server.fetch, optimized);
  server.rows.get(cfg.storage.spaceId).updated_at = V2;
  await readCloudState(cfg, server.fetch); // Existing conflict retry path.
  assert.equal(server.requests.at(-1).select, "state,updated_at");
  assert.equal((await readCloudStateIfChanged(cfg, server.fetch, { observerKey: "open-event" })).changed, true);
});

test("personal cache never hides a deleted row or failed authorization check", async () => {
  const cfg = config("personal-deleted");
  const server = fakeSnapshots([snapshot(cfg.storage.spaceId)]);
  await readCloudState(cfg, server.fetch, optimized);
  server.fail = () => true;
  await assert.rejects(readCloudState(cfg, server.fetch, optimized));
  server.fail = null;
  server.rows.clear();
  assert.equal(await readCloudState(cfg, server.fetch, optimized), null);
});

test("warm membership checks fetch only a changed note and preserve caller isolation", async () => {
  const cfg = config("membership-changed-note");
  const server = fakeSnapshots([snapshot("a"), snapshot("b")]);
  const first = await sharedReads(cfg, server);
  const fullBytes = server.bytes;
  first[0].state.events[0].notes[0].text = "unsaved local edit";
  const second = await sharedReads(cfg, server);
  assert.equal(second[0].state.events[0].notes[0].text, "first");
  assert.equal(server.requests.at(-1).select, "id,updated_at");
  assert.ok(server.bytes - fullBytes < fullBytes * 0.02);
  server.rows.get("b").updated_at = V2;
  server.rows.get("b").state.events[0].notes = [];
  server.rows.get("b").state.events[0].deletedNotes = [{ id: "note", deletedAt: V2 }];
  const changed = await sharedReads(cfg, server);
  assert.deepEqual(server.requests.at(-1).ids, ['in.("b")']);
  assert.deepEqual(changed[1].state.events[0].notes, []);
  assert.equal(changed[1].state.events[0].deletedNotes[0].id, "note");
});

test("membership index detects joins and revocations without a personal version change", async () => {
  const cfg = config("membership-new-join");
  const server = fakeSnapshots([snapshot("a")]);
  await sharedReads(cfg, server);
  server.rows.set("b", snapshot("b"));
  assert.deepEqual((await sharedReads(cfg, server)).map((row) => row.id), ["a", "b"]);
  assert.deepEqual(server.requests.at(-1).ids, ['in.("b")']);
  server.rows.delete("a");
  assert.deepEqual((await sharedReads(cfg, server)).map((row) => row.id), ["b"]);
  assert.equal(server.requests.at(-1).select, "id,updated_at");
});

test("an unavailable index or changed payload fails instead of returning cached success", async () => {
  const cfg = config("membership-retry");
  const server = fakeSnapshots([snapshot("a")]);
  await sharedReads(cfg, server);
  server.fail = (r) => r.select === "id,updated_at";
  await assert.rejects(sharedReads(cfg, server));
  server.rows.get("a").updated_at = V2;
  server.fail = (r) => r.select.includes("state");
  await assert.rejects(sharedReads(cfg, server));
  server.fail = null;
  assert.equal((await sharedReads(cfg, server))[0].updated_at, V2);
});

test("a membership revoked between index and content is never restored from cache", async () => {
  const cfg = config("membership-race");
  const server = fakeSnapshots([snapshot("a")]);
  await sharedReads(cfg, server);
  server.rows.get("a").updated_at = V2;
  server.afterIndex = () => server.rows.delete("a");
  assert.deepEqual(await sharedReads(cfg, server), []);
});

test("warm metadata and changed-row reads preserve pagination below the requested page size", async () => {
  const cfg = config("membership-paged");
  const server = fakeSnapshots([snapshot("a"), snapshot("b"), snapshot("c")], { pageSize: 2 });
  await sharedReads(cfg, server);
  for (const row of server.rows.values()) row.updated_at = V2;
  const result = await sharedReads(cfg, server);
  assert.equal(result.length, 3);
  assert.equal(result.every((row) => row.updated_at === V2), true);
  assert.equal(server.requests.filter((r) => r.select === "id,updated_at").length, 2);
});

test("changed snapshot requests are batched and cache eviction cannot drop events", async () => {
  const cfg = config("membership-bounded");
  const server = fakeSnapshots(Array.from({ length: 140 }, (_, i) => {
    const row = snapshot(`shared-${String(i).padStart(3, "0")}`);
    row.state.participants[0].avatarImage = "";
    return row;
  }));
  await sharedReads(cfg, server);
  assert.equal((await sharedReads(cfg, server)).length, 140);
  for (const row of server.rows.values()) row.updated_at = V2;
  const before = server.requests.length;
  assert.equal((await sharedReads(cfg, server)).length, 140);
  const batches = server.requests.slice(before).filter((r) => r.select.includes("state"));
  assert.equal(batches.length, 7);
  for (const r of batches) assert.ok(JSON.parse(`[${r.ids[0].slice(4, -1)}]`).length <= 20);
});

test("membership query values containing reserved punctuation remain one quoted value", async () => {
  const cfg = config("membership-escaped-id");
  const server = fakeSnapshots([snapshot('a,quote"slash\\value'), snapshot("b")]);
  await sharedReads(cfg, server);
  server.rows.values().next().value.updated_at = V2;
  const result = await sharedReads(cfg, server);
  assert.equal(result.length, 2);
  assert.equal(result[0].updated_at, V2);
});

test("account/token switches and late old responses cannot contaminate a scoped cache", () => {
  const cacheFor = createScopedReadCache();
  const cfgA = config("scope-a");
  const cfgB = config("scope-b");
  cfgB.storage.account.userId = FRIEND;
  const transport = () => {};
  const cacheA = cacheFor(cfgA, transport);
  cacheA.set("row", V1, { owner: "A" });
  const cacheB = cacheFor(cfgB, transport);
  cacheA.set("row", V2, { owner: "late A" });
  assert.equal(cacheB.get("row", V2), null);
  assert.equal(cacheFor(cfgA, transport).get("row", V1), null);
  cacheB.set("row", V1, { owner: "B" });
  cfgB.storage.account.accessToken = "refreshed-token";
  assert.equal(cacheFor(cfgB, transport).get("row", V1), null);
  assert.equal(cacheFor({ storage: { mode: "supabase" } }, transport), null);
});

test("read cache honors memory/count limits and snapshots input/output by value", () => {
  const cache = createScopedReadCache({ maxEntries: 2, maxBytes: 200 })(config("limits"), () => {});
  const value = { text: "one" };
  cache.set("a", V1, value);
  value.text = "mutated";
  cache.get("a", V1).text = "mutated again";
  assert.equal(cache.get("a", V1).text, "one");
  cache.set("b", V1, { text: "two" });
  cache.get("a", V1);
  cache.set("c", V1, { text: "three" });
  assert.equal(cache.get("b", V1), null);
  cache.set("huge", V1, { text: "x".repeat(1000) });
  assert.equal(cache.has("huge"), false);
  assert.equal(cache.get("a", V2), null);
});

function profile(userId, name) {
  return { user_id: userId, display_name: name, username: name.toLowerCase(), username_customized: true,
    avatar_preset: "avatar-1", avatar_image: IMAGE, avatar_image_updated_at: V1, updated_at: V1 };
}
function fakeFriends() {
  const server = { profiles: [profile(USER, "Owner"), profile(FRIEND, "Friend")], requests: [], bytes: 0,
    relationship: true, failProfiles: false, legacy: false };
  server.fetch = async (url) => {
    const parsed = new URL(url);
    const select = parsed.searchParams.get("select") ?? "";
    server.requests.push({ path: parsed.pathname, select, ids: parsed.searchParams.get("user_id") });
    let rows = [];
    if (parsed.pathname.endsWith("/friendships") && server.relationship) rows = [{ id: "friendship", requester_id: USER, addressee_id: FRIEND, status: "accepted" }];
    if (parsed.pathname.endsWith("/user_profiles")) {
      if (server.failProfiles) return new Response("{}", { status: 401 });
      if (server.legacy && select.includes("avatar_image_updated_at")) {
        return new Response(JSON.stringify({ message: "column avatar_image_updated_at does not exist" }), { status: 400 });
      }
      const filter = parsed.searchParams.get("user_id");
      const ids = filter.slice(4, -1).split(",");
      rows = server.profiles.filter((row) => ids.includes(row.user_id)).map((row) => project(row, select));
    }
    const body = JSON.stringify(rows);
    server.bytes += Buffer.byteLength(body);
    return new Response(body, { headers: { "content-type": "application/json" } });
  };
  return server;
}
function friendReads(cfg, server) { return loadFriendNetwork(cfg, server.fetch, { preferCachedProfiles: true }); }

test("unchanged friend refreshes validate metadata without downloading avatar bodies again", async () => {
  const cfg = config("friends-egress");
  const server = fakeFriends();
  const first = await friendReads(cfg, server);
  first.profiles[0].avatar_image = "local draft";
  const baseline = server.bytes;
  const next = await friendReads(cfg, server);
  assert.equal(next.profiles[0].avatar_image, IMAGE);
  assert.equal(server.requests.length, 8);
  assert.equal(server.requests.at(-1).select.includes("avatar_image,"), false);
  assert.ok(server.bytes - baseline < baseline * 0.02);
});

test("avatar removal and profile changes fetch only the changed friend", async () => {
  const cfg = config("friends-changes");
  const server = fakeFriends();
  await friendReads(cfg, server);
  server.profiles[1].avatar_image = null;
  server.profiles[1].avatar_image_updated_at = V2;
  let next = await friendReads(cfg, server);
  assert.equal(next.profiles[1].avatar_image, null);
  assert.equal(server.requests.at(-1).ids, `in.(${FRIEND})`);
  server.profiles[1].display_name = "Renamed Without Clock Change";
  next = await friendReads(cfg, server);
  assert.equal(next.profiles[1].display_name, "Renamed Without Clock Change");
});

test("friend cache does not retain a removed relationship or unauthorized profile", async () => {
  const cfg = config("friends-revoked");
  const server = fakeFriends();
  await friendReads(cfg, server);
  server.failProfiles = true;
  await assert.rejects(friendReads(cfg, server), (error) => error.code === "CLOUD_STATE_AUTH_EXPIRED");
  server.failProfiles = false;
  server.profiles = server.profiles.filter((row) => row.user_id !== FRIEND);
  assert.deepEqual((await friendReads(cfg, server)).profiles.map((row) => row.user_id), [USER]);
  server.relationship = false;
  assert.deepEqual((await friendReads(cfg, server)).profiles.map((row) => row.user_id), [USER]);
});

test("legacy profile schemas continue through the existing full-read fallback", async () => {
  const cfg = config("friends-legacy");
  const server = fakeFriends();
  await friendReads(cfg, server);
  server.legacy = true;
  server.profiles[1].avatar_image = "legacy-image-change";
  assert.equal((await friendReads(cfg, server)).profiles[1].avatar_image, "legacy-image-change");
});

test("optimized reads are wired into account recovery and preserve fast event intervals/offline assets", () => {
  const local = readFileSync(new URL("../src/data/localStore.mjs", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(local, /recoverAccessibleSharedEvents\(freshConfig, initialState, globalThis.fetch, \{ preferCached: true \}\)/);
  assert.match(local, /let state = cleanLegacyStarterData\([\s\S]*?preferCached: true/);
  assert.match(app, /loadFriendNetwork\(runtimeConfig, globalThis.fetch, \{\s*preferCachedProfiles: true/);
  assert.match(app, /ACTIVE_EVENT_SYNC_INTERVAL_MS = 1_000/);
  assert.match(app, /BACKGROUND_ACCOUNT_SYNC_INTERVAL_MS = 15_000/);
  assert.match(sw, /\/src\/data\/versionedReadCache.mjs/);
});
