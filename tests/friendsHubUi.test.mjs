import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("friends hub keeps blocked accounts in a collapsed reversible privacy section", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("function renderBlockedUsersPanel()");
  const end = app.indexOf("function renderFriendAdd()", start);
  const panel = app.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(panel, /<details class="friend-privacy-note blocked-users-panel">/);
  assert.match(panel, /משתמשים חסומים/);
  assert.match(panel, /data-action="unblock-connected-user"/);
  assert.match(panel, /friendNetwork\.blockedUsers/);
});

test("friends hub keeps people, requests and recurring groups in focused tabs", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("function renderGroups()");
  const end = app.indexOf("function renderGroupCreate()", start);
  const hub = app.slice(start, end);

  assert.match(hub, /friends-hub-screen/);
  assert.match(hub, /role="tablist"/);
  assert.match(hub, /data-action="friends-hub-tab"/);
  assert.match(hub, /data-tab="people"/);
  assert.match(hub, /data-tab="requests"/);
  assert.match(hub, /data-tab="groups"/);
  assert.match(hub, /renderFriendsPeopleTab/);
  assert.match(hub, /renderFriendsRequestsTab/);
  assert.match(hub, /renderFriendsGroupsTab/);
  assert.match(hub, /const hubTitle = activeTab === "groups"/);
  assert.match(hub, /activeTab === "requests"/);
  assert.match(hub, /<h1>\$\{hubTitle\}<\/h1>/);
  assert.match(hub, /stack \$\{activeGroups\.length \? "has-groups" : "is-empty"\}/);
  assert.match(
    hub,
    /activeGroups\.length[\s\S]*?קבוצה חדשה[\s\S]*?: ""/
  );
  assert.match(hub, /צור קבוצה ראשונה/);
});

test("friend requests stay out of the main friends roster", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const peopleStart = app.indexOf("function renderFriendsPeopleTab");
  const requestsStart = app.indexOf("function renderFriendsRequestsTab", peopleStart);
  const peoplePanel = app.slice(peopleStart, requestsStart);
  const requestsEnd = app.indexOf("function friendRelationships", requestsStart);
  const requestsPanel = app.slice(requestsStart, requestsEnd);

  assert.doesNotMatch(peoplePanel, /renderFriendRequestSection/);
  assert.match(requestsPanel, /renderFriendRequestSection/);
  assert.match(requestsPanel, /בקשות שקיבלת/);
  assert.match(requestsPanel, /בקשות ששלחת/);
  assert.match(requestsPanel, /אין בקשות שממתינות עכשיו/);
});

test("the requests tab remains a real route instead of falling back to people", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const actionStart = app.indexOf('if (action === "friends-hub-tab")');
  const actionEnd = app.indexOf('if (action === "event-status-filter")', actionStart);
  const action = app.slice(actionStart, actionEnd);

  assert.match(action, /\["people", "requests", "groups"\]\.includes/);
  assert.match(action, /screen = \{ name: "groups", tab: nextTab \}/);
  assert.match(action, /nextTab !== "groups"/);
  assert.match(action, /renderReplacingBrowserHistory\(\)/);
});

test("switching friends hub tabs does not add extra Android back steps", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const helperStart = app.indexOf("function renderReplacingBrowserHistory()");
  const helperEnd = app.indexOf("function createBrowserHistoryState()", helperStart);
  const helper = app.slice(helperStart, helperEnd);

  assert.match(helper, /restoringBrowserHistory = true/);
  assert.match(helper, /render\(\)/);
  assert.match(helper, /replaceBrowserHistoryState\(\)/);
});

test("friends roster clearly separates connected accounts from offline names", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /חברים מאושרים/);
  assert.match(app, /שמות אופליין/);
  assert.match(app, /data-friend-identity-section/);
  assert.match(app, /activeFriendParticipantIds\(state\)/);
  assert.match(app, /renderParticipantConnectionBadge\(participant\)/);
});

test("connected friends open the approved relationship statistics route", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  const networkRow = app.slice(
    app.indexOf("function renderNetworkFriendRow"),
    app.indexOf("function renderPendingFriendRow")
  );
  const friendProfile = app.slice(
    app.indexOf("function renderFriendRelationshipProfile"),
    app.indexOf("function isAcceptedNetworkFriendParticipant")
  );

  assert.match(networkRow, /data-action="open-friend-profile"/);
  assert.match(networkRow, /data-participant-id="\$\{participantId\}"/);
  assert.match(networkRow, /data-action="remove-network-friend"/);
  assert.doesNotMatch(networkRow, /חבר מאושר/);
  assert.doesNotMatch(networkRow, /משתמש מחובר · אפשר לצרף/);
  assert.match(friendProfile, /friend-relationship-screen/);
  assert.match(friendProfile, /event-participant-relationship/);
  assert.match(friendProfile, /renderParticipantRelationshipScorecard/);
  assert.doesNotMatch(friendProfile, /event-participant-profile-account/);
  assert.match(friendProfile, /renderParticipantRelationshipHabit/);
  assert.match(friendProfile, /renderParticipantRelationshipFacts/);
  assert.doesNotMatch(friendProfile, /relationship-event-management/);
  assert.doesNotMatch(friendProfile, /renderParticipantRelationshipBalance/);
  assert.match(
    app,
    /screen\.name === "friend-profile" &&[\s\S]*?!isAcceptedNetworkFriendParticipant\(screen\.participantId\)[\s\S]*?screen = \{ name: "groups", tab: "people" \}/
  );
  assert.match(layer, /\.friend-row-profile-button/);
  assert.match(layer, /\.friend-relationship-content/);
});

test("shared events and groups never create friendship without approval", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /<details class="friend-privacy-note">/);
  assert.match(app, /איך נשמרת הפרטיות/);
  assert.match(app, /רק אחרי אישור הדדי/);
  assert.match(app, /data-action="send-friend-request"/);
  assert.match(app, /data-action="accept-friend-request"/);
  assert.match(app, /data-action="decline-friend-request"/);
  assert.match(app, /data-action="remove-network-friend"/);
});

test("friends hub keeps friend creation on a focused screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /data-action="friends-search"/);
  assert.match(app, /data-action="open-friend-add"/);
  assert.match(app, /function renderFriendAdd\(\)/);
  assert.match(app, /screen\.name === "friend-add"/);
  assert.match(app, /data-action="friend-add-mode"/);
  assert.match(app, /data-mode="online"/);
  assert.match(app, /data-mode="offline"/);
  assert.match(app, /משתמש מחובר/);
  assert.match(app, /שם אופליין/);
  assert.match(app, /function filterFriendRows\(input\)/);
  assert.match(app, /data-action="friends-new-offline-name"/);
  assert.match(app, /data-action="friends-add-offline"/);
  assert.match(app, /function addOfflineFriend\(\)/);
  assert.match(app, /resolveOfflineParticipant\(name, "friend"\)/);
  assert.match(app, /saveFriendContact\(state, participant\.id, "offline"\)/);
  assert.match(app, /data-action="remove-offline-friend"/);
});

test("friends and groups keep destructive actions compact without hiding them", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const commandIcons = await readFile("src/publicCommandIconLayer.mjs", "utf8");
  const peopleStart = app.indexOf("function renderFriendsPeopleTab");
  const peopleEnd = app.indexOf("function renderBlockedUsersPanel", peopleStart);
  const peoplePanel = app.slice(peopleStart, peopleEnd);
  const groupRowStart = app.indexOf("function renderGroupRow");
  const groupRowEnd = app.indexOf("function renderKnownParticipantsPanel", groupRowStart);
  const groupRow = app.slice(groupRowStart, groupRowEnd);

  assert.ok(peoplePanel.indexOf("friends-roster") < peoplePanel.indexOf("friend-privacy-note"));
  assert.match(app, /class="friend-remove-button"[\s\S]*?title="הסר חבר"/);
  assert.match(commandIcons, /"remove-network-friend": "user-minus"/);
  assert.match(commandIcons, /"remove-offline-friend": "user-minus"/);
  assert.match(groupRow, /class="secondary-button danger-button group-archive-button"/);
  assert.match(commandIcons, /"archive-group": "archive"/);
});

test("empty and short friend lists avoid unnecessary controls", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /const showSearch = friendCount >= 5/);
  assert.match(app, /עוד אין חברים/);
  assert.match(app, /data-action="open-friend-add" type="button">הוסף חבר</);
  assert.doesNotMatch(app, /הוסף חבר ראשון/);
  assert.match(app, /duplicateGroupCount\s*\?\s*`/);
  assert.doesNotMatch(app, /class="friends-add-person"/);
});

test("online friends use unique usernames without changing offline names", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /requestFriendshipByUsername/);
  assert.match(app, /setFriendUsername/);
  assert.match(app, /data-action="profile-username"/);
  assert.match(app, /placeholder="בחר שם משתמש"/);
  assert.doesNotMatch(app, /placeholder="@yarin"/);
  assert.doesNotMatch(app, /placeholder="לדוגמה: דני כהן"/);
  assert.match(app, /data-action="friend-code"[\s\S]+placeholder="@username"/);
  assert.match(app, /class="friend-username"/);
  assert.match(app, /\[profile\.display_name, username\]/);
  assert.match(layer, /\.friend-username/);
  assert.match(layer, /\.profile-username-section/);
});

test("friends hub only highlights duplicate names when identity matching finds them", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /duplicateParticipantNameGroups/);
  assert.match(app, /function mergeableDuplicateParticipantGroups\(\)/);
  assert.match(app, /מצאנו שם כפול/);
  assert.match(app, /participant-connection-badge is-duplicate/);
  assert.match(app, /friends-merge-entry \$\{duplicateGroupCount \? "has-duplicates" : ""\}/);
});

test("duplicate-name management starts with a valid focused pair and collapses the full roster", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);
  const peopleStart = app.indexOf("function renderPeople()");
  const peopleEnd = app.indexOf("function renderEditGroupPanel", peopleStart);
  const peopleScreen = app.slice(peopleStart, peopleEnd);
  const mergeStart = app.indexOf("function ensureMergeParticipantsDraft()");
  const mergeEnd = app.indexOf("function mergeParticipantsInState", mergeStart);
  const mergeHelpers = app.slice(mergeStart, mergeEnd);

  assert.ok(peopleScreen.indexOf("renderMergeParticipantsPanel()") < peopleScreen.indexOf("renderKnownParticipantsPanel()"));
  assert.match(app, /<details class="panel section known-participants-panel people-management-disclosure">/);
  assert.match(app, /השם שיוסר/);
  assert.match(app, /החשבון שיישאר/);
  assert.match(mergeHelpers, /mergeableDuplicateParticipantGroups\(\)/);
  assert.match(mergeHelpers, /function mergeParticipantTargetCandidates/);
  assert.match(mergeHelpers, /normalizeParticipantDisplayName\(participant\.displayName\) === sourceName/);
  assert.match(layer, /\.people-management-disclosure > summary/);
  assert.match(layer, /\.people-management-disclosure \.known-participant-row/);
});

test("friends hub has mobile and keyboard accessibility polish", async () => {
  const [app, layer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(app, /handleFriendsHubTabKeyboardNavigation/);
  assert.match(app, /friend-add-mode-button\[role="tab"\]/);
  assert.match(app, /aria-selected=/);
  assert.match(layer, /\.friends-hub-tab/);
  assert.match(layer, /@media \(max-width: 560px\)/);
  assert.match(layer, /\.friend-row-person/);
  assert.match(layer, /\.friend-request-actions/);
  assert.match(layer, /\.friend-privacy-note/);
  assert.match(layer, /\.friend-privacy-note summary:focus-visible/);
});

test("friend startup loads first and isolates optional profile and cache sync failures", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("async function refreshFriendNetwork");
  const end = app.indexOf("function applyFriendNetworkToState", start);
  const refresh = app.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.ok(
    refresh.indexOf("loadFriendNetwork(runtimeConfig)") <
      refresh.indexOf("syncFriendProfile(runtimeConfig, localProfile)"),
    "the online roster should load before an optional profile refresh"
  );
  assert.match(refresh, /const profileNeedsSync = Boolean/);
  assert.match(refresh, /\[friends\] Profile refresh skipped/);
  assert.match(refresh, /\[friends\] Local friend cache save deferred/);
  assert.match(refresh, /\[friends\] Online friend load failed/);
  assert.doesNotMatch(refresh, /console\.warn\([^;]+(?:message|stack)/s);
  assert.doesNotMatch(
    refresh,
    /notice = "החברים אונליין לא נטענו, אבל המידע המקומי נשאר זמין\."/
  );
});

test("a temporary friend network failure keeps the last successful roster visible", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("async function refreshFriendNetwork");
  const end = app.indexOf("function applyFriendNetworkToState", start);
  const refresh = app.slice(start, end);

  assert.match(refresh, /friendNetwork\.status === "ready"/);
  assert.match(refresh, /friendNetwork = friendNetwork\.status === "ready"[\s\S]*?stale: true/);
  assert.match(refresh, /emptyFriendNetwork\("error"\)/);
  assert.match(app, /class="friend-network-stale" role="status"/);
});
