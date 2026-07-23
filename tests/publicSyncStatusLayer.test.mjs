import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public sync status reports cloud saves and recovery without cluttering screens", async () => {
  const [index, sw, layer, localStore] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("src/publicSyncStatusLayer.mjs", "utf8"),
    readFile("src/data/localStore.mjs", "utf8")
  ]);

  assert.match(index, /publicSyncStatusLayer\.mjs/);
  assert.match(sw, /publicSyncStatusLayer\.mjs/);
  assert.match(layer, /aria-live/);
  assert.match(layer, /body\.app-dialog-open \.public-sync-status/);
  assert.match(layer, /data-inline-sync-status/);
  assert.match(layer, /data-inline-sync-retry/);
  assert.match(layer, /has-event-action-dock/);
  assert.match(layer, /html\.account-auth-locked \.public-sync-status/);
  assert.match(layer, /נשמר במכשיר וממתין לסנכרון/);
  assert.match(layer, /MutationObserver/);
  assert.match(layer, /white-space: nowrap/);
  assert.match(layer, /flushPendingSharedState/);
  assert.match(layer, /prefers-reduced-motion/);
  assert.doesNotMatch(layer, /checkInitialReadiness/);
  assert.match(localStore, /PENDING_SYNC_KEY_PREFIX/);
  assert.match(localStore, /CLOUD_STATE_CONFLICT/);
  assert.match(localStore, /window\.addEventListener\("online"/);
});
