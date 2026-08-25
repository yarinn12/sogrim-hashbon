import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseInviteEventId, parseInviteToken } from "../src/domain/inviteLinks.mjs";
import { parseCompactInviteUrl } from "../src/domain/compactInvite.mjs";

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

test("public invite snapshot layer upgrades links but imports only verified events", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");

  assert.doesNotMatch(layer, /buildEventInviteSnapshot/);
  assert.match(layer, /must never replace it with a locally reconstructed fallback/);
  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /rememberPendingInviteUrl/);
  assert.match(layer, /startInviteImportAfterAccountReady/);
  assert.match(
    layer,
    /document\.addEventListener\("account-auth-ready", initializeInviteImport, \{\s*once: true/
  );
  assert.match(layer, /resolveEventInviteCredentials/);
  assert.match(layer, /settle-friends:entitlements-changed/);
  assert.match(layer, /parseInviteToken/);
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
  assert.match(layer, /searchParams\.delete\("t"\)/);
  assert.match(layer, /history\.replaceState/);
  assert.match(layer, /window\.location\.replace/);
  const initializeFlow = sourceBetween(
    layer,
    "async function initializeInviteImport()",
    "function scheduleInviteSnapshotEnhancement()"
  );
  assert.match(initializeFlow, /const imported = await importIncomingSharedEvent\(config\)/);
  assert.match(initializeFlow, /if \(imported\) cleanInviteAddress\(\)/);
  assert.doesNotMatch(layer, /function importIncomingInviteSnapshot/);
  assert.doesNotMatch(layer, /mergeInviteSnapshotIntoState/);
});

test("snapshot joining refreshes the account token before reading the event cloud", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const joinFlow = sourceBetween(
    layer,
    "async function handleInviteSnapshotJoinClick(event)",
    "function recoverPendingInviteAfterReconnect()"
  );

  assert.match(joinFlow, /const joinRuntimeConfig = await loadRuntimeConfig\(\)/);
  assert.match(joinFlow, /runtimeConfig = joinRuntimeConfig/);
  assert.match(joinFlow, /readSharedEventState\(\s*joinRuntimeConfig,/);
  assert.match(joinFlow, /resolveEventInviteCredentials\(/);
  assert.match(joinFlow, /const sharedEventState = await readSharedEventState|sharedEventState = await readSharedEventState/);
  assert.match(joinFlow, /mergeSharedEventIntoState\(/);
  assert.doesNotMatch(joinFlow, /mergeInviteSnapshotIntoState/);
  assert.doesNotMatch(joinFlow, /attachSharedEventCredentials/);
  assert.ok(
    joinFlow.indexOf("resolveEventInviteCredentials(") <
      joinFlow.indexOf("readSharedEventState(")
  );
  assert.ok(
    joinFlow.indexOf("readSharedEventState(") <
      joinFlow.indexOf("mergeSharedEventIntoState(")
  );
  assert.ok(
    joinFlow.indexOf("mergeSharedEventIntoState(") <
      joinFlow.indexOf("saveState(state)")
  );
  assert.match(joinFlow, /if \(inviteJoinBusy\) return/);
  assert.match(joinFlow, /inviteJoinBusy = true/);
  assert.match(joinFlow, /button\.disabled = true/);
  assert.match(joinFlow, /finally \{[\s\S]*?inviteJoinBusy = false/);
  assert.match(joinFlow, /if \(button\.isConnected\) button\.disabled = false/);
});

test("the public join panel persists only a server-verified event", async () => {
  const layer = await readFile("src/publicJoinEventLayer.mjs", "utf8");
  const joinFlow = sourceBetween(
    layer,
    "async function joinExistingEventFromPublicPanel()",
    "function parseEventId(value)"
  );

  assert.doesNotMatch(layer, /mergeInviteSnapshotIntoState|attachSharedEventCredentials/);
  assert.doesNotMatch(joinFlow, /parseInviteSnapshot/);
  assert.match(joinFlow, /resolveEventInviteCredentials\(/);
  assert.match(joinFlow, /readSharedEventState\(/);
  assert.match(joinFlow, /mergeSharedEventIntoState\(/);
  assert.ok(
    joinFlow.indexOf("resolveEventInviteCredentials(") <
      joinFlow.indexOf("readSharedEventState(")
  );
  assert.ok(
    joinFlow.indexOf("readSharedEventState(") <
      joinFlow.indexOf("mergeSharedEventIntoState(")
  );
  assert.ok(
    joinFlow.indexOf("mergeSharedEventIntoState(") <
      joinFlow.indexOf("saveState(state)")
  );
});

test("offline invite fallback opens only an already verified cached event", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const cachedFlow = sourceBetween(
    layer,
    "function openVerifiedCachedEvent(eventId)",
    "function recoverPendingInviteAfterReconnect()"
  );

  assert.match(cachedFlow, /eventShareCredentials\(cachedEvent\)/);
  assert.match(cachedFlow, /window\.location\.replace\(/);
  assert.doesNotMatch(cachedFlow, /saveState|saveSharedState|mergeInviteSnapshotIntoState/);
});

test("reconnecting refreshes config once while retaining compact invite credentials", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const reconnectFlow = sourceBetween(
    layer,
    "function recoverPendingInviteAfterReconnect()",
    "async function importIncomingSharedEvent"
  );

  assert.match(
    reconnectFlow,
    /if \(pendingInviteReconnectRequest\) return pendingInviteReconnectRequest;/
  );
  assert.match(
    reconnectFlow,
    /const rememberedInviteUrl = pendingInviteUrl\(window\.location\.href\);/
  );
  assert.match(
    reconnectFlow,
    /const eventId = parseInviteEventId\(rememberedInviteUrl\);/
  );
  assert.match(reconnectFlow, /pendingInviteReconnectRequest = loadRuntimeConfig\(\)/);
  assert.match(
    reconnectFlow,
    /importIncomingSharedEvent\(\s*config,\s*rememberedInviteUrl\s*\)/
  );
  assert.match(reconnectFlow, /if \(imported\) cleanInviteAddress\(\)/);
  assert.match(
    reconnectFlow,
    /\.finally\(\(\) => \{\s*pendingInviteReconnectRequest = null;/
  );
  assert.ok(
    reconnectFlow.indexOf("rememberedInviteUrl = pendingInviteUrl") <
      reconnectFlow.indexOf("loadRuntimeConfig()")
  );
  assert.ok(
    reconnectFlow.indexOf("loadRuntimeConfig()") <
      reconnectFlow.indexOf("importIncomingSharedEvent(")
  );
});

test("a successful invite import cannot leak into the next account", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const importFlow = sourceBetween(
    layer,
    "async function importIncomingSharedEvent",
    "function notifyJoinedEvent"
  );

  assert.match(importFlow, /clearPendingInviteUrl\(\);\s*return true;/);
});

test("a successful token-path import removes the raw token from browser history", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const cleanAddressSource = sourceBetween(
    layer,
    "function cleanInviteAddress()",
    "function findJoinLink()"
  );
  const eventId = "event-secure";
  const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
  let replacedUrl = null;
  const window = {
    location: {
      href: `https://sogrim-hesbon-app.vercel.app/i/${eventId}/t/${token}?ref=0123456789abcdefabcd`
    },
    history: {
      state: { joined: true },
      replaceState(_state, _title, url) {
        replacedUrl = new URL(String(url));
      }
    }
  };
  const run = new Function(
    "window",
    "URL",
    "parseInviteEventId",
    "parseInviteToken",
    "parseCompactInviteUrl",
    `${cleanAddressSource}\ncleanInviteAddress();`
  );

  run(
    window,
    URL,
    parseInviteEventId,
    parseInviteToken,
    parseCompactInviteUrl
  );

  assert.equal(replacedUrl.pathname, "/");
  assert.equal(replacedUrl.searchParams.get("event"), eventId);
  assert.equal(replacedUrl.searchParams.get("ref"), "0123456789abcdefabcd");
  assert.equal(replacedUrl.searchParams.has("t"), false);
  assert.doesNotMatch(replacedUrl.toString(), new RegExp(token));
});

test("invite context is retained until the participant save reaches the shared event", async () => {
  const layer = await readFile("src/publicInviteSnapshotLayer.mjs", "utf8");
  const importFlow = layer.slice(
    layer.indexOf("async function importIncomingSharedEvent"),
    layer.indexOf("function notifyJoinedEvent")
  );

  assert.match(importFlow, /if \(!saveResult\?\.ok && !saveResult\?\.partial\) return false;/);
  assert.ok(
    importFlow.indexOf("if (!saveResult?.ok && !saveResult?.partial) return false;") <
      importFlow.indexOf("clearPendingInviteUrl();")
  );
});

test("legacy profile gates cannot persist unsigned snapshots through the compatibility helper", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");
  const inviteLinks = await readFile("src/domain/inviteLinks.mjs", "utf8");

  assert.match(overlay, /parseInviteSnapshot/);
  assert.match(overlay, /mergeCurrentInviteSnapshot/);
  assert.match(overlay, /mergeInviteSnapshotIntoState/);
  assert.match(overlay, /saveState/);
  assert.match(overlay, /mergeCurrentInviteSnapshot\(await loadSharedState\(\)\)/);
  const mergeBoundary = sourceBetween(
    inviteLinks,
    "export function mergeInviteSnapshotIntoState",
    "function normalizeInviteSnapshot"
  );
  assert.match(mergeBoundary, /return state;/);
  assert.doesNotMatch(mergeBoundary, /participants:|groups:|events:/);
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
  assert.match(layer, /let inviteProfileJoinBusy = false/);
  assert.match(layer, /if \(!context \|\| inviteProfileJoinBusy\) return/);
  assert.match(layer, /setInviteProfileJoinBusy\(true\)/);
  assert.match(layer, /let shouldReleaseBusy = true/);
  assert.match(layer, /shouldReleaseBusy = false/);
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
