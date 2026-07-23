import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public invite snapshot layer loads after join helpers", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicInviteSnapshotLayer\.mjs/);
  assert.match(index, /publicInviteFetchGuardLayer\.mjs/);
  assert.match(index, /publicInviteJoinFixLayer\.mjs/);
  assert.ok(
    index.indexOf("publicInviteFetchGuardLayer.mjs") <
      index.indexOf("src/app.mjs")
  );
  assert.ok(
    index.indexOf("publicProfileOverlay.mjs") <
      index.indexOf("publicInviteJoinFixLayer.mjs")
  );
  assert.ok(
    index.indexOf("publicJoinEventLayer.mjs") <
      index.indexOf("publicInviteSnapshotLayer.mjs")
  );
  assert.match(sw, /publicInviteFetchGuardLayer\.mjs/);
  assert.match(sw, /publicInviteJoinFixLayer\.mjs/);
  assert.match(sw, /publicInviteSnapshotLayer\.mjs/);
});

test("public invite snapshot layer upgrades copied links and incoming links", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");

  assert.match(layer, /buildEventInviteSnapshot/);
  assert.match(layer, /mergeInviteSnapshotIntoState/);
  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /rememberPendingInviteUrl/);
  assert.match(layer, /eventShareCredentials/);
  assert.match(layer, /readSharedEventState/);
  assert.match(layer, /mergeSharedEventIntoState/);
  assert.doesNotMatch(layer, /getActiveCloudSpaceId/);
  assert.match(layer, /loadRuntimeConfig/);
  assert.match(layer, /data-action="copy-invite"/);
  assert.match(layer, /data-action="join-existing-event"/);
  assert.match(layer, /navigator\.clipboard\.writeText/);
  assert.match(layer, /ensureNamedParticipant/);
  assert.match(layer, /findJoinLink/);
  assert.match(layer, /inviteSnapshot\.event\.id !== eventId/);
  assert.match(layer, /searchParams\.delete\("space"\)/);
  assert.match(layer, /searchParams\.delete\("key"\)/);
  assert.match(layer, /searchParams\.delete\("invite"\)/);
  assert.match(layer, /history\.replaceState/);
  assert.match(layer, /window\.location\.replace/);
  assert.doesNotMatch(
    sourceBetween(layer, "function importIncomingInviteSnapshot()", "function reloadOnceForImportedInvite"),
    /saveSharedState/
  );
});

test("snapshot joining refreshes the account token before reading the event cloud", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const joinFlow = sourceBetween(
    layer,
    "async function handleInviteSnapshotJoinClick(event)",
    "async function importIncomingSharedEvent(config)"
  );

  assert.match(joinFlow, /const joinRuntimeConfig = await loadRuntimeConfig\(\)/);
  assert.match(joinFlow, /runtimeConfig = joinRuntimeConfig/);
  assert.match(joinFlow, /readSharedEventState\(\s*joinRuntimeConfig,/);
});

test("public profile gate keeps invite snapshot while saving a new visitor", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /parseInviteSnapshot/);
  assert.match(overlay, /mergeCurrentInviteSnapshot/);
  assert.match(overlay, /mergeInviteSnapshotIntoState/);
  assert.match(overlay, /saveState/);
  assert.match(overlay, /mergeCurrentInviteSnapshot\(await loadSharedState\(\)\)/);
});

test("public invite join fix connects a new visitor before the old profile save runs", async () => {
  const layer = await readFile("src/publicInviteJoinFixLayer.mjs", "utf8");

  assert.match(layer, /data-public-profile-form/);
  assert.match(layer, /stopImmediatePropagation/);
  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /parseInviteSpaceId/);
  assert.match(layer, /mergeInviteSnapshotIntoState/);
  assert.match(layer, /ensureNamedParticipant/);
  assert.match(layer, /saveLocalProfile/);
  assert.match(layer, /buildEventInviteUrl/);
  assert.match(layer, /readSharedEventState/);
  assert.match(layer, /mergeSharedEventIntoState/);
  assert.doesNotMatch(layer, /spaceId: context\.spaceId/);
  assert.match(layer, /snapshot\.event\.id !== eventId/);
  assert.match(layer, /window\.location\.replace/);
  assert.match(layer, /sogrimInviteImported/);
});

test("public invite fetch guard prevents empty shared state from overwriting invite data", async () => {
  const layer = await readFile("src/publicInviteFetchGuardLayer.mjs", "utf8");

  assert.match(layer, /searchParams\.get\("invite"\)/);
  assert.match(layer, /window\.fetch/);
  assert.match(layer, /\/api\/state/);
  assert.match(layer, /Promise\.reject/);
});

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
}
