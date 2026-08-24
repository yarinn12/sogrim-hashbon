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

test("launch actions restore either event creation or the profile before clearing the URL", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const launchRoute = sourceBetween(
    app,
    "function initialScreenFromLaunchAction()",
    "function render()"
  );

  assert.match(launchRoute, /action !== "new-event" && action !== "profile"/);
  assert.match(launchRoute, /action === "profile" \? \{ name: "profile" \}/);
  assert.match(launchRoute, /url\.searchParams\.delete\("action"\)/);
});

test("creating an event is available from home but not from join or event screens", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");
  const join = sourceBetween(app, "function renderJoinEvent()", "function renderEvent(event)");
  const event = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");

  assert.equal([...home.matchAll(/data-action="new-event"/g)].length, 1);
  assert.doesNotMatch(join, /data-action="new-event"/);
  assert.doesNotMatch(event, /data-action="new-event"|data-action="duplicate-event"/);
});

test("the active event keeps one primary expense action and two focused internal destinations", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const event = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");
  const navigation = sourceBetween(
    app,
    "function renderEventWorkspaceNav(event, activeView",
    "function renderEventInsightPanel"
  );

  assert.match(event, /data-screen-kind="event"/);
  assert.match(event, /event-header-actions/);
  assert.match(event, /data-action="show-expense-form"/);
  assert.match(event, /data-action="open-event-participants"/);
  assert.match(event, /data-action="open-event-participant-add"/);
  assert.match(event, /data-action="open-event-settings"/);
  assert.match(navigation, /data-active-event-view/);
  assert.match(navigation, /data-action="back-to-event"/);
  assert.match(navigation, /הוצאות/);
  assert.match(navigation, /סיכום/);
  assert.match(navigation, /event-workspace-summary/);
  assert.match(navigation, /renderCommandIcon\("summary"\)/);
  assert.match(navigation, /מי מעביר למי/);
  assert.match(
    navigation,
    /aria-label="\$\{summaryIsActive \? "סיכום, המסך הנוכחי" : "פתיחת הסיכום: מי מעביר למי"\}"/
  );
  assert.doesNotMatch(navigation, /משתתפים|שיתוף|הגדרות|new-event/);
});

test("opening an event always lands on expenses before settlement", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const openEventHandler = sourceBetween(
    app,
    'if (action === "open-event")',
    'if (action === "new-event-add-guest")'
  );
  const navigation = sourceBetween(
    app,
    "function renderEventWorkspaceNav(event, activeView",
    "function renderEventInsightPanel"
  );

  assert.match(openEventHandler, /screen = \{ name: "event", eventId: target\.dataset\.eventId \}/);
  assert.doesNotMatch(openEventHandler, /settlement/);
  assert.match(navigation, /activeView = "expenses"/);
  assert.match(navigation, /class="event-workspace-tab event-workspace-expenses is-active"/);
  assert.ok(
    navigation.indexOf("event-workspace-expenses") <
      navigation.indexOf("event-workspace-summary"),
    "expenses should be rendered before settlement"
  );
});

test("adding several event guests keeps the manual participant editor active and returns focus", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const addGuestHandler = sourceBetween(
    app,
    'if (action === "new-event-add-guest")',
    'if (action === "group-add-member")'
  );

  assert.match(addGuestHandler, /newEventDraft\.participantView = "manual"/);
  assert.doesNotMatch(addGuestHandler, /participantDetails\.open/);
  assert.match(addGuestHandler, /requestAnimationFrame/);
  assert.match(addGuestHandler, /data-action="new-event-guest-name"/);
  assert.match(addGuestHandler, /\.focus\(\)/);
});

test("stale render callbacks cannot restore focus into a newer screen", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const commit = sourceBetween(
    app,
    "function commitRenderedScreen(html)",
    "function focusRenderedScreen()"
  );
  const restore = sourceBetween(
    app,
    "function restoreRenderInteractionState(snapshot, expectedRenderGeneration)",
    "function dialogRenderSelector(dialog)"
  );

  assert.match(commit, /const currentRenderGeneration = \+\+renderGeneration/);
  assert.match(commit, /restoreRenderInteractionState\(interactionSnapshot, currentRenderGeneration\)/);
  assert.match(commit, /if \(currentRenderGeneration !== renderGeneration\) return/);
  assert.match(restore, /if \(expectedRenderGeneration !== renderGeneration\) return/);
});

test("settlement stays inside the event shell and only switches the active workspace view", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const settlement = sourceBetween(
    app,
    "function renderSettlement(event)",
    "function hasReliableSettlementIdentity"
  );
  const header = sourceBetween(
    app,
    "function renderEventHeader(event",
    "function renderEventIdentityNotice"
  );

  assert.match(settlement, /data-screen-kind="event"/);
  assert.match(settlement, /data-event-view="summary"/);
  assert.match(settlement, /renderEventHeader\(event, activeEventParticipants\(event\)\)/);
  assert.match(settlement, /renderEventWorkspaceNav\(event, "summary"\)/);
  assert.match(settlement, /renderEventDialog\(event\)/);
  assert.match(header, /data-action="open-event-participants"/);
  assert.match(header, /data-action="open-event-participant-add"/);
  assert.match(header, /data-action="open-event-settings"/);
});

test("legacy overlays do not merge event creation and joining back together", async () => {
  const [joinLayer, brandLayer] = await Promise.all([
    readFile("src/publicJoinEventLayer.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8")
  ]);
  const joinEnhancement = sourceBetween(
    joinLayer,
    "function enhanceJoinEventFlow()",
    "function rememberRequestedEventMode"
  );

  assert.doesNotMatch(joinEnhancement, /enhanceNewEventScreen|applyNewEventMode|reduceNewEventChromeRepetition/);
  assert.match(brandLayer, /function shouldShowPrimaryNav\(screen\)/);
  assert.match(brandLayer, /const showPrimaryNav = shouldShowPrimaryNav\(screen\)/);
  assert.match(brandLayer, /if \(!showPrimaryNav\) \{\s*nav\?\.remove\(\);\s*return;/);
  assert.match(brandLayer, /identity\.insertAdjacentHTML\("beforeend", renderHeaderNav\(\)\)/);
  assert.match(brandLayer, /\.product-app-nav\[hidden\]/);
});

test("primary navigation exposes home, events, notifications and profile as distinct destinations", async () => {
  const [app, brandLayer, primaryNavigation] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8"),
    readFile("src/primaryNavigation.mjs", "utf8")
  ]);
  const navigation = primaryNavigation;
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");

  assert.equal([...navigation.matchAll(/class="product-nav-button"/g)].length, 4);
  assert.match(navigation, /data-action="home" data-nav-destination="home"/);
  assert.match(navigation, /data-nav-destination="events"/);
  assert.match(navigation, /data-action="open-notifications" data-nav-destination="notifications"/);
  assert.match(navigation, /class="product-nav-badge" hidden/);
  assert.match(navigation, /data-nav-destination="profile"/);
  assert.match(navigation, /aria-label="ניווט ראשי"/);
  assert.doesNotMatch(navigation, /data-public-action="go-home"/);
  assert.doesNotMatch(navigation, /data-action="join-event-screen"|data-action="groups"/);
  assert.match(brandLayer, /function focusHomeEvents\(\)/);
  assert.match(brandLayer, /setPrimaryNavigationActiveDestination\(/);
  assert.doesNotMatch(home, /class="home-event-tools/);
  assert.doesNotMatch(home, /data-action="join-event-link"/);
  assert.doesNotMatch(home, /data-action="join-existing-event"/);
  assert.doesNotMatch(home, /data-action="join-event-screen"/);
  assert.match(home, /class="home-quick-action home-friends-action" data-action="groups" data-tab="people"/);
});
