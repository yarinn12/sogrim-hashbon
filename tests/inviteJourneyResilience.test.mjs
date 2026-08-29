import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEventInviteSnapshot,
  buildEventInviteUrl,
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot,
  parseInviteToken
} from "../src/domain/inviteLinks.mjs";
import { eventOpenInviteToken } from "../src/data/eventInvites.mjs";
import { parseInviteSpaceId, parseInviteSpaceKey } from "../src/domain/cloudSpace.mjs";
import { isActiveEventParticipant } from "../src/domain/eventMembership.mjs";
import {
  PENDING_INVITE_URL_STORAGE_KEY,
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "../src/data/pendingInvite.mjs";

const SPACE_ID = "space-abc123";
const SPACE_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";
const INVITE_TOKEN = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456";
const ORIGIN = "https://sogrim-hesbon-app.vercel.app/";

function shareState() {
  return {
    currentParticipantId: "me",
    participants: [
      { id: "me", displayName: "ירין", kind: "user" },
      { id: "dani", displayName: "דני", kind: "user" }
    ],
    groups: [],
    events: [
      {
        id: "e1",
        name: "טיול",
        eventType: "standard",
        currency: "ILS",
        participantIds: ["me", "dani"],
        adminIds: ["me"],
        createdByParticipantId: "me",
        expenses: [],
        transfers: [],
        sharedSpaceId: SPACE_ID,
        sharedSpaceKey: SPACE_KEY,
        openInviteToken: INVITE_TOKEN
      }
    ]
  };
}

// Mirrors smartInviteUrl() in src/publicInviteSnapshotLayer.mjs.
function smartInviteUrl(runtimeConfig, state, eventId) {
  const event = state.events.find((item) => item.id === eventId);
  const cloudInvite = runtimeConfig?.storage?.mode === "supabase";
  const inviteToken = cloudInvite ? eventOpenInviteToken(event) : null;
  return buildEventInviteUrl(
    ORIGIN,
    eventId,
    cloudInvite ? null : buildEventInviteSnapshot(state, eventId),
    inviteToken
      ? { inviteToken }
      : {}
  );
}

test("a resolved cloud config produces a revocable token invite", () => {
  const url = smartInviteUrl({ storage: { mode: "supabase" } }, shareState(), "e1");

  assert.equal(parseInviteEventId(url), "e1");
  assert.equal(parseInviteToken(url), INVITE_TOKEN);
  assert.equal(parseInviteSpaceId(url), null);
  assert.equal(parseInviteSpaceKey(url), null);
});

test("invite entry paths read the verified event before merging durable state", () => {
  for (const file of [
    "src/app.mjs",
    "src/publicJoinEventLayer.mjs",
    "src/publicInviteSnapshotLayer.mjs",
    "src/publicAccountAuthLayer.mjs"
  ]) {
    const source = readFileSync(file, "utf8");
    const resolveIndex = source.indexOf("resolveEventInviteCredentials(");
    const readIndex = source.indexOf("readSharedEventState(", resolveIndex);
    const mergeIndex = source.indexOf("mergeSharedEventIntoState(", readIndex);

    assert.ok(resolveIndex >= 0, `${file} must resolve invite credentials`);
    assert.ok(readIndex > resolveIndex, `${file} must read after resolving credentials`);
    assert.ok(mergeIndex > readIndex, `${file} must merge only after its cloud read`);
  }
});

test("an unresolved config downgrades the invite to a snapshot-only link", () => {
  const late = smartInviteUrl(null, shareState(), "e1");
  const ready = smartInviteUrl({ storage: { mode: "supabase" } }, shareState(), "e1");

  assert.notEqual(late, ready, "the race changes the emitted link");
  assert.equal(parseInviteSpaceId(late), null, "no cloud credentials travel with the link");
  assert.ok(parseInviteSnapshot(late), "the snapshot fallback stays usable");
});

test("copy-invite preserves the exact prepared server invite", () => {
  const layer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");

  assert.match(layer, /async function copyResolvedInviteUrl\(button, inviteUrl\)/);
  assert.match(layer, /parseInviteEventId\(inviteUrl\) !== button\.dataset\.eventId/);
  assert.match(layer, /!parseInviteToken\(inviteUrl\)/);
  assert.doesNotMatch(layer, /smartInviteUrl/);
});

test("a late config never overwrites an already prepared invite input", () => {
  const layer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");

  assert.match(layer, /function ensureRuntimeConfigForInvites\(\)/);
  assert.match(layer, /scheduleInviteSnapshotEnhancement\(\);\s*\n\s*return config;/);
  assert.match(
    layer,
    /if \(buttons\.length && !runtimeConfig\) ensureRuntimeConfigForInvites\(\);/
  );
  const enhance = layer.slice(
    layer.indexOf("function enhanceInviteLinks()"),
    layer.indexOf("let runtimeConfigRequest")
  );
  assert.doesNotMatch(enhance, /input\.value\s*=/);
  assert.match(enhance, /must never replace it/);
});

test("invite enhancement stays synchronous so mutation ticks are never awaited", () => {
  const layer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");
  const enhance = layer.slice(
    layer.indexOf("function enhanceInviteLinks()"),
    layer.indexOf("let runtimeConfigRequest")
  );

  assert.doesNotMatch(enhance, /await/, "enhanceInviteLinks must not await");
  assert.doesNotMatch(enhance, /^async/, "enhanceInviteLinks must not be async");
});

test("the WhatsApp invite message and destination are unchanged", () => {
  const app = readFileSync("src/app.mjs", "utf8");

  assert.match(
    app,
    /const message = `מצטרפים לאירוע "\$\{event\.name\}" בסוגרים חשבון:\\n\$\{inviteUrl\}`/
  );
  assert.match(app, /https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(message\)\}/);
  assert.match(app, /data-action="share-invite-whatsapp"/);
  assert.match(app, /data-action="copy-invite"/);
});

test("WhatsApp sharing awaits the same prepared share link", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const share = app.slice(
    app.indexOf("async function shareInviteOnWhatsApp"),
    app.indexOf("function openPendingShareWindow")
  );

  assert.match(share, /const inviteUrl = await prepareEventShare\(eventId\);/);
  assert.ok(
    share.indexOf("await prepareEventShare") < share.indexOf("wa.me"),
    "the link is prepared before WhatsApp opens"
  );
});

test("concurrent share preparations reuse a single in-flight promise", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("function prepareEventShare(eventId)"),
    app.indexOf("async function prepareEventShareNow")
  );

  assert.match(prepare, /const activePreparation = eventSharePreparationPromises\.get\(eventId\);/);
  assert.match(prepare, /if \(activePreparation\) return activePreparation;/);
});

test("invite preparation cannot remain busy forever and waits for referral attribution", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("function prepareEventShare(eventId)"),
    app.indexOf("function preparePrivateEventInvitation")
  );
  const referral = app.slice(
    app.indexOf("async function prepareReferralForEventInvite"),
    app.indexOf("function renderExpenseForm")
  );

  assert.match(prepare, /settleEventSharePreparation\(/);
  assert.match(prepare, /EVENT_INVITE_TIMEOUT/);
  assert.match(prepare, /Promise\.race\(\[task, timeout\]\)/);
  assert.match(referral, /await monetization\.refresh\(\)/);
});

test("native sharing publishes new events without rewriting established shared events", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const nativeBridge = readFileSync("src/publicNativeBridgeLayer.mjs", "utf8");

  assert.match(app, /data-share-ready="\$\{shareReady\}"/);
  assert.match(app, /value="\$\{shareReady \? escapeAttribute\(inviteUrl\) : ""\}"/);
  assert.match(app, /type="hidden"\s+name="eventInviteUrl"/);
  assert.match(
    app,
    /shareFailed \? 'disabled aria-disabled="true"' : 'disabled aria-disabled="true" aria-busy="true"'/
  );
  assert.match(app, /eventSharePreparationStates/);
  const publishBeforeInvite = app.slice(
    app.indexOf("async function prepareSharedEventForInvitation"),
    app.indexOf("async function rotateCurrentEventInvite")
  );
  const rotateInvite = app.slice(
    app.indexOf("async function rotateCurrentEventInvite"),
    app.indexOf("async function copyInviteLink")
  );
  assert.match(rotateInvite, /saveSharedState\(state, \{ awaitCloud: true \}\)/);
  assert.match(rotateInvite, /!saveResult\?\.ok \|\| saveResult\?\.pending/);
  assert.match(
    publishBeforeInvite,
    /if \(!existingCredentials \|\| publishExisting\) \{/,
    "new events publish immediately while established events avoid an unrelated canonical rewrite"
  );
  assert.match(
    publishBeforeInvite,
    /state = await saveSharedEventState\(shareRuntimeConfig, state, eventId\);/,
    "events without shared credentials are published before their first invitation"
  );
  assert.match(app, /delete event\[EVENT_SPACE_ID_FIELD\]/);
  assert.match(nativeBridge, /async share\(options\)/);
  assert.match(app, /typeof globalThis\.SogrimNative\?\.share === "function"/);
  assert.match(app, /const inviteUrl = await prepareEventShare\(eventId\)/);
  assert.ok(
    app.indexOf("const inviteUrl = await prepareEventShare(eventId)") <
      app.indexOf("const shared = await nativeShare"),
    "the native share sheet must receive only a prepared cloud link"
  );
});

test("a failed invite preparation explains the problem without looking busy", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const dialog = app.slice(
    app.indexOf("function renderEventShareDialog"),
    app.indexOf("function renderEventSettingsDialog")
  );
  const retry = app.slice(
    app.indexOf("async function retryEventShare"),
    app.indexOf("async function prepareEventShareNow")
  );

  assert.match(dialog, /preparationState\.status === "verified"/);
  assert.match(dialog, /const shareFailed = preparationState\.status === "error"/);
  assert.match(dialog, /const shareUnavailableLabel/);
  assert.match(dialog, /הקישור לא זמין/);
  assert.match(dialog, /const shareCanRetry/);
  assert.match(
    dialog,
    /shareFailed \? 'disabled aria-disabled="true"' : 'disabled aria-disabled="true" aria-busy="true"'/
  );
  assert.match(dialog, /data-action="retry-event-share"/);
  assert.match(retry, /const sharePreparation = prepareEventShare\(eventId\)/);
  assert.match(retry, /reactivateDialogAfterRender\("\.event-modal"\)/);
  assert.match(retry, /עדיין לא הצלחנו להכין את הקישור/);
});

test("native invite sharing falls back instead of swallowing a rejected share sheet", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const nativeBridge = readFileSync("src/publicNativeBridgeLayer.mjs", "utf8");
  const share = app.slice(
    app.indexOf("async function shareInviteOnWhatsApp"),
    app.indexOf("function openPendingShareWindow")
  );

  assert.match(share, /const nativeShare =/);
  assert.match(share, /const shared = await nativeShare/);
  assert.match(share, /Continue to the WhatsApp fallback below/);
  assert.match(share, /window\.location\.assign\(url\)/);
  assert.doesNotMatch(
    nativeBridge,
    /stopImmediatePropagation\(\)[\s\S]*sharePlugin\.share/,
    "the bridge must not consume invite clicks before the app can run its fallback"
  );
});

test("prepareEventShareNow always reloads the runtime config", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("async function prepareEventShareNow"),
    app.indexOf("async function copyInviteLink")
  );

  assert.match(prepare, /const shareRuntimeConfig = await loadRuntimeConfig\(\);/);
  assert.ok(
    prepare.indexOf("await loadRuntimeConfig") < prepare.indexOf("saveSharedEventState"),
    "a fresh config is loaded before the cloud write"
  );
  assert.match(prepare, /saveSharedState\(state, \{ awaitCloud: true \}\)/);
  assert.doesNotMatch(
    prepare,
    /if \(\s*currentEventOpenInviteToken\(/,
    "a cached token must be verified by the server before it is reused"
  );
});

test("invite preparation recovers when an iOS resume briefly exposes fallback config", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("async function prepareEventShareNow(eventId)"),
    app.indexOf("async function prepareEventShareWithCurrentSession")
  );

  assert.match(prepare, /error\?\.code === "EVENT_INVITE_CLOUD_REQUIRED"/);
  assert.match(prepare, /await refreshRuntimeConfigNow\(\)/);
  assert.match(prepare, /freshRuntimeConfig\?\.storage\?\.mode === "supabase"/);
  assert.match(prepare, /freshUserId === expectedUserId/);
  assert.match(prepare, /return await prepareEventShareWithCurrentSession\(eventId\)/);
});

test("invite preparation refreshes an expired account session once and retries", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("async function prepareEventShareNow"),
    app.indexOf("async function prepareSharedEventForInvitation")
  );

  assert.match(prepare, /eventInviteAuthRefreshRequired\(error\)/);
  assert.match(
    prepare,
    /globalThis\.SogrimAccountSession\?\.refresh\?\.\(\)/
  );
  assert.match(prepare, /currentParticipantId\.startsWith\("account-"\)/);
  assert.match(prepare, /freshUserId !== expectedUserId/);
  assert.equal(
    prepare.match(
      /return (?:await )?prepareEventShareWithCurrentSession\(eventId\)/g
    )?.length,
    3,
    "invite preparation has one initial attempt and one bounded retry for each recoverable boundary"
  );
  assert.match(prepare, /CLOUD_STATE_AUTH_EXPIRED/);
  assert.match(prepare, /SHARED_EVENT_ACCOUNT_REQUIRED/);
});

test("cached invite candidates cannot enable copy, WhatsApp or QR before verification", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const qrLayer = readFileSync("src/publicInviteQrLayer.mjs", "utf8");
  const snapshotLayer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");
  const dialog = app.slice(
    app.indexOf("function renderEventShareDialog"),
    app.indexOf("function renderEventSettingsDialog")
  );
  const preparation = app.slice(
    app.indexOf("function prepareEventShare(eventId)"),
    app.indexOf("function settleEventSharePreparation")
  );

  assert.doesNotMatch(dialog, /cloudInviteReady/);
  assert.match(dialog, /preparationState\.status === "verified"/);
  assert.match(dialog, /shareReady \? escapeAttribute\(inviteUrl\) : ""/);
  assert.match(preparation, /markEventSharePreparing\(event\)/);
  assert.ok(
    preparation.indexOf("markEventSharePreparing(event)") <
      preparation.indexOf("prepareEventShareNow(eventId)"),
    "the dialog must enter preparing state synchronously before it renders"
  );
  assert.match(preparation, /navigator\.onLine === false && previouslyVerifiedToken/);
  assert.match(preparation, /markEventShareVerified\(event, previouslyVerifiedToken, "offline-cache"\)/);
  assert.match(preparation, /cachedInviteFallbackAllowed === true/);
  assert.match(preparation, /runtimeConfigUsesFallback\(\)/);
  assert.match(app, /error\.cachedInviteFallbackAllowed = Boolean\(/);
  assert.match(qrLayer, /copyButton\.disabled/);
  assert.match(snapshotLayer, /input\?\.dataset\.shareReady !== "true"/);
});

test("legacy raw tokens are only server candidates and never UI-ready tokens", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const currentToken = app.slice(
    app.indexOf("function currentEventOpenInviteToken"),
    app.indexOf("function rememberEventOpenInviteToken")
  );
  const candidate = app.slice(
    app.indexOf("function eventOpenInviteCandidateForServer"),
    app.indexOf("function eventInvitePreparationNotice")
  );

  assert.match(currentToken, /loadVerifiedOpenInviteToken\(runtimeConfig, event\)/);
  assert.doesNotMatch(currentToken, /loadLegacyOpenInviteCandidate|eventOpenInviteToken\(event\)/);
  assert.match(candidate, /eventOpenInviteToken\(event\)/);
  assert.match(candidate, /loadLegacyOpenInviteCandidate\(event\)/);
  assert.match(app, /eventOpenInviteCandidateForServer\(getEvent\(eventId\)\)/);
});

test("invite sharing self-recovers when an older server cannot return an active token", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("async function ensureCompatibleOpenEventInvite"),
    app.indexOf("function eventInviteAuthRefreshRequired")
  );

  assert.match(prepare, /EVENT_INVITE_ACTIVE_REQUIRES_ROTATION/);
  assert.match(prepare, /return rotateOpenEventInvite\(config, eventId\)/);
});

test("existing shared events only republish after the invite server reports a missing snapshot", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const prepare = app.slice(
    app.indexOf("async function prepareEventShareWithCurrentSession"),
    app.indexOf("function eventInviteAuthRefreshRequired")
  );

  assert.match(prepare, /const hadSharedCredentials = Boolean\(/);
  assert.match(
    prepare,
    /if \(!hadSharedCredentials\) \{\s*shareRuntimeConfig = await prepareSharedEventForInvitation\(eventId\);/
  );
  assert.match(prepare, /hadSharedCredentials &&/);
  assert.match(prepare, /EVENT_INVITE_NOT_READY/);
  assert.match(prepare, /EVENT_INVITE_NOT_ALLOWED/);
  assert.match(prepare, /publishExisting: true/);
  assert.equal(
    prepare.match(/publishExisting: true/g)?.length,
    1,
    "only one explicit repair publication is possible per invite attempt"
  );
  assert.equal(
    prepare.match(/await prepareSharedEventForInvitation\(eventId/g)?.length,
    2,
    "the existing-event publication fallback is bounded to one retry"
  );
  assert.ok(
    prepare.indexOf("ensureCompatibleOpenEventInvite(") <
      prepare.indexOf("publishExisting: true"),
    "canonical publication is attempted only after server verification fails"
  );
});

test("invite preparation surfaces safe Hebrew API errors instead of a generic dead end", () => {
  const app = readFileSync("src/app.mjs", "utf8");
  const notice = app.slice(
    app.indexOf("function eventInvitePreparationNotice"),
    app.indexOf("async function shareExpenseParticipantInvite")
  );

  assert.match(notice, /isEventInviteError\(error\)/);
  assert.match(notice, /String\(error\?\.message/);
});

test("a pending invite survives an auth redirect and is validated on the way back", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const inviteUrl = smartInviteUrl(
    { storage: { mode: "supabase" } },
    shareState(),
    "e1"
  );

  rememberPendingInviteUrl(inviteUrl, storage);
  assert.equal(store.get(PENDING_INVITE_URL_STORAGE_KEY), inviteUrl);
  assert.equal(pendingInviteUrl("https://sogrim-hesbon-app.vercel.app/", storage), inviteUrl);

  clearPendingInviteUrl(storage);
  assert.equal(store.has(PENDING_INVITE_URL_STORAGE_KEY), false);
});

test("a cleaned invite address can retry its cloud import after reconnecting", async () => {
  const layer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");
  const reconnect = layer.slice(
    layer.indexOf("function recoverPendingInviteAfterReconnect"),
    layer.indexOf("async function importIncomingSharedEvent")
  );
  const importer = layer.slice(
    layer.indexOf("async function importIncomingSharedEvent"),
    layer.indexOf("function cleanInviteAddress")
  );

  assert.match(
    layer,
    /window\.addEventListener\("online", \(\) => \{\s*recoverPendingInviteAfterReconnect\(\)/
  );
  assert.match(
    reconnect,
    /if \(pendingInviteReconnectRequest\) return pendingInviteReconnectRequest;/
  );
  assert.ok(
    reconnect.indexOf("pendingInviteUrl(window.location.href)") <
      reconnect.indexOf("loadRuntimeConfig()"),
    "the full remembered invite is captured before the async config refresh"
  );
  assert.ok(
    reconnect.indexOf("loadRuntimeConfig()") <
      reconnect.indexOf("importIncomingSharedEvent(config, rememberedInviteUrl)"),
    "the reconnect refreshes runtime config before importing"
  );
  assert.match(
    importer,
    /inviteUrl = pendingInviteUrl\(window\.location\.href\)/
  );
  assert.match(importer, /new URL\(inviteUrl, window\.location\.origin\)/);
  assert.doesNotMatch(
    layer,
    /if \(runtimeConfig\) importIncomingSharedEvent\(runtimeConfig\)/,
    "the online handler must not retry with the stale fallback config"
  );
});

test("a URL without invite evidence is never remembered as pending", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };

  assert.equal(rememberPendingInviteUrl("https://sogrim-hesbon-app.vercel.app/", storage), null);
  assert.equal(store.size, 0);
});

test("reopening an unsigned snapshot never imports or duplicates its data", () => {
  const snapshot = buildEventInviteSnapshot(shareState(), "e1");
  const state = {
    currentParticipantId: "guest",
    participants: [{ id: "guest", displayName: "אורח", kind: "user" }],
    groups: [],
    events: []
  };

  const afterFirst = mergeInviteSnapshotIntoState(state, snapshot);
  const afterSecond = mergeInviteSnapshotIntoState(afterFirst, snapshot);

  assert.equal(afterFirst, state);
  assert.equal(afterSecond, state);
  assert.deepEqual(afterSecond.participants.map((participant) => participant.id), ["guest"]);
  assert.deepEqual(afterSecond.events, []);
});

test("invite notifications distinguish a first join, an active member, and a returning member", () => {
  const activeEvent = {
    participantIds: ["member"],
    inactiveParticipantIds: []
  };
  const removedEvent = {
    participantIds: ["member"],
    inactiveParticipantIds: ["member"]
  };

  assert.equal(isActiveEventParticipant(activeEvent, "member"), true);
  assert.equal(isActiveEventParticipant(activeEvent, "new-member"), false);
  assert.equal(isActiveEventParticipant(removedEvent, "member"), false);
  assert.equal(isActiveEventParticipant(null, "member"), false);
});

test("cloud invite import notifies only when the profile was not already active", () => {
  const layer = readFileSync("src/publicInviteSnapshotLayer.mjs", "utf8");
  const importer = layer.slice(
    layer.indexOf("async function importIncomingSharedEvent"),
    layer.indexOf("function notifyJoinedEvent")
  );

  assert.match(importer, /const wasAlreadyParticipant = profile/);
  assert.match(importer, /isActiveEventParticipant\(/);
  assert.match(importer, /if \(profile && !wasAlreadyParticipant\)/);
});

test("a deleted event refuses to be resurrected by an old invite link", () => {
  const snapshot = buildEventInviteSnapshot(shareState(), "e1");
  const state = {
    currentParticipantId: "me",
    participants: [],
    groups: [],
    events: [],
    deletedEvents: [{ id: "e1", deletedAt: new Date().toISOString() }]
  };

  const merged = mergeInviteSnapshotIntoState(state, snapshot);
  assert.equal(merged.events.length, 0, "the invite cannot revive a deleted event");
});

test("invite previews arrive locked so a joiner cannot edit before syncing", () => {
  const snapshot = buildEventInviteSnapshot(shareState(), "e1");

  assert.equal(snapshot.event.locked, true);
  assert.equal(snapshot.event.invitePreview, true);
  assert.deepEqual(snapshot.event.expenses, []);
  assert.deepEqual(snapshot.event.adminIds, []);
});

test("malformed invite payloads are rejected instead of merged", () => {
  const state = shareState();

  assert.equal(parseInviteSnapshot("https://sogrim-hesbon-app.vercel.app/?invite=%7Bbroken"), null);
  assert.equal(parseInviteEventId("not a url"), null);
  assert.equal(mergeInviteSnapshotIntoState(state, null), state);
  assert.throws(() => buildEventInviteUrl(ORIGIN, "../etc/passwd"), TypeError);
});
