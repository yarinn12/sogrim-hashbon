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
});

test("public brand layer gives the app name a visible logo lockup", async () => {
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");
  const styles = await readFile("styles.css", "utf8");

  assert.match(brandLayer, /סוגרים חשבון/);
  assert.match(brandLayer, /התחשבנות חכמה לחברים/);
  assert.match(brandLayer, /enhanceAppScreenBrand/);
  assert.match(brandLayer, /enhanceProfileGateBrand/);
  assert.match(brandLayer, /product-app-identity/);
  assert.match(styles, /content: "₪"/);
});

test("public overlay removes internal launch panels and adds a polished home layer", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /enhanceHomeScreen/);
  assert.match(overlay, /product-home-kicker/);
  assert.match(overlay, /פעולה חכמה/);
  assert.match(overlay, /\.network-panel, \.launch-panel, \.backup-panel/);
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
