import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  loadAccessibilityPreferences,
  normalizeAccessibilityPreferences,
  saveAccessibilityPreferences
} from "../src/data/accessibilityPreferences.mjs";

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    }
  };
}

test("accessibility preferences normalize malformed values safely", () => {
  assert.deepEqual(normalizeAccessibilityPreferences(null), {
    ...DEFAULT_ACCESSIBILITY_PREFERENCES
  });
  assert.deepEqual(
    normalizeAccessibilityPreferences({
      textSize: "huge",
      highContrast: "yes",
      reduceMotion: 1
    }),
    { ...DEFAULT_ACCESSIBILITY_PREFERENCES }
  );
});

test("accessibility preferences persist on the device", () => {
  const storage = memoryStorage();
  const saved = saveAccessibilityPreferences(
    { textSize: "extra-large", highContrast: true, reduceMotion: true },
    storage
  );

  assert.deepEqual(loadAccessibilityPreferences(storage), saved);
  assert.ok(storage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY));
});

test("accessibility center is semantic, persistent and compatible with app navigation", async () => {
  const [index, layer, splash, motion, icons] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/publicAccessibilityLayer.mjs", "utf8"),
    readFile("src/publicAppSplashLayer.mjs", "utf8"),
    readFile("src/publicFramerMotionLayer.mjs", "utf8"),
    readFile("src/uiIcons.mjs", "utf8")
  ]);

  assert.match(index, /publicAccessibilityLayer\.mjs/);
  assert.match(layer, /aria-label="פתיחת הגדרות נגישות"/);
  assert.match(layer, /role="dialog"/);
  assert.match(layer, /aria-modal="true"/);
  assert.match(layer, /aria-labelledby="accessibility-center-title"/);
  assert.match(layer, /aria-describedby="accessibility-center-description"/);
  assert.match(layer, /role="status" aria-live="polite"/);
  assert.match(layer, /role="switch"/);
  assert.match(layer, /href="\.\/accessibility\.html"/);
  assert.match(layer, /min-height: 44px/);
  assert.match(layer, /handleAccessibilityHistoryBack/);
  assert.match(layer, /handleAccessibilityNativeBack/);
  assert.match(layer, /setBackgroundInert\(true\)/);
  assert.match(layer, /accessibility-reduced-motion/);
  assert.match(layer, /addEventListener\("storage", handleAccessibilityStorageChange\)/);
  assert.match(layer, /\.screen > \.top/);
  assert.match(layer, /settle-friends:accessibility-center-changed/);
  assert.match(layer, /prefers-contrast: more/);
  assert.match(splash, /loadAccessibilityPreferences\(\)\.reduceMotion/);
  assert.match(motion, /accessibility-reduced-motion/);
  assert.match(icons, /accessibility:/);
});
