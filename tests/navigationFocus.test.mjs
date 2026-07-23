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

test("creating an event is available from home but not from join or event screens", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const home = sourceBetween(app, "function renderHome()", "function renderHomeEventTools");
  const join = sourceBetween(app, "function renderJoinEvent()", "function renderEvent(event)");
  const event = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");

  assert.equal([...home.matchAll(/data-action="new-event"/g)].length, 1);
  assert.doesNotMatch(join, /data-action="new-event"/);
  assert.doesNotMatch(event, /data-action="new-event"|data-action="duplicate-event"/);
});

test("the active event keeps one primary expense action and two focused internal destinations", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const event = sourceBetween(app, "function renderEvent(event)", "function renderEventStartPanel");
  const navigation = sourceBetween(app, "function renderEventWorkspaceNav(event)", "function renderEventInsightPanel");

  assert.match(event, /data-screen-kind="event"/);
  assert.match(event, /event-header-actions/);
  assert.match(event, /data-action="show-expense-form"/);
  assert.match(event, /data-action="open-event-participants"/);
  assert.match(event, /data-action="open-event-share"/);
  assert.match(event, /data-action="open-event-settings"/);
  assert.equal([...navigation.matchAll(/class="event-workspace-tab/g)].length, 2);
  assert.match(navigation, /הוצאות/);
  assert.match(navigation, /סיכום/);
  assert.doesNotMatch(navigation, /משתתפים|שיתוף|הגדרות|new-event/);
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
  assert.match(brandLayer, /const PRIMARY_NAV_SCREENS = new Set\(\["home", "profile", "groups"\]\)/);
  assert.match(brandLayer, /const showPrimaryNav = PRIMARY_NAV_SCREENS\.has\(kind\)/);
  assert.match(brandLayer, /if \(!showPrimaryNav\) \{\s*nav\?\.remove\(\);\s*return;/);
  assert.match(brandLayer, /identity\.insertAdjacentHTML\("beforeend", renderHeaderNav\(\)\)/);
  assert.match(brandLayer, /\.product-app-nav\[hidden\]/);
});

test("primary navigation exposes home, events and profile as distinct destinations", async () => {
  const [app, brandLayer] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8")
  ]);
  const navigation = sourceBetween(brandLayer, "function renderHeaderNav()", "function syncHeaderNavState()");
  const home = sourceBetween(app, "function renderHome()", "function renderRecentEventShortcut");

  assert.equal([...navigation.matchAll(/class="product-nav-button"/g)].length, 3);
  assert.match(navigation, /data-action="home" data-nav-destination="home"/);
  assert.match(navigation, /data-nav-destination="events"/);
  assert.match(navigation, /data-nav-destination="profile"/);
  assert.match(navigation, /aria-label="&#1504;&#1497;&#1493;&#1493;&#1496; &#1512;&#1488;&#1513;&#1497;"/);
  assert.doesNotMatch(navigation, /data-public-action="go-home"/);
  assert.doesNotMatch(navigation, /data-action="join-event-screen"|data-action="groups"/);
  assert.match(brandLayer, /function focusHomeEvents\(\)/);
  assert.match(brandLayer, /setPrimaryNavigationActiveDestination\(/);
  assert.match(home, /class="home-event-tools"/);
  assert.match(home, /data-action="join-event-screen"/);
  assert.match(home, /data-action="groups"/);
});
