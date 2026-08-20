import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public sync status reports cloud saves and recovery without cluttering screens", async () => {
  const [index, sw, layer, localStore, circleDesign] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("src/publicSyncStatusLayer.mjs", "utf8"),
    readFile("src/data/localStore.mjs", "utf8"),
    readFile("src/publicCircleDesignLayer.mjs", "utf8")
  ]);

  assert.match(index, /publicSyncStatusLayer\.mjs/);
  assert.match(sw, /publicSyncStatusLayer\.mjs/);
  assert.match(layer, /aria-live/);
  assert.match(layer, /body\.app-dialog-open \.public-sync-status/);
  assert.match(
    layer,
    /body\.app-dialog-open\.has-event-route-dialog \.public-sync-status/
  );
  assert.match(layer, /data-inline-sync-status/);
  assert.match(layer, /data-inline-sync-retry/);
  assert.match(layer, /has-event-action-dock/);
  assert.match(layer, /html\.account-auth-locked \.public-sync-status/);
  assert.match(layer, /אין חיבור · צפייה בלבד/);
  assert.match(layer, /ONLINE_MUTATION_ACTIONS/);
  assert.match(layer, /ONLINE_MUTATION_CHANGE_ACTIONS/);
  assert.match(layer, /document\.addEventListener\("click", blockOfflineMutation, true\)/);
  assert.match(layer, /document\.addEventListener\("change", blockOfflineMutation, true\)/);
  assert.match(layer, /event\.stopImmediatePropagation\(\)/);
  assert.match(layer, /restoreControlSnapshot\(target\)/);
  assert.match(layer, /window\.addEventListener\("offline", handleOffline\)/);
  assert.match(layer, /window\.addEventListener\("online", recoverOnlineMutationAccess\)/);
  assert.match(layer, /אין חיבור\. אפשר לצפות, אבל אי אפשר לשנות עד שהסנכרון יחזור\./);
  assert.match(layer, /MutationObserver/);
  assert.match(layer, /let lastScreenSignature = screenSignature\(\)/);
  assert.match(layer, /let activeSaveScreenSignature = ""/);
  assert.match(
    layer,
    /currentStatus === "saved"[\s\S]*?nextScreenSignature !== lastScreenSignature[\s\S]*?showStatus\(""\)/
  );
  assert.match(
    layer,
    /status === "saved"[\s\S]*?currentScreenSignature !== activeSaveScreenSignature[\s\S]*?showStatus\(""\)[\s\S]*?return/
  );
  assert.match(
    layer,
    /status === "saved" && !activeSaveScreenSignature[\s\S]*?showStatus\(""\)[\s\S]*?return/
  );
  assert.match(
    layer,
    /if \(currentStatus !== status\) return;\s*currentStatus = "";\s*node\.hidden = true;\s*syncInlineStatusTargets\(\)/
  );
  assert.match(layer, /white-space: nowrap/);
  assert.match(
    layer,
    /\.public-sync-status button \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/
  );
  assert.match(
    circleDesign,
    /\.event-action-sync-retry \{[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;/
  );
  assert.match(layer, /@media \(max-width: 720px\)[\s\S]*?bottom: calc\(94px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(layer, /flushPendingSharedState/);
  assert.match(layer, /await flushPendingSharedState\(\)/);
  assert.doesNotMatch(layer, /if \(result\?\.ok\) showStatus\("saved"\)/);
  assert.match(
    layer,
    /if \(status === "saved"\) \{[\s\S]*?existingNode\.hidden = true;[\s\S]*?syncInlineStatusTargets\(\);[\s\S]*?return;/
  );
  assert.match(layer, /if \(!status\) \{[\s\S]*?currentStatus = "";[\s\S]*?existingNode\.hidden = true/);
  assert.match(layer, /message: "המידע השתנה במקום אחר\. נסה לסנכרן לפני שינוי נוסף\."/);
  assert.match(layer, /retry: true/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.match(layer, /target\.closest\("\[data-route-sync-status\]"\)/);
  assert.match(layer, /classList\.toggle\("has-event-route-dialog", hasEventRouteDialog\)/);
  assert.match(layer, /\.event-route-sync-status\[hidden\]/);
  assert.doesNotMatch(layer, /checkInitialReadiness/);
  assert.match(localStore, /PENDING_SYNC_KEY_PREFIX/);
  assert.match(localStore, /CLOUD_STATE_CONFLICT/);
  assert.match(localStore, /window\.addEventListener\("online"/);
  assert.match(
    localStore,
    /export function clearLocalAccountData[\s\S]*?activeAccountStorageScope = "";\s*publishSyncStatus\(""\)/
  );
});
