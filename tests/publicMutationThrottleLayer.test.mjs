import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public mutation throttle layer loads before advanced workflow observers", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicMutationThrottleLayer\.mjs/);
  assert.ok(
    index.indexOf("publicMutationThrottleLayer.mjs") <
      index.indexOf("publicAdvancedWorkflowLayer.mjs")
  );
});

test("public mutation throttle layer schedules mutation callbacks", async () => {
  const layer = await readFile("src/publicMutationThrottleLayer.mjs", "utf8");

  assert.match(layer, /window\.MutationObserver/);
  assert.match(layer, /requestAnimationFrame/);
  assert.match(layer, /if \(scheduled\) return/);
  assert.match(layer, /__sogrimMutationObserverThrottled/);
});
