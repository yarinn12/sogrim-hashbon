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

test("public overlay removes internal launch panels and adds a polished home layer", async () => {
  const overlay = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(overlay, /enhanceHomeScreen/);
  assert.match(overlay, /product-home-kicker/);
  assert.match(overlay, /פעולה חכמה/);
  assert.match(overlay, /\.network-panel, \.launch-panel, \.backup-panel/);
  assert.match(overlay, /data-action="reset"/);
});
