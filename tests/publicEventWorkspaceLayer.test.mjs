import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public event workspace layer loads with the product overlays", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicEventWorkspaceLayer\.mjs/);
  assert.ok(
    index.indexOf("publicInviteSnapshotLayer.mjs") <
      index.indexOf("publicEventWorkspaceLayer.mjs")
  );
  assert.match(sw, /publicEventWorkspaceLayer\.mjs/);
});

test("public event workspace layer adds event navigation, insights, and settlement hero", async () => {
  const layer = await readFile("src/publicEventWorkspaceLayer.mjs", "utf8");

  assert.match(layer, /enhanceEventWorkspace/);
  assert.match(layer, /event-workspace-nav/);
  assert.match(layer, /event-insight-panel/);
  assert.match(layer, /@media \(max-width: 760px\)/);
  assert.match(layer, /settlement-hero/);
  assert.match(layer, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(layer, /data-action="open-event-settings"/);
  assert.doesNotMatch(layer, /data-action="duplicate-event"/);
  assert.match(layer, /calculateSettlement/);
  assert.match(layer, /reconcileSettlementTransfers/);
  assert.doesNotMatch(
    layer,
    /event\.transfers\?\.length \? event\.transfers : settlement\.transfers/
  );
  const currentEventId = layer.slice(layer.indexOf("function currentEventId"));
  assert.match(currentEventId, /\.screen\[data-event-id\]/);
  assert.doesNotMatch(currentEventId, /data-action="settle"/);
});
