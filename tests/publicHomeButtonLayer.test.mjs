import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public home button layer loads near navigation helpers", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicHomeButtonLayer\.mjs/);
  assert.doesNotMatch(index, /publicBackNavigationLayer\.mjs/);
});

test("public home button layer keeps one top home action only in focused tasks", async () => {
  const layer = await readFile("src/publicHomeButtonLayer.mjs", "utf8");

  assert.match(layer, /HOME_ACTION = "go-home"/);
  assert.match(layer, /querySelectorAll\(`\[data-public-action="\$\{HOME_ACTION\}"\]`\)/);
  assert.match(layer, /\.forEach\(\(button\) => button\.remove\(\)\)/);
  assert.match(layer, /function createHomeButton\(\)/);
  assert.match(layer, /button\.dataset\.action = "home"/);
  assert.match(layer, /if \(!homeScreen && !hasPrimaryNavigation\)/);
  assert.doesNotMatch(layer, /function clickSyntheticHome/);
});

test("internal screens keep back controls while dialogs keep one close action", async () => {
  const [layer, studio] = await Promise.all([
    readFile("src/publicHomeButtonLayer.mjs", "utf8"),
    readFile("src/publicStudioDesignLayer.mjs", "utf8")
  ]);

  assert.match(layer, /controls\.hidden = false/);
  assert.match(layer, /controls\.dataset\.currentRoute = homeScreen \? "home" : "internal"/);
  assert.match(layer, /syncRouteControlState\(\{\s*backButton,\s*homeButton\s*\}\)/);
  assert.match(layer, /function syncDialogRouteControls\(screen\)/);
  assert.match(layer, /legacyControls\?\.remove\(\)/);
  assert.match(layer, /\.expense-modal-header, \.event-modal-header/);
  assert.doesNotMatch(layer, /createHomeButton\("modal-home-button"\)/);
  assert.doesNotMatch(
    studio,
    /\.profile-setup-screen \.product-app-nav,[\s\S]*?\.profile-setup-screen \.product-home-button \{[\s\S]*?display: none !important/
  );
});

test("home lives in app navigation and focused task controls", async () => {
  const [layer, workspace] = await Promise.all([
    readFile("src/publicHomeButtonLayer.mjs", "utf8"),
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8")
  ]);

  assert.match(layer, /controls\.append\(homeButton\)/);
  assert.match(workspace, /primary destinations live in the app navigation/);
  assert.match(workspace, /product-route-controls\s*>\s*\.product-home-button/);
  assert.match(workspace, /display: none !important/);
  assert.match(workspace, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(workspace, /left: 50% !important/);
  assert.match(workspace, /\.product-route-controls[\s\S]*?> \.app-back-button:disabled/);
  assert.match(workspace, /width: 44px !important/);
});
