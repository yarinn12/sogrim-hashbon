import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("the new brand source drives every public logo format", async () => {
  const [script, source, mark, lockup, share, icon192, icon512, appleIcon] = await Promise.all([
    readFile("scripts/build-brand-assets.py", "utf8"),
    readFile("assets/brand/sogrim-logo-2026-source.png"),
    readFile("brand-mark-v3.png"),
    readFile("sogrim-logo-lockup.png"),
    readFile("sogrim-share-logo.png"),
    readFile("icon-192.png"),
    readFile("icon-512.png"),
    readFile("apple-touch-icon.png")
  ]);

  assert.match(script, /sogrim-logo-2026-source\.png/);
  assert.deepEqual(pngDimensions(source), { width: 1024, height: 559 });
  assert.deepEqual(pngDimensions(mark), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions(lockup), { width: 967, height: 417 });
  assert.deepEqual(pngDimensions(share), { width: 1200, height: 630 });
  assert.deepEqual(pngDimensions(icon192), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(icon512), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(appleIcon), { width: 180, height: 180 });
});

test("native launcher and store icons use the same square brand mark", async () => {
  const [iosIcon, androidIcon, androidRoundIcon, playIcon, manifest] = await Promise.all([
    readFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
    readFile("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"),
    readFile("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"),
    readFile("docs/store-assets/google-play-icon-512.png"),
    readFile("manifest.webmanifest", "utf8").then(JSON.parse)
  ]);

  assert.deepEqual(pngDimensions(iosIcon), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions(androidIcon), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(androidRoundIcon), { width: 192, height: 192 });
  assert.notDeepEqual(androidRoundIcon, androidIcon);
  assert.deepEqual(pngDimensions(playIcon), { width: 512, height: 512 });
  assert.ok(manifest.icons.some((icon) => icon.src === "./icon-maskable-512.png"));
});
