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
    /function requestVisibleEventSync\(\) \{[\s\S]*\!\["event", "settlement"\]\.includes\(screen\.name\)[\s\S]*expenseDraft[\s\S]*eventDialog[\s\S]*return requestResumeSync\(\);[\s\S]*\}/
  );
});
