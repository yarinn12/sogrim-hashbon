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

test("profile and notification headers omit redundant green labels", async () => {
  const [app, ledgerLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);
  const profile = app.slice(
    app.indexOf("function renderProfileSetup()"),
    app.indexOf("function renderAdminAnalyticsOverview()")
  );
  const notifications = app.slice(
    app.indexOf("function renderNotificationInbox()"),
    app.indexOf("function renderNotificationInboxItem(")
  );

  assert.doesNotMatch(profile, /isEditingProfile \? "פרופיל"/);
  assert.match(profile, /isEditingProfile \? "" : '<p class="eyebrow">סוגרים חשבון<\/p>'/);
  assert.doesNotMatch(notifications, /<p class="eyebrow">החשבון שלך<\/p>/);
  assert.match(
    ledgerLayer,
    /:is\(\.profile-edit-screen, \.notification-inbox-screen\)[\s\S]*?> \.top \{[\s\S]*?min-height: 96px !important;/
  );
});

test("primary app and event routes share the exact same visible brand mark", async () => {
  const coherenceLayer = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");

  assert.match(
    coherenceLayer,
    /\.screen:is\([\s\S]*?\[data-screen-kind="home"\],[\s\S]*?\[data-screen-kind="notifications"\],[\s\S]*?\[data-screen-kind="profile"\],[\s\S]*?\[data-screen-kind="event"\],[\s\S]*?\[data-screen-kind="event-notes"\],[\s\S]*?\[data-screen-kind="settlement"\][\s\S]*?\.product-brand-mark \{[\s\S]*?width: 42px !important;[\s\S]*?height: 42px !important;/
  );
  assert.match(
    coherenceLayer,
    /\.screen:is\([\s\S]*?\[data-screen-kind="home"\],[\s\S]*?\[data-screen-kind="notifications"\],[\s\S]*?\[data-screen-kind="profile"\],[\s\S]*?\[data-screen-kind="event"\],[\s\S]*?\[data-screen-kind="event-notes"\],[\s\S]*?\[data-screen-kind="settlement"\][\s\S]*?\.product-brand-image \{[\s\S]*?object-fit: contain !important;[\s\S]*?transform: none !important;/
  );
});

test("profile modules share one app surface and typography language", async () => {
  const coherenceLayer = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");
  const profileSystem = coherenceLayer.slice(
    coherenceLayer.indexOf("The profile keeps its approved content order")
  );

  assert.match(
    profileSystem,
    /\.profile-edit-screen[\s\S]*?> \.profile-setup-panel \{[\s\S]*?gap: 12px !important;[\s\S]*?padding: 0 !important;[\s\S]*?border: 0 !important;[\s\S]*?background: transparent !important;/
  );
  assert.match(
    profileSystem,
    /\.profile-edit-screen[\s\S]*?> \.product-app-identity \{[\s\S]*?position: sticky !important;[\s\S]*?inset-block-start: 0 !important;[\s\S]*?background: var\(--app-canvas\) !important;/
  );
  assert.match(
    profileSystem,
    /:is\([\s\S]*?\.profile-avatar-picker-shell,[\s\S]*?\.profile-identity-summary,[\s\S]*?\.profile-shortcuts,[\s\S]*?\.referral-reward-card\.is-profile,[\s\S]*?\.notification-settings-card,[\s\S]*?\.premium-billing-section,[\s\S]*?\.account-profile-controls[\s\S]*?\) \{[\s\S]*?border: 1px solid var\(--app-line\) !important;[\s\S]*?border-radius: var\(--app-radius-panel\) !important;[\s\S]*?background: var\(--app-surface\) !important;/
  );
  assert.match(
    profileSystem,
    /\.notification-settings-card\.is-enabled \{[\s\S]*?border-color: var\(--app-line\) !important;[\s\S]*?background: var\(--app-surface\) !important;/
  );
  assert.match(
    profileSystem,
    /:is\(\.referral-reward-icon, \.notification-settings-icon, \.premium-billing-icon\) \{[\s\S]*?width: 44px !important;[\s\S]*?border-radius: var\(--app-radius-control\) !important;[\s\S]*?background: var\(--app-brand\) !important;/
  );
});

test("friend request notifications resolve before event lookup", async () => {
  const [app, destinations] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/domain/notificationInboxDestination.mjs", "utf8")
  ]);
  const source = app.slice(
    app.indexOf("async function openInboxNotification("),
    app.indexOf("function archiveSettledEvent(")
  );

  assert.match(destinations, /kind === "friend-request"/);
  assert.match(destinations, /name: "groups", tab: "requests"/);
  assert.match(source, /if \(destination\.name === "groups"\)/);
  assert.ok(
    source.indexOf('destination.name === "groups"') <
      source.indexOf("const event = getEvent(destination.eventId)")
  );
});
