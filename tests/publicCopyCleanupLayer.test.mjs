import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public copy cleanup layer loads last", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicCopyCleanupLayer\.mjs/);
  assert.match(
    index,
    /publicVisualRefreshLayer\.mjs"><\/script>[\s\S]+publicCopyCleanupLayer\.mjs"><\/script>/
  );
  assert.ok(
    index.lastIndexOf("publicCopyCleanupLayer.mjs") >
      index.lastIndexOf("publicAdvancedWorkflowLayer.mjs")
  );
});

test("public copy cleanup avoids observer loops after screen changes", async () => {
  const layer = await readFile("src/publicCopyCleanupLayer.mjs", "utf8");

  assert.match(layer, /let copyCleanupScheduled = false/);
  assert.match(layer, /let copyCleanupWriting = false/);
  assert.match(layer, /new MutationObserver\(scheduleCopyCleanup\)/);
  assert.match(layer, /requestAnimationFrame/);
  assert.match(layer, /if \(copyCleanupWriting \|\| copyCleanupScheduled\) return/);
  assert.match(layer, /queueMicrotask/);
  assert.doesNotMatch(layer, /new MutationObserver\(cleanUserFacingCopy\)/);
});

test("public copy cleanup layer replaces internal wording with product copy", async () => {
  const layer = await readFile("src/publicCopyCleanupLayer.mjs", "utf8");

  assert.match(layer, /cleanUserFacingCopy/);
  assert.match(layer, /product-app-badge/);
  assert.match(layer, /כאן מנהלים שמות ששמרת/);
  assert.match(layer, /קישור הצטרפות/);
  assert.doesNotMatch(layer, /בטא ציבורית/);
  assert.doesNotMatch(layer, /האפליקציה לא ממציאה אנשים/);
});
