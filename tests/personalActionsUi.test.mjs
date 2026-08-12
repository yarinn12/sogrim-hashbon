import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home screen keeps balances and personal next actions out of the event list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = app.match(/function renderHome\(\) \{[\s\S]*?(?=\nfunction renderRecentEventShortcut)/);

  assert.ok(home);
  assert.doesNotMatch(home[0], /renderPersonalDashboard|renderPersonalActionList|renderRecentEventShortcut/);
  assert.match(home[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(home[0], /renderEventSearchPanel/);
  assert.doesNotMatch(home[0], /event-search/);
});

test("event share dialog can send the invite link through WhatsApp", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const shareHandler = app.slice(
    app.indexOf("async function shareInviteOnWhatsApp"),
    app.indexOf("async function copySettlementSummary")
  );
  const openShareAction = app.slice(
    app.indexOf('if (action === "open-event-share")'),
    app.indexOf('if (action === "open-event-settings")')
  );
  const openPreparedShare = app.slice(
    app.indexOf("async function openPreparedEventShare"),
    app.indexOf("async function prepareEventShareNow")
  );

  assert.match(app, /data-action="share-invite-whatsapp"/);
  assert.match(app, /function shareInviteOnWhatsApp/);
  assert.match(app, /eventInviteUrl\(eventId\)/);
  assert.match(app, /wa\.me\/\?text=/);
  assert.match(openShareAction, /await openPreparedEventShare/);
  assert.ok(
    openPreparedShare.indexOf("openEventDialog") <
      openPreparedShare.indexOf("await sharePreparation"),
    "the share dialog should open before cloud preparation finishes"
  );
  assert.ok(
    openPreparedShare.indexOf("await sharePreparation") <
      openPreparedShare.indexOf('notice = "קישור ההצטרפות מוכן לשיתוף."'),
    "a prepared invite should replace stale sync warnings with a clear success message"
  );
  assert.ok(
    shareHandler.indexOf("openPendingShareWindow") <
      shareHandler.indexOf("await prepareEventShare"),
    "the WhatsApp window should open while the click still has user activation"
  );
  assert.match(shareHandler, /window\.location\.assign\(url\)/);
  assert.match(shareHandler, /shareWindow\.location\.replace\(url\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) auto auto/);
});

test("home keeps only the referral benefit while event joining stays inside events", async () => {
  const [app, referralLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicReferralRewardsLayer.mjs", "utf8")
  ]);
  const home = app.match(/function renderHome\(\) \{[\s\S]*?(?=\nfunction renderRecentEventShortcut)/);

  assert.ok(home);
  assert.doesNotMatch(app, /function renderHomeEventTools/);
  assert.doesNotMatch(home[0], /data-action="join-existing-event"/);
  assert.match(referralLayer, /referralRewardCard\("home"\)/);
  assert.match(referralLayer, /data-referral-context="\$\{context\}"/);
  assert.doesNotMatch(home[0], /data-action="home-share-event"/);
  assert.match(app, /data-action="open-event-share"/);
  assert.match(app, /data-action="share-invite-whatsapp"/);
  assert.match(app, /data-action="copy-invite"/);
});

test("native invitation sharing uses the share button and leaves copy as copy", async () => {
  const [app, bridge] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8")
  ]);

  assert.match(app, /globalThis\.SogrimNative\?\.share/);
  assert.match(bridge, /async share\(options\)/);
  assert.doesNotMatch(bridge, /\[data-action='share-invite-whatsapp'\]/);
  assert.doesNotMatch(bridge, /\[data-action='copy-invite'\]/);
});

test("event sharing refreshes the stored account token before cloud sync", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const prepareShare = app.slice(
    app.indexOf("async function prepareEventShareNow(eventId)"),
    app.indexOf("async function copyInviteLink(eventId)")
  );

  assert.match(prepareShare, /const shareRuntimeConfig = await loadRuntimeConfig\(\)/);
  assert.match(prepareShare, /runtimeConfig = shareRuntimeConfig/);
  assert.match(
    prepareShare,
    /saveSharedEventState\(shareRuntimeConfig, state, eventId\)/
  );
});
