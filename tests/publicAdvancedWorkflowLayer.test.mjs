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
