import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home screen keeps balances and personal next actions out of the event list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderHomeEventTools/);

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

  assert.match(app, /data-action="share-invite-whatsapp"/);
  assert.match(app, /function shareInviteOnWhatsApp/);
  assert.match(app, /eventInviteUrl\(eventId\)/);
  assert.match(app, /wa\.me\/\?text=/);
  assert.ok(
    openShareAction.indexOf("openEventDialog") <
      openShareAction.indexOf("await prepareEventShare"),
    "the share dialog should open before cloud preparation finishes"
  );
  assert.ok(
    openShareAction.indexOf("await prepareEventShare") <
      openShareAction.indexOf('notice = "קישור ההצטרפות מוכן לשיתוף."'),
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

test("native invitation sharing uses the share button and leaves copy as copy", async () => {
  const bridge = await readFile("src/publicNativeBridgeLayer.mjs", "utf8");

  assert.match(bridge, /\[data-action='share-invite-whatsapp'\]/);
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
