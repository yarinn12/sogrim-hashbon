import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public advanced workflow layer schedules DOM enhancements safely", async () => {
  const layer = await readFile("src/publicAdvancedWorkflowLayer.mjs", "utf8");

  assert.match(layer, /let advancedWorkflowsScheduled = false/);
  assert.match(layer, /new MutationObserver\(scheduleAdvancedWorkflows\)/);
  assert.match(layer, /function scheduleAdvancedWorkflows/);
  assert.match(layer, /requestAnimationFrame/);
  assert.match(layer, /if \(advancedWorkflowsScheduled\) return/);
  assert.doesNotMatch(layer, /new MutationObserver\(enhanceAdvancedWorkflows\)/);
});

test("advanced workflow layer does not duplicate the home event list or filters", async () => {
  const layer = await readFile("src/publicAdvancedWorkflowLayer.mjs", "utf8");

  assert.match(layer, /function enhanceHome\(\)/);
  assert.match(layer, /\.advanced-next-event, \.advanced-event-filter/);
  assert.match(layer, /element\.remove\(\)/);
  assert.doesNotMatch(layer, /אפשר להתמקד במה שעדיין פתוח/);
  assert.doesNotMatch(layer, /<span class="advanced-kicker">פתוח עכשיו<\/span>/);
});

test("advanced workflows use the account-aware state store", async () => {
  const layer = await readFile("src/publicAdvancedWorkflowLayer.mjs", "utf8");

  assert.match(layer, /loadState as loadStoredState/);
  assert.match(layer, /saveSharedState/);
  assert.doesNotMatch(layer, /localStorage\.setItem/);
  assert.doesNotMatch(layer, /fetch\("\/api\/state"/);
});

test("advanced workflows delegate lifecycle mutations to the native app flow", async () => {
  const layer = await readFile("src/publicAdvancedWorkflowLayer.mjs", "utf8");
  const lifecycle = layer.slice(
    layer.indexOf("function setEventClosed"),
    layer.indexOf("async function mergeSelectedParticipants")
  );

  assert.match(layer, /function findNativeLifecycleAction/);
  assert.match(lifecycle, /nativeAction\?\.click\(\)/);
  assert.doesNotMatch(lifecycle, /\bcloseEvent\(/);
  assert.doesNotMatch(lifecycle, /\breopenEvent\(/);
  assert.doesNotMatch(lifecycle, /window\.location\.reload\(\)/);
  assert.doesNotMatch(lifecycle, /events:\s*\(state\.events \?\? \[\]\)\.map/);
});
