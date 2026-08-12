import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("install layer offers native Android installation and iOS home screen guidance", async () => {
  const layer = await readFile("src/publicInstallAppLayer.mjs", "utf8");

  assert.match(layer, /beforeinstallprompt/);
  assert.match(layer, /appinstalled/);
  assert.match(layer, /prompt\.prompt\(\)/);
  assert.match(layer, /userChoice/);
  assert.match(layer, /display-mode: standalone/);
  assert.match(layer, /הוספה למסך הבית/);
  assert.match(layer, /פתח את הקישור ב-Safari/);
  assert.match(layer, /Open as Web App/);
  assert.match(layer, /כך האפליקציה תיפתח בלי שורת הדפדפן/);
  assert.match(layer, /data-public-install-app/);
  assert.match(layer, /\.account-profile-actions/);
  assert.match(layer, /isNativeApp\(\)/);
  assert.match(layer, /role="dialog" aria-modal="true"/);
  assert.match(layer, /INSTALL_HISTORY_KEY/);
  assert.match(layer, /handleInstallNativeBack/);
  assert.match(layer, /setAttribute\("inert", ""\)/);
});

test("installed app assets include Android, maskable and Apple icons", async () => {
  const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
  const html = await readFile("index.html", "utf8");

  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-192.png"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-512.png"));
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-maskable-512.png" && icon.purpose === "maskable"));
  assert.match(html, /apple-touch-icon\.png/);
});
