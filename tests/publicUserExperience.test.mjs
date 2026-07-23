import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("public app asks each visitor for their own saved name", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(app, /renderProfileSetup/);
  assert.match(app, /data-action="profile-name"/);
  assert.match(app, /data-action="save-profile"/);
  assert.match(app, /data-action="edit-profile"/);
  assert.match(app, /שם פרטי ושם משפחה/);
  assert.match(app, /const isEditingProfile = Boolean/);
  assert.match(app, /isEditingProfile[\s\S]*?"הפרופיל שלך"/);
  assert.match(app, /isEditingProfile \? "שמור שינויים" : "המשך"/);
  assert.match(overlay, /שם פרטי ושם משפחה/);
  assert.match(localStore, /LOCAL_PROFILE_KEY/);
  assert.match(localStore, /saveLocalProfile/);
  assert.match(localStore, /isFullProfileName/);
  assert.match(localStore, /authProvider/);
});

test("public account gate supports password and Google login with one cloud identity", async () => {
  const index = await readFile("index.html", "utf8");
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const auth = await readFile("src/data/accountAuth.mjs", "utf8");

  assert.match(index, /publicAccountAuthLayer\.mjs/);
  assert.match(layer, /signInWithPassword/);
  assert.match(layer, /signUpWithPassword/);
  assert.match(layer, /googleOAuthUrl/);
  assert.match(layer, /saveLocalProfile/);
  assert.match(layer, /ensureNamedParticipant/);
  assert.match(auth, /participantId: `account-\$\{user\.id\}`/);
  assert.match(auth, /account_space_id/);
  assert.match(auth, /account_space_key/);
});

test("public Google login keeps invite snapshots before joining the visitor", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /mergeInviteSnapshotIntoState/);
  assert.match(layer, /const inviteUrl = pendingInviteUrl\(window\.location\.href\)/);
  assert.match(layer, /const inviteSnapshot = parseInviteSnapshot\(inviteUrl\)/);
  assert.match(layer, /mergeInviteSnapshotIntoState\(\s*await loadSharedState\(\),\s*inviteSnapshot/);
  assert.match(layer, /readSharedEventState/);
  assert.match(layer, /mergeSharedEventIntoState/);
  assert.match(layer, /clearPendingInviteUrl/);
  assert.match(layer, /accountInviteMarkup/);
});

test("public home screen does not expose local Wi-Fi or beta readiness panels", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.doesNotMatch(app, /renderNetworkPanel/);
  assert.doesNotMatch(app, /loadNetworkInfo/);
  assert.doesNotMatch(app, /copy-network-url/);
  assert.doesNotMatch(app, /renderLaunchReadinessPanel/);
  assert.doesNotMatch(app, /getLaunchReadinessItems/);
  assert.doesNotMatch(app, /data-action="current-participant"/);
});

test("public home screen focuses on event creation and the event list", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const homeMatch = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderHomeEventTools/);

  assert.ok(homeMatch);
  assert.match(homeMatch[0], /eventStatusFilter/);
  assert.match(homeMatch[0], /renderEventStatusFilter\(sortedEvents\)/);
  assert.match(homeMatch[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(homeMatch[0], /renderPersonalDashboard|renderPersonalActionList|renderRecentEventShortcut/);
});

test("public home keeps the main actions inside the hero", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const homeMatch = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderRecentEventShortcut/);

  assert.ok(homeMatch);
  assert.match(homeMatch[0], /<header class="top">[\s\S]*<div class="hero-actions /);
  assert.match(homeMatch[0], /data-action="new-event"/);
  assert.match(homeMatch[0], /data-action="join-event-screen"/);
});

test("public modal close actions replace history instead of reopening stale dialogs", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /if \(action === "close-event-dialog"\)[\s\S]*renderHistoryFallback\(\)/);
  assert.match(app, /if \(action === "cancel-expense"\)[\s\S]*renderHistoryFallback\(\)/);
  assert.match(app, /expenseDraft = null;[\s\S]*renderHistoryFallback\(\)/);
});

test("draft edits refresh the current browser history entry", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const inputHandler = sourceBetween(app, "function handleInput(event)", "async function handleChange");

  assert.match(inputHandler, /replaceBrowserHistoryState\(\)/);
});

test("removing an earlier payer keeps the inline guest editor on the correct row", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /inlinePayerGuestIndex > payerIndex/);
  assert.match(app, /inlinePayerGuestIndex -= 1/);
});

test("restaurant copy blocks incomplete rows instead of copying a partial bill", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const copyHandler = sourceBetween(
    app,
    "async function copyQuickSplitSummary()",
    "function renderQuickItemRow"
  );

  assert.match(copyHandler, /if \(summary\.error\)/);
  assert.match(copyHandler, /expenseDraft\.error = summary\.error/);
});

test("public pasted invite links load only the shared event", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /parseInviteSpaceId/);
  assert.match(app, /readSharedEventState/);
  assert.match(app, /mergeSharedEventIntoState/);
  assert.match(app, /const hydratedState = await hydrateIncomingSharedEvent\(sharedState\)/);
  assert.match(app, /function hydrateIncomingSharedEvent\(nextState\)/);
  assert.match(app, /const openedFromInvite = \["invite", "space", "key", "join"\]/);
  assert.match(app, /if \(!openedFromInvite && getEvent\(invitedEventId\)\) notice = ""/);
  assert.doesNotMatch(app, /CLIENT_SPACE_STORAGE_KEY/);
  assert.doesNotMatch(app, /function activateInviteSpace/);
});

test("public home and group screens are scoped to the saved local user", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /visibleEventsForParticipant/);
  assert.match(app, /visibleGroupsForParticipant/);
  assert.match(app, /visibleEventsForParticipant\(state, state\.currentParticipantId\)/);
  assert.match(app, /visibleGroupsForParticipant\(state, state\.currentParticipantId\)/);
});

test("public sync keeps Google identity fields when refreshing shared state", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const syncLocalProfile = sourceBetween(
    app,
    "function syncLocalProfile(nextState)",
    "function applyInviteSnapshot"
  );

  assert.match(syncLocalProfile, /authProvider: localProfile\.authProvider/);
  assert.match(syncLocalProfile, /authSubject: localProfile\.authSubject/);
  assert.match(syncLocalProfile, /email: localProfile\.email/);
  assert.match(syncLocalProfile, /authProvider: participant\?\.authProvider \?\? localProfile\.authProvider/);
  assert.match(syncLocalProfile, /authSubject: participant\?\.authSubject \?\? localProfile\.authSubject/);
  assert.match(syncLocalProfile, /email: participant\?\.email \?\? localProfile\.email/);
});

test("public profile save keeps Google identity fields when renaming the visitor", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const saveProfileFromDraft = sourceBetween(
    app,
    "async function saveProfileFromDraft()",
    "function startExpenseDraft"
  );

  assert.match(saveProfileFromDraft, /authProvider: localProfile\?\.authProvider/);
  assert.match(saveProfileFromDraft, /authSubject: localProfile\?\.authSubject/);
  assert.match(saveProfileFromDraft, /email: localProfile\?\.email/);
  assert.match(saveProfileFromDraft, /authProvider: participant\?\.authProvider \?\? localProfile\?\.authProvider/);
  assert.match(saveProfileFromDraft, /authSubject: participant\?\.authSubject \?\? localProfile\?\.authSubject/);
  assert.match(saveProfileFromDraft, /email: participant\?\.email \?\? localProfile\?\.email/);
});

test("public invite profile setup previews the invited event before naming the visitor", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const renderProfileSetup = sourceBetween(
    app,
    "function renderProfileSetup()",
    "function renderHome()"
  );

  assert.match(renderProfileSetup, /renderInviteProfilePreview\(invitedEvent\)/);
  assert.match(app, /function renderInviteProfilePreview\(invitedEvent\)/);
  assert.match(app, /invite-profile-preview/);
  assert.match(styles, /\.invite-profile-preview/);
});

test("public profile summary shows how the visitor is remembered", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");
  const renderProfileSummary = sourceBetween(
    app,
    "function renderProfileSummary()",
    "function renderBackupPanel()"
  );

  assert.match(app, /function profileMemoryLabel\(\)/);
  assert.match(renderProfileSummary, /profile-memory-status/);
  assert.match(renderProfileSummary, /profileMemoryLabel\(\)/);
  assert.match(styles, /\.profile-memory-status/);
});

test("public first run and expense forms do not invent sample people or amounts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const clarityLayer = await readFile("src/publicClarityLayer.mjs", "utf8");
  const nameCleanup = await readFile("src/publicNameCleanup.mjs", "utf8");
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");
  const index = await readFile("index.html", "utf8");

  assert.match(app, /placeholder="שם פרטי ושם משפחה"/);
  assert.match(clarityLayer, /שם פרטי ושם משפחה/);
  assert.match(nameCleanup, /שם פרטי ושם משפחה/);
  assert.doesNotMatch(nameCleanup, /clearStarterExpenseDefaults/);
  assert.doesNotMatch(nameCleanup, /nameCleanupCleared/);
  assert.match(nameCleanup, /product-saved-names-panel/);
  assert.match(index, /publicNameCleanup\.mjs/);
  assert.match(index, /publicBrandLayer\.mjs/);
  assert.match(brandLayer, /APP_NAME = "סוגרים חשבון"/);
  assert.match(brandLayer, /product-brand-lockup/);
  assert.match(brandLayer, /product-brand-mark/);
  assert.match(brandLayer, /product-brand-image/);
  assert.match(brandLayer, /brand-mark-v3\.png/);
  assert.doesNotMatch(app, /placeholder="למשל דני"/);
  assert.doesNotMatch(app, /name: "מונית"/);
  assert.doesNotMatch(app, /total: "110"/);
  assert.doesNotMatch(app, /amount: "110"/);
});

test("public copy hides internal beta and implementation wording", async () => {
  const sources = await Promise.all(
    [
      "src/app.mjs",
      "src/publicBrandLayer.mjs",
      "src/publicProfileOverlay.mjs",
      "src/publicGoogleAuthLayer.mjs",
      "src/publicClarityLayer.mjs",
      "src/publicNameCleanup.mjs",
      "src/publicCopyCleanupLayer.mjs"
    ].map((path) => readFile(path, "utf8"))
  );
  const combined = sources.join("\n");

  for (const phrase of [
    "בטא ציבורית",
    "האפליקציה לא ממציאה אנשים",
    "אין הרשמה כבדה",
    "שם מקומי",
    "קישור מקומי",
    "שמירה בענן",
      "בהמשך נחבר גם Google",
    "במידע המקומי",
    "Google לא מוגדר"
  ]) {
    assert.doesNotMatch(combined, new RegExp(phrase));
  }

  assert.match(combined, /כאן מנהלים שמות ששמרת/);
  assert.match(combined, /קישור הצטרפות/);
});
