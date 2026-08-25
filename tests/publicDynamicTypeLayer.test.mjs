import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyAndroidFontScale,
  classifyDynamicTypeSize,
  localPreviewSize,
  refreshAndroidDynamicType
} from "../src/publicDynamicTypeLayer.mjs";

const [layer, index, serviceWorker] = await Promise.all([
  readFile("src/publicDynamicTypeLayer.mjs", "utf8"),
  readFile("index.html", "utf8"),
  readFile("sw.js", "utf8")
]);

test("dynamic type size classification reserves reflow for enlarged iOS text", () => {
  assert.equal(classifyDynamicTypeSize("17px"), "normal");
  assert.equal(classifyDynamicTypeSize("19px"), "large");
  assert.equal(classifyDynamicTypeSize("23px"), "extra-large");
  assert.equal(classifyDynamicTypeSize("invalid"), "normal");
});

test("Android font scale maps system accessibility sizes to the same reflow levels", () => {
  assert.equal(classifyAndroidFontScale(1), "normal");
  assert.equal(classifyAndroidFontScale(1.3), "large");
  assert.equal(classifyAndroidFontScale(1.5), "extra-large");
  assert.equal(classifyAndroidFontScale("invalid"), "normal");
});

test("Android reads the native font scale and enables accessible reflow", async () => {
  const classes = new Set();
  const root = {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      }
    },
    dataset: {},
    style: {
      setProperty(name, value) {
        this[name] = value;
      }
    }
  };
  const capacitor = {
    getPlatform: () => "android",
    Plugins: {
      SogrimCapabilities: {
        getCapabilities: async () => ({ fontScale: 1.5 })
      }
    }
  };

  assert.equal(await refreshAndroidDynamicType(root, capacitor), "extra-large");
  assert.equal(root.dataset.dynamicType, "extra-large");
  assert.equal(root.style["--android-font-scale"], "1.5");
  assert.equal(classes.has("dynamic-type-active"), true);
  assert.equal(classes.has("dynamic-type-android"), true);
  assert.equal(classes.has("dynamic-type-extra-large"), true);
});

test("large text preview is constrained to local QA URLs", () => {
  assert.equal(
    localPreviewSize(new URL("http://127.0.0.1:4516/?dynamic-type-preview=28")),
    28
  );
  assert.equal(
    localPreviewSize(new URL("http://localhost:4516/?dynamic-type-preview=99")),
    32
  );
  assert.equal(
    localPreviewSize(new URL("https://sogrim-hesbon-app.vercel.app/?dynamic-type-preview=28")),
    0
  );
});

test("dynamic type layer uses Apple's accessible root size while preserving Hebrew typography", () => {
  assert.match(layer, /font: -apple-system-body/);
  assert.match(layer, /"Rubik", "Heebo", "Assistant", sans-serif/);
  assert.match(layer, /-webkit-text-size-adjust: 100%/);
  assert.match(layer, /font-size: inherit !important/);
});

test("dynamic type layer reads Android system font scale from the native capability plugin", () => {
  assert.match(layer, /SogrimCapabilities\?\.getCapabilities/);
  assert.match(layer, /--android-font-scale/);
  assert.match(layer, /dynamic-type-android/);
});

test("large text mode releases rigid controls and protects fixed bottom navigation", () => {
  assert.match(layer, /white-space: normal !important/);
  assert.match(layer, /overflow: visible !important/);
  assert.match(layer, /height: auto !important/);
  assert.match(layer, /min-height: max\(48px, 2\.85rem\)/);
  assert.match(layer, /\.event-action-dock \{[\s\S]*?position: static !important/);
  assert.match(layer, /\.screen\.event-has-action-dock \{[\s\S]*?padding-bottom: calc\(184px/);
  assert.match(layer, /max-height: 100dvh !important/);
  assert.match(layer, /overflow-y: auto !important/);
  assert.match(
    layer,
    /\.expense-modal[\s\S]*?\.expense-modal-header[\s\S]*?position: static !important[\s\S]*?display: grid !important/
  );
  assert.match(
    layer,
    /\.expense-modal-header[\s\S]*?:where\(\.eyebrow, \.muted\)[\s\S]*?display: none !important/
  );
  assert.match(
    layer,
    /\.expense-modal-header-actions[\s\S]*?min-height: 48px !important/
  );
  assert.match(
    layer,
    /\.expense-modal-step-header \{[\s\S]*?grid-template-columns: 48px minmax\(0, 1fr\) 48px !important/
  );
  assert.match(
    layer,
    /\.expense-modal-step-header[\s\S]*?\.modal-section-back-button \{[\s\S]*?grid-column: 3 !important/
  );
  assert.match(
    layer,
    /\.expense-modal-actions[\s\S]*?min-height: 56px !important[\s\S]*?--dynamic-text-13/
  );
  assert.match(
    layer,
    /\.expense-step-modal[\s\S]*?> \.expense-flow-fields[\s\S]*?flex: 1 1 auto !important[\s\S]*?overflow: hidden !important/
  );
  assert.match(
    layer,
    /\.expense-step-modal[\s\S]*?\.expense-modal-actions[\s\S]*?position: static !important/
  );
  assert.match(layer, /\.product-nav-button[\s\S]*?white-space: nowrap !important/);
  assert.match(layer, /\.event-action-dock[\s\S]*?\.font-num[\s\S]*?white-space: nowrap/);
  assert.match(
    layer,
    /body:has\(\.event-participant-route-backdrop\) #app \.event-action-dock \{[\s\S]*?display: none !important;/
  );
  assert.match(
    layer,
    /\.screen\[data-screen-kind="home"\][\s\S]*?h1 \{[\s\S]*?--dynamic-text-28/
  );
  assert.match(
    layer,
    /\.screen\[data-screen-kind="home"\][\s\S]*?\.hero-actions \{[\s\S]*?margin-top: max\(12px, 0\.5rem\)/
  );
  assert.match(layer, /\.screen\[data-screen-kind="home"\][\s\S]*?position: static !important/);
  assert.match(layer, /\.event-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(layer, /\.expense-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(
    layer,
    /\.product-header-profile-avatar \{[\s\S]*?width: 48px !important[\s\S]*?height: 48px !important/
  );
  assert.match(layer, /#public-account-auth-gate/);
  assert.match(
    layer,
    /#public-account-auth-gate[\s\S]*?:where\(button, input, label, p, li, a\)/
  );
});

test("large text keeps screen-reader-only copy clipped out of the visual layout", () => {
  assert.match(
    layer,
    /\.visually-hidden \{[\s\S]*?width: 1px !important;[\s\S]*?height: 1px !important;[\s\S]*?overflow: hidden !important;[\s\S]*?clip-path: inset\(50%\) !important;[\s\S]*?white-space: nowrap !important;/
  );
});

test("dynamic type layer loads last and is available offline", () => {
  const pickerPosition = index.indexOf("publicChoicePickerLayer.mjs");
  const dynamicTypePosition = index.indexOf("publicDynamicTypeLayer.mjs");

  assert.ok(pickerPosition >= 0);
  assert.ok(dynamicTypePosition > pickerPosition);
  assert.match(serviceWorker, /"\/src\/publicDynamicTypeLayer\.mjs"/);
  assert.match(serviceWorker, /settle-friends-live-v\d+/);
});
