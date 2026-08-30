import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public overlay upgrades the app into a product-grade first run experience", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /product-v2/);
  assert.match(overlay, /public-profile-hero/);
  assert.match(overlay, /ארנק קבוצתי/);
  assert.match(overlay, /התחל לסגור חשבון/);
  assert.match(overlay, /cleanPublicUi/);
  assert.match(
    overlay,
    /if \(productV1Active\) \{[\s\S]*?classList\.remove\("product-v2"\)/
  );
});

test("public brand layer gives the app name a visible logo lockup", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(brandLayer, /סוגרים חשבון/);
  assert.match(brandLayer, /חובות בין חברים, בלי כאב ראש/);
  assert.match(brandLayer, /enhanceAppScreenBrand/);
  assert.match(brandLayer, /enhanceProfileGateBrand/);
  assert.match(brandLayer, /syncHeaderNavState/);
  assert.match(brandLayer, /product-app-identity/);
  assert.doesNotMatch(brandLayer, /product-app-identity" aria-label=/);
  assert.match(brandLayer, /product-app-nav/);
  assert.match(brandLayer, /product-brand-image/);
  assert.match(brandLayer, /app-icon-exterior-192\.png/);
  assert.match(brandLayer, /product-hero-artwork/);
  assert.match(brandLayer, /product-home-artwork/);
  assert.match(brandLayer, /product-empty-icon/);
  assert.match(styles, /\.brand::after/);
});

test("public brand navigation state is initialized before the first enhancement", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");

  assert.ok(
    brandLayer.indexOf('let preferredHomeDestination = "home"') <
      brandLayer.indexOf("enhanceBranding();")
  );
});

test("public brand layer synchronizes the identity header with every rendered screen", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");

  assert.match(
    brandLayer,
    /document\.addEventListener\("settle-friends:screen-rendered", enhanceBranding\)/
  );
});

test("empty home preserves the supplied friends image instead of replacing it", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");
  const ledgerLayer = await readFile("src/publicLedgerWorkspaceLayer.mjs", "utf8");

  assert.match(brandLayer, /const emptyLabel = emptyState\?\.querySelector\("strong"\) \?\? emptyState/);
  assert.match(brandLayer, /const productImage = emptyState\?\.querySelector\("img"\)/);
  assert.match(brandLayer, /if \(productImage\)/);
  assert.match(ledgerLayer, /\.home-empty-visual img/);
  assert.match(ledgerLayer, /object-fit: cover/);
});

test("public brand layer avoids repeated DOM writes from mutation observers", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");

  assert.match(brandLayer, /new MutationObserver\(scheduleBranding\)/);
  assert.match(brandLayer, /requestAnimationFrame/);
  assert.match(brandLayer, /function setHidden/);
  assert.match(brandLayer, /function setSuppressed/);
  assert.match(brandLayer, /function setTextIfChanged/);
  assert.match(brandLayer, /advanced-event-filter/);
  assert.match(brandLayer, /product-context-bar/);
  assert.match(brandLayer, /product-home-kicker/);
  assert.match(brandLayer, /style\.setProperty\("display", "none", "important"\)/);
  assert.match(brandLayer, /node\.textContent === text/);
});

test("public brand layer keeps closed event history accessible", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");

  assert.match(brandLayer, /hasStoredEvents/);
  assert.match(brandLayer, /hasRecentEvent/);
  assert.match(brandLayer, /event-status-filter/);
  assert.match(brandLayer, /Number\.parseInt/);
  assert.match(brandLayer, /!hasEventRows && !hasRecentEvent && !hasStoredEvents/);
});

test("public overlay removes internal launch panels and adds a polished home layer", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /enhanceHomeScreen/);
  assert.match(overlay, /product-home-kicker/);
  assert.match(overlay, /פעולה חכמה/);
  assert.match(overlay, /\.network-panel, \.launch-panel/);
  assert.doesNotMatch(overlay, /\.launch-panel, \.backup-panel/);
  assert.match(overlay, /data-action="reset"/);
});

test("public product layer adds premium depth to the active app shell", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /\.product-v2 \.product-app-identity/);
  assert.match(overlay, /\.product-v2 \.top::before/);
  assert.match(overlay, /\.product-v2 \.top \.icon-button/);
  assert.match(overlay, /\.product-v2 \.event-command-grid/);
  assert.match(overlay, /\.product-v2 \.event-command-card::before/);
  assert.match(overlay, /\.product-v2 \.event-modal/);
});

test("public profile gate keeps decorative hero content from blocking the form", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /if \(app\) app\.inert = true/);
  assert.match(
    overlay,
    /if \(app && !accountAuthLocked && !externalDialogOpen\) app\.inert = false/
  );
  assert.match(overlay, /\.public-profile-gate[\s\S]*overflow-y:\s*auto/);
  assert.match(overlay, /\.public-profile-modal[\s\S]*pointer-events:\s*none/);
  assert.match(overlay, /\.public-profile-hero[\s\S]*pointer-events:\s*none/);
  assert.match(overlay, /\.public-profile-form[\s\S]*position:\s*relative/);
  assert.match(overlay, /\.public-profile-form,[\s\S]*\.public-profile-form \*[\s\S]*pointer-events:\s*auto/);
  assert.match(overlay, /@media \(max-width: 760px\)[\s\S]*\.public-profile-modal[\s\S]*max-height:\s*calc\(100vh - 24px\)/);
  assert.match(overlay, /@media \(max-width: 760px\)[\s\S]*\.public-profile-proof[\s\S]*display:\s*none/);
});
