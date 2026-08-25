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
  assert.match(app, /isEditingProfile[\s\S]*?data-action="edit-profile-name"/);
  assert.match(app, /isEditingProfile[\s\S]*?data-action="edit-profile-username"/);
  assert.match(overlay, /שם פרטי ושם משפחה/);
  assert.match(localStore, /LOCAL_PROFILE_KEY/);
  assert.match(localStore, /saveLocalProfile/);
  assert.match(localStore, /isFullProfileName/);
  assert.match(localStore, /authProvider/);
});

test("existing profile identity is read-only until the user chooses edit", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /class="profile-identity-grid"/);
  assert.match(app, /data-action="edit-profile-name"/);
  assert.match(app, /data-action="edit-profile-username"/);
  assert.match(app, /aria-label="עריכת שם פרטי ושם משפחה"/);
  assert.match(app, /aria-label="עריכת שם משתמש"/);
  assert.match(app, /data-action="cancel-profile-name-edit"/);
  assert.match(app, /data-action="cancel-profile-username-edit"/);
  assert.match(app, /if \(action === "edit-profile-name"\)/);
  assert.match(app, /if \(action === "edit-profile-username"\)/);
});

test("tester-facing forms use accessible names and polished loading copy", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const accountLayer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const coherence = await readFile("src/publicDesignCoherenceLayer.mjs", "utf8");

  assert.match(app, /name="eventParticipantSearch"[\s\S]*?placeholder="חיפוש לפי שם…"/);
  assert.match(app, /name="savedFriendSearch"[\s\S]*?placeholder="הקלד כדי לסנן…"/);
  assert.match(app, /name="participantSearch"[\s\S]*?placeholder="הקלד כדי לסנן…"/);
  assert.match(app, /data-action="expense-date" name="expenseDate"/);
  assert.match(app, /מכין קישור…/);
  assert.match(app, /פותח את האירוע ושומר…/);
  assert.match(accountLayer, /name="message"[\s\S]*?autocomplete="off"[\s\S]*?השלב הבא…/);
  assert.match(coherence, /\.event-participant-route-modal:focus-visible[\s\S]*?outline: 3px solid/);
  assert.match(
    coherence,
    /@media \(max-width: 720px\)[\s\S]*?\.event-participant-route-modal:focus-visible \{[\s\S]*?outline: none !important;/
  );
  assert.match(
    coherence,
    /body:has\(\.event-participant-route-backdrop\) \.event-action-dock \{[\s\S]*?display: none !important;/
  );
  assert.doesNotMatch(app, /placeholder="[^"]*\.\.\./);
  assert.doesNotMatch(accountLayer, /placeholder="[^"]*\.\.\./);
});

test("participant validation stays inside the app and returns focus to the choice", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const eventScreen = sourceBetween(app, "function renderNewEvent()", "function syncNewEventParticipantControls");
  const createEvent = sourceBetween(app, "function createEventFromDraft()", "function inviteJoinErrorMessage");
  const saveGroup = sourceBetween(app, "function saveEditedGroup()", "function createGroupFromDraft()");
  const createGroup = sourceBetween(app, "function createGroupFromDraft()", "function syncCreateGroupButton()");

  assert.doesNotMatch(app, /window\.alert\(/);
  assert.match(app, /function clearRenderedNotice\(\)/);
  assert.match(eventScreen, /renderNotice\(\)/);
  assert.match(
    createEvent,
    /notice = [^;]+;[\s\S]*?screen = \{ name: "new-event-participants" \}[\s\S]*?participantView = "friends"[\s\S]*?render\(\)[\s\S]*?data-participant-view="friends"[\s\S]*?\.focus/
  );
  assert.match(saveGroup, /notice = [^;]+;[\s\S]*?render\(\)[\s\S]*?data-action="edit-group-member"/);
  assert.match(createGroup, /notice = [^;]+;[\s\S]*?render\(\)[\s\S]*?data-action="group-member"/);
});

test("interactive form controls expose stable browser field names", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const account = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  for (const name of [
    "friendSearch",
    "offlineFriendName",
    "friendCode",
    "eventGuestName",
    "offlineParticipantName",
    "eventInviteUrl",
    "participantAlias",
    "eventCurrency",
    "expenseGuestName",
    "quickExpensePayer",
    "expenseDate",
    "participantSelection"
  ]) {
    assert.match(app, new RegExp(`name="${name}"`));
  }
  assert.match(account, /name="deleteAccountConfirmation"/);
});

test("public account gate supports password and Google login with one cloud identity", async () => {
  const index = await readFile("index.html", "utf8");
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const auth = await readFile("src/data/accountAuth.mjs", "utf8");

  assert.match(index, /publicAccountAuthLayer\.mjs/);
  assert.match(layer, /signInWithPassword/);
  assert.match(layer, /signUpWithPassword/);
  assert.match(layer, /handleWebGoogleCredential/);
  assert.match(layer, /signInWithIdToken/);
  assert.match(layer, /saveLocalProfile/);
  assert.match(layer, /ensureNamedParticipant/);
  assert.match(auth, /participantId: `account-\$\{user\.id\}`/);
  assert.match(auth, /account_space_id/);
  assert.match(auth, /account_space_key/);
});

test("account login keeps invite context visible but persists only a verified event", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");

  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /const inviteUrl = pendingInviteUrl\(window\.location\.href\)/);
  assert.match(
    layer,
    /const startupState = await loadSharedStateForStartup\(\{\s*maxWaitMs: localAccountHasHistory \? 0 : EMPTY_ACCOUNT_CLOUD_WAIT_MS\s*\}\)/
  );
  assert.match(layer, /readSharedEventState/);
  assert.match(layer, /mergeSharedEventIntoState/);
  assert.doesNotMatch(layer, /mergeInviteSnapshotIntoState/);
  assert.match(layer, /clearPendingInviteUrl/);
  assert.match(layer, /accountInviteMarkup/);
});

test("account entry keeps an event invitation visible through authentication", async () => {
  const layer = await readFile("src/publicAccountAuthLayer.mjs", "utf8");
  const accountGate = sourceBetween(
    layer,
    "function renderAccountGate(",
    "function renderAccountRecoveryGate()"
  );
  const inviteContext = sourceBetween(
    layer,
    "function accountInviteContext()",
    "function focusAccountInput("
  );

  assert.match(accountGate, /const inviteContext = accountInviteContext\(\)/);
  assert.match(accountGate, /מצטרפים ל־\$\{escapeHtml\(inviteContext\.eventName\)\}/);
  assert.match(accountGate, /נכנסים או נרשמים, ומיד ממשיכים לאירוע שקיבלת/);
  assert.match(accountGate, /צור חשבון והצטרף/);
  assert.match(accountGate, /התחבר והצטרף/);
  assert.match(inviteContext, /pendingInviteUrl\(window\.location\.href\)/);
  assert.match(inviteContext, /eventName: event\?\.name\?\.trim\(\) \|\| "האירוע שקיבלת"/);
  assert.match(inviteContext, /function accountInviteMarkup\(context = accountInviteContext\(\)\)/);
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
  const homeMatch = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderRecentEventShortcut/);

  assert.ok(homeMatch);
  assert.match(homeMatch[0], /eventStatusFilter/);
  assert.match(homeMatch[0], /renderEventStatusFilter\(sortedEvents\)/);
  assert.match(homeMatch[0], /events\.map\(renderEventRow\)/);
  assert.doesNotMatch(homeMatch[0], /renderPersonalDashboard|renderPersonalActionList/);
});

test("public home keeps one primary action, a secondary friends entry and a compact referral benefit", async () => {
  const [app, referralLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicReferralRewardsLayer.mjs", "utf8")
  ]);
  const homeMatch = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderRecentEventShortcut/);

  assert.ok(homeMatch);
  assert.match(homeMatch[0], /<header class="top">/);
  assert.match(homeMatch[0], /data-action="new-event"/);
  assert.match(homeMatch[0], /class="home-quick-action home-friends-action" data-action="groups" data-tab="people"/);
  assert.doesNotMatch(homeMatch[0], /class="home-event-tools home-invite-hub"/);
  assert.doesNotMatch(homeMatch[0], /data-action="join-event-link"/);
  assert.doesNotMatch(homeMatch[0], /data-action="join-existing-event"/);
  assert.doesNotMatch(homeMatch[0], /data-action="join-event-screen"/);
  assert.match(referralLayer, /referralRewardCard\("home"\)/);
});

test("an empty home explains the first useful action instead of future states", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");

  assert.match(home, /const homeTitle = sortedEvents\.length/);
  assert.match(home, /"מתחילים מאירוע ראשון"/);
  assert.match(home, /"פותחים אירוע, מזמינים חברים ומוסיפים את ההוצאה הראשונה\."/);
  assert.match(home, /"פתח אירוע ראשון"/);
});

test("public modal close actions replace history instead of reopening stale dialogs", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /if \(action === "close-event-dialog"\)[\s\S]*renderHistoryFallback\(\)/);
  assert.match(app, /if \(action === "cancel-expense"\)[\s\S]*renderHistoryFallback\(\)/);
  assert.match(app, /expenseDraft = null;[\s\S]*renderHistoryFallback\(\)/);
});

test("opening the profile clears notices from the previous task", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const handler = sourceBetween(
    app,
    'if (action === "edit-profile")',
    'if (action === "reset")'
  );

  assert.match(handler, /notice = "";/);
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

  assert.match(app, /resolveEventInviteCredentials/);
  assert.match(app, /readSharedEventState/);
  assert.match(app, /mergeSharedEventIntoState/);
  assert.match(app, /const hydratedState = await hydrateIncomingSharedEvent\(sharedState\)/);
  assert.match(app, /function hydrateIncomingSharedEvent\(nextState\)/);
  assert.match(app, /const openedFromInvite = \["invite", "space", "key", "join", "t"\]/);
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
    "async function hydrateIncomingSharedEvent"
  );

  assert.match(syncLocalProfile, /authProvider: localProfile\.authProvider/);
  assert.match(syncLocalProfile, /authSubject: localProfile\.authSubject/);
  assert.match(syncLocalProfile, /email: localProfile\.email/);
  assert.match(syncLocalProfile, /authProvider: participant\?\.authProvider \?\? localProfile\.authProvider/);
  assert.match(syncLocalProfile, /authSubject: participant\?\.authSubject \?\? localProfile\.authSubject/);
  assert.match(syncLocalProfile, /email: participant\?\.email \?\? localProfile\.email/);
  assert.doesNotMatch(syncLocalProfile, /parseInviteEventId/);
  assert.doesNotMatch(syncLocalProfile, /invitedEventId/);
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
  assert.match(brandLayer, /icon-192\.png/);
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
