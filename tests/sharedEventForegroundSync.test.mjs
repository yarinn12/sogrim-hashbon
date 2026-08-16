import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("open shared events refresh quietly while the app remains visible", () => {
  assert.match(appSource, /const ACTIVE_EVENT_SYNC_INTERVAL_MS = 12_000;/);
  assert.match(appSource, /window\.addEventListener\("focus", requestVisibleEventSync\);/);
  assert.match(
    appSource,
    /window\.setInterval\(requestVisibleEventSync, ACTIVE_EVENT_SYNC_INTERVAL_MS\);/
  );
  assert.match(
    appSource,
    /function requestVisibleEventSync\(\) \{[\s\S]*\!\["home", "event", "settlement"\]\.includes\(screen\.name\)[\s\S]*expenseDraft[\s\S]*eventDialog[\s\S]*return requestResumeSync\(\);[\s\S]*\}/
  );
});
test("a received push forces the shared event to refresh before the inbox opens", () => {
  assert.match(
    appSource,
    /settle-friends:push-status[\s\S]*?requestResumeSync\(\{ force: true \}\)/
  );
  assert.match(
    appSource,
    /function requestResumeSync\(\{ force = false \} = \{\}\)/
  );
  assert.match(
    appSource,
    /if \(!force && Date\.now\(\) - lastResumeSyncAt < RESUME_SYNC_COOLDOWN_MS\)/
  );
});
