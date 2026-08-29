import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

test("open shared events refresh quietly while the app remains visible", () => {
  assert.match(appSource, /const ACTIVE_EVENT_SYNC_INTERVAL_MS = 6_000;/);
  assert.match(appSource, /window\.addEventListener\("focus", requestVisibleEventSync\);/);
  assert.match(
    appSource,
    /window\.setInterval\(requestVisibleEventSync, ACTIVE_EVENT_SYNC_INTERVAL_MS\);/
  );
  assert.match(
    appSource,
    /function requestVisibleEventSync\(\) \{[\s\S]*!VISIBLE_BACKGROUND_SYNC_SCREENS\.has\(screen\.name\)[\s\S]*expenseDraft[\s\S]*profileNameEditing[\s\S]*return requestResumeSync\(\{ includeSecondary: false \}\);[\s\S]*\}/
  );
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function requestVisibleEventSync"),
      appSource.indexOf("bootstrapApp();")
    ),
    /eventDialog \|\|/,
    "read-only dialogs must not freeze cross-device refreshes"
  );
});

test("opening home forces an immediate shared state refresh", () => {
  assert.match(
    appSource,
    /if \(action === "home"\) \{[\s\S]*screen = \{ name: "home" \};[\s\S]*render\(\);[\s\S]*requestResumeSync\(\{ force: true \}\)\.catch/
  );
});
test("a received push forces the shared event to refresh before the inbox opens", () => {
  assert.match(
    appSource,
    /settle-friends:push-status[\s\S]*?requestResumeSync\(\{ force: true \}\)/
  );
  assert.match(
    appSource,
    /function requestResumeSync\(\{ force = false, includeSecondary = true \} = \{\}\)/
  );
  assert.match(
    appSource,
    /if \(!force && Date\.now\(\) - lastResumeSyncAt < RESUME_SYNC_COOLDOWN_MS\)/
  );
});
