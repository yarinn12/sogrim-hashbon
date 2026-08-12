import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("primary navigation remains available in event, settlement, and notification flows", async () => {
  const [styles, brand] = await Promise.all([
    readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8"),
    readFile("src/publicBrandLayer.mjs", "utf8")
  ]);

  assert.match(styles, /\.product-app-nav\[hidden\] \{[\s\S]*?display: none !important/);
  assert.match(brand, /const PRIMARY_NAV_SCREENS = new Set\(\[[\s\S]*?"event",[\s\S]*?"settlement"[\s\S]*?\]\)/);
  assert.match(brand, /const PRIMARY_NAV_SCREENS = new Set\(\[[\s\S]*?"notifications"/);
  assert.match(
    brand,
    /kind === "notifications"[\s\S]*?\? "notifications"[\s\S]*?\["profile", "groups"\]\.includes\(kind\)[\s\S]*?\? "profile"/
  );
  assert.match(styles, /\.product-app-nav \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important/);
  assert.match(brand, /function syncNotificationNavBadge\(nav\)/);
  assert.doesNotMatch(
    brand,
    /const eventDestinations = new Set\(\[[^\]]*"groups"/
  );
  assert.match(
    brand,
    /\["home", "event", "settlement", "join-event", "new-event", "groups", "notifications"\]\.includes\(explicitKind\)/
  );
  assert.match(brand, /PRIMARY_NAV_SCREENS\.has\(kind\) \? renderHeaderNav\(\) : ""/);
  assert.doesNotMatch(brand, /PRIMARY_NAV_SCREENS = new Set\([^\n]*"join-event"/);
  assert.doesNotMatch(brand, /PRIMARY_NAV_SCREENS = new Set\([^\n]*"new-event"/);
});

test("studio layer fully styles the empty-state icon after retiring the brand stylesheet", async () => {
  const styles = await readFile("src/publicStudioDesignLayer.mjs", "utf8");

  assert.match(styles, /\.product-empty-icon svg/);
  assert.match(styles, /fill: none !important/);
  assert.match(styles, /stroke: currentColor !important/);
  assert.match(styles, /\.product-empty-icon rect/);
});

test("advanced expense details preserve accessible native disclosure behavior", async () => {
  const styles = await readFile("src/publicStudioDesignLayer.mjs", "utf8");

  assert.match(styles, /\.expense-details-panel > summary/);
  assert.match(styles, /min-height: 68px !important/);
  assert.match(styles, /\.expense-details-panel > summary:focus-visible/);
  assert.match(styles, /\.expense-details-panel\[open\]/);
});
