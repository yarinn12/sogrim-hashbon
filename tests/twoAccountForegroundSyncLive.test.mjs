import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../scripts/verify-two-account-event-live.mjs", import.meta.url),
  "utf8"
);

test("two-account live QA observes automatic foreground updates on iPhone", () => {
  assert.match(source, /TWO_ACCOUNT_QA_ORIGIN/);
  assert.match(source, /afterJoin: async \(page\) =>/);
  assert.match(source, /foreground-expense-create-to-open-iphone/);
  assert.match(source, /settle-friends:push-synchronized/);
  assert.match(source, /kind: "expense-created"/);
  assert.match(source, /assert\.equal\(pushSyncResult\.ready, true\)/);
  assert.match(source, /foreground-expense-delete-from-open-iphone/);
  assert.match(source, /foreground-note-ui-create-to-owner-read/);
  assert.match(source, /foreground-note-edit-to-open-iphone/);
  assert.match(source, /foreground-note-delete-from-open-iphone/);
  assert.match(source, /foregroundCreateElapsed <= 3_500/);
  assert.match(source, /foregroundDeleteElapsed <= 3_500/);
  assert.match(source, /foregroundNoteCreateElapsed <= 5_000/);
  assert.match(source, /foregroundNoteEditElapsed <= 3_500/);
  assert.match(source, /foregroundNoteDeleteElapsed <= 3_500/);
  assert.match(source, /waitFor\(\{ state: "detached", timeout: 10_000 \}\)/);
  assert.match(source, /openIphoneForegroundCreateAutoSynced: true/);
  assert.match(source, /foregroundPushWaitedForCanonicalState: true/);
  assert.match(source, /openIphoneForegroundDeleteAutoSynced: true/);
  assert.match(source, /productionIphoneNoteUiWriteSyncedToOwner: true/);
  assert.match(source, /openIphoneForegroundNoteEditAutoSynced: true/);
  assert.match(source, /openIphoneForegroundNoteDeleteAutoSynced: true/);
});
