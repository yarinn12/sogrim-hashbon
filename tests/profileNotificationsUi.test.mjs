import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("notification time stays relative within today and switches to calendar labels after it", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const source = app.slice(
    app.indexOf("function formatNotificationTime("),
    app.indexOf("function renderProfileAvatarPicker(")
  );

  assert.match(source, /const calendarLabel = formatRelativeCalendarDate\(value\)/);
  assert.match(source, /if \(calendarLabel === "היום"\)/);
  assert.match(source, /return `לפני \$\{Math\.floor\(elapsedMinutes \/ 60\)\} שע׳`/);
  assert.match(source, /return calendarLabel/);
  assert.doesNotMatch(source, /elapsedHours < 24/);
});

test("signed-out notifications use the approved compact account state", async () => {
  const [app, coherenceLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicDesignCoherenceLayer.mjs", "utf8")
  ]);
  const source = app.slice(
    app.indexOf("function renderNotificationInbox()"),
    app.indexOf("function renderNotificationInboxItem(")
  );

  assert.match(source, /notification-inbox-empty is-account-pending/);
  assert.match(source, /iconSvg\("bell"\)/);
  assert.match(source, /ההתראות מחכות בחשבון שלך/);
  assert.match(source, />לפרופיל<\/button>/);
  assert.doesNotMatch(source, /אחרי התחברות הן יישמרו כאן בכל המכשירים/);
  assert.match(
    coherenceLayer,
    /\.notification-inbox-panel\.is-account-pending[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;/
  );
});

test("friend request notifications open the requests tab before event lookup", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const source = app.slice(
    app.indexOf("async function openInboxNotification("),
    app.indexOf("function archiveSettledEvent(")
  );

  const friendRequestBranch = source.indexOf('item?.kind === "friend-request"');
  const eventLookup = source.indexOf("const event = getEvent(eventId)");
  assert.ok(friendRequestBranch >= 0);
  assert.ok(friendRequestBranch < eventLookup);
  assert.match(source, /screen = \{ name: "groups", tab: "requests" \}/);
});
