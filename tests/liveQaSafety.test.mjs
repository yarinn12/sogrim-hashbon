import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const notifications = await readFile(
  "scripts/verify-notification-inbox-live.mjs",
  "utf8"
);
const friendPrivacy = await readFile(
  "scripts/verify-friend-privacy.mjs",
  "utf8"
);

test("notification live QA requires an explicit environment and removes its shared snapshot", () => {
  assert.match(notifications, /assertLiveQaTarget\(\);/);
  assert.match(notifications, /LIVE_QA_ENVIRONMENT/);
  assert.match(notifications, /LIVE_QA_ALLOW_PRODUCTION/);
  assert.match(
    notifications,
    /app_snapshots\?id=eq\.\$\{encodeURIComponent\(sharedSpace\.id\)\}/
  );
  assert.ok(
    notifications.indexOf("app_snapshots?id=eq.") <
      notifications.indexOf("/auth/v1/admin/users/${encodeURIComponent(account.userId)}")
  );
});

test("friend privacy QA can only use explicitly supplied disposable accounts", () => {
  assert.match(friendPrivacy, /QA_FRIEND_PRIVACY_USER_IDS/);
  assert.doesNotMatch(friendPrivacy, /from auth\.users\s+order by created_at\s+limit 3/);
  assert.match(friendPrivacy, /exactly three disposable test-user UUIDs/);
});
