import assert from "node:assert/strict";

// Local synthetic responses only. Never read .env or use a real network fetch.
// This measures JSON response bodies, not Supabase's billable/wire egress.
const origin = "https://sync-egress.invalid";
const eventId = "synthetic-trip";
const sharedId = "synthetic-shared";
const version = tick => new Date(Date.UTC(2026, 8, 7, 10, 0, tick)).toISOString();
const row = { id: sharedId, updated_at: version(0), state: {
  participants: Array.from({ length: 6 }, (_, index) => ({ id: `participant-${index}`,
    displayName: `Synthetic ${index}`, avatarImage: "data:image/jpeg;base64," + "a".repeat(40_000) })),
  groups: [], events: [{ id: eventId, notes: [{ id: "note", body: "initial" }], expenses: [] }]
} };
const clients = [];
for (let index = 0; index < 2; index += 1) {
  // Separate module instances model the independent caches of two devices.
  const moduleUrl = new URL("../src/data/cloudStore.mjs", import.meta.url);
  moduleUrl.searchParams.set("syntheticDevice", String(index));
  const cloud = await import(moduleUrl.href);
  const userId = `synthetic-user-${index}`;
  const account = { userId, accessToken: `synthetic-token-${index}`, spaceId: `personal-${index}` };
  const config = { storage: { mode: "supabase", url: origin, table: "app_snapshots",
    anonKey: "synthetic-public-key", spaceId: account.spaceId, spaceKey: "synthetic-space-key", account } };
  const sharedConfig = { ...config, storage: { ...config.storage, spaceId: sharedId, snapshotKind: "shared_event" } };
  const counts = { responses: 0, jsonResponseBytes: 0, fullSnapshots: 0, versionResponses: 0 };
  const fullReadsByVersion = new Map();
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin);
    assert.equal(parsed.pathname, "/rest/v1/app_snapshots");
    assert.equal(options.headers.authorization, `Bearer ${account.accessToken}`);
    assert.equal(options.method ?? "GET", "GET");
    const fields = parsed.searchParams.get("select").split(",");
    const payload = JSON.stringify([Object.fromEntries(fields.map(field => [field, row[field]]))]);
    counts.responses += 1;
    counts.jsonResponseBytes += Buffer.byteLength(payload);
    if (fields.includes("state")) {
      counts.fullSnapshots += 1;
      fullReadsByVersion.set(row.updated_at, (fullReadsByVersion.get(row.updated_at) ?? 0) + 1);
    } else counts.versionResponses += 1;
    return new Response(payload, { headers: { "content-type": "application/json", "content-range": "0-0/1" } });
  };
  let visibleState = null;
  clients.push({ counts, fullReadsByVersion,
    async membership() {
      const rows = await cloud.readAccessibleSharedCloudStates(config, fetchImpl, { preferCached: true });
      assert.deepEqual(rows[0].state.events[0].notes, row.state.events[0].notes);
    },
    async visible() {
      const result = await cloud.readCloudStateIfChanged(sharedConfig, fetchImpl, { observerKey: "visible-event" });
      if (result.changed) visibleState = result.state;
      assert.deepEqual(visibleState.events[0].notes, row.state.events[0].notes);
    }
  });
}

for (const client of clients) {
  await client.membership();
  await client.visible();
}
// Virtual ticks, not wall-clock measurements: 120 one-second polls and an
// account membership refresh every 15 seconds. Alternate which reader wins.
for (let tick = 1; tick <= 120; tick += 1) {
  if (tick % 30 === 0) {
    row.updated_at = version(tick);
    row.state.events[0].notes = tick === 90 ? [] : [{ id: "note", body: `peer update ${tick}` }];
  }
  for (const client of clients) {
    const indexFirst = tick % 60 === 0;
    if (tick % 15 === 0 && indexFirst) await client.membership();
    await client.visible();
    if (tick % 15 === 0 && !indexFirst) await client.membership();
  }
}
for (const client of clients) {
  assert.equal(client.fullReadsByVersion.size, 5);
  for (const downloads of client.fullReadsByVersion.values()) assert.equal(downloads, 1,
    "Each confirmed event version must be downloaded once, not once per reader");
}
console.log(JSON.stringify({ kind: "local-synthetic-sync-egress", productionTrafficGenerated: false,
  virtualSeconds: 120, clients: clients.length, participants: 6, syntheticAvatarCharacters: 40_000,
  peerChanges: 4, unchangedPollingIntervalMs: 1_000, membershipIntervalMs: 15_000,
  clientsObservedEveryChange: true, downloadsPerVersionPerClient: 1,
  perClient: clients.map(client => client.counts),
  limits: ["Not a live cross-device or latency test", "Uncompressed JSON bodies only; not billed egress",
    "Excludes personal snapshots, auth, friends, writes, server calls, backups and other users",
    "Does not establish monthly Free-plan capacity"] }, null, 2));
