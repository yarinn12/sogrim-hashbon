import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("every screen transition moves focus to the new screen heading", async () => {
  const [index, app] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8")
  ]);

  assert.match(index, /class="skip-link" href="#app"/);
  assert.match(index, /<main id="app" class="app app-boot" tabindex="-1" aria-busy="true">/);
  assert.match(app, /function focusRenderedScreen\(\)/);
  assert.match(app, /app\.querySelector\("\.screen h1"\)/);
  assert.match(app, /focusTarget\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(app, /if \(screen\.name === "home"\) return false/);
  assert.match(app, /appHistoryDepth = 0;[\s\S]*?lastNavigationViewKey = ""/);
});

test("mobile keyboard actions advance fields and submit safe inline actions", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /function handleInputKeyboardShortcut\(event\)/);
  assert.match(app, /event\.isComposing/);
  assert.match(app, /action === "profile-name"[\s\S]*?save-profile/);
  assert.match(app, /action === "join-event-link"[\s\S]*?join-existing-event/);
  assert.match(app, /action === "event-guest-name"[\s\S]*?event-add-guest/);
  assert.match(app, /action === "quick-item-name"[\s\S]*?quick-item-amount/);
  assert.match(app, /action === "quick-item-amount"[\s\S]*?quick-item-shared-by/);
  assert.match(app, /data-action="profile-name"[\s\S]*?enterkeyhint="done"/);
  assert.match(app, /data-action="join-event-link"[\s\S]*?enterkeyhint="go"/);
  assert.match(app, /data-action="quick-item-amount"[\s\S]*?inputmode="decimal"[\s\S]*?dir="ltr"/);
});

test("focused tasks keep back and home in quick controls", async () => {
  const [app, layer, brand] = await Promise.all([
    readFile("src/app.mjs", "utf8"),
    readFile("src/publicHomeButtonLayer.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8")
  ]);

  assert.match(app, /const persistentIdentity = app\.querySelector\(/);
  assert.match(app, /querySelector\(":scope > \.product-route-controls"\)/);
  assert.match(app, /renderedScreen\.prepend\(persistentIdentity\)/);
  assert.match(layer, /product-route-controls/);
  assert.match(layer, /controls\.setAttribute\("role", "group"\)/);
  assert.match(layer, /screen\.querySelector\('\[data-action="go-back"\]'\)/);
  assert.match(layer, /controls\.prepend\(backButton\)/);
  assert.match(layer, /controls\.append\(homeButton\)/);
  assert.match(layer, /button\.dataset\.action = "home"/);
  assert.match(layer, /aria-label", "\\u05d7\\u05d6\\u05e8\\u05d4 \\u05dc\\u05de\\u05e1\\u05da \\u05d4\\u05d1\\u05d9\\u05ea"/);
  assert.match(brand, /class="product-app-nav"/);
  assert.match(brand, /data-action="home" data-nav-destination="home"/);
  assert.match(brand, /data-nav-destination="events"/);
  assert.match(brand, /data-nav-destination="profile"/);
  assert.match(layer, /controls\.hidden = false/);
  assert.match(layer, /controls\.dataset\.currentRoute = homeScreen \? "home" : "internal"/);
  assert.match(layer, /syncDialogRouteControls\(screen\)/);
  assert.match(layer, /controls\.inert = dialogOpen/);
  assert.match(layer, /controls\.setAttribute\("aria-hidden", "true"\)/);
});

test("event navigation exposes its current section and explicit button types", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const start = app.indexOf("function renderEventWorkspaceNav(event)");
  const end = app.indexOf("function renderEventInsightPanel", start);
  const navigation = app.slice(start, end);

  assert.match(navigation, /aria-current="page"/);
  assert.match(navigation, /<button type="button" class="event-workspace-tab"/);
  assert.match(navigation, /href="#event-expenses"/);
  assert.match(app, /class="icon-button modal-back-button modal-close-button"/);
  assert.match(app, /element\.dataset\.appDialogInertContainer = "true"/);
  assert.match(app, /document\.querySelectorAll\("\.skip-link"\)/);
  assert.match(app, /delete element\.dataset\.appDialogInertContainer/);
  assert.match(app, /const DIALOG_OPEN_ACTIONS = new Set/);
  assert.match(app, /rememberDialogReturnFocus\(target\)/);
  assert.match(app, /returnTarget\.element\?\.isConnected/);
  assert.match(app, /function restorePendingDialogReturnFocus\(\)/);
  assert.match(app, /window\.setTimeout\(restorePendingDialogReturnFocus, 220\)/);
  assert.match(app, /window\.setTimeout\(restorePendingDialogReturnFocus, 120\)/);
});

test("mobile navigation stays visible and uses store-ready touch targets", async () => {
  const styles = await readFile("src/publicStudioDesignLayer.mjs", "utf8");

  assert.match(styles, /Accessible navigation v6/);
  assert.match(styles, /\.app-back-button:disabled \{[\s\S]*?display: none !important/);
  assert.match(styles, /\.product-app-identity \{[\s\S]*?position: sticky !important/);
  assert.match(styles, /\.product-route-controls > \.app-back-button[\s\S]*?min-width: 48px !important/);
  assert.match(styles, /\.event-workspace-tab \{[\s\S]*?min-height: 48px !important/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /#event-expenses \{[\s\S]*?scroll-margin-top: 132px/);
  assert.match(styles, /\.modal-back-button \{[\s\S]*?min-width: 88px !important/);
});
