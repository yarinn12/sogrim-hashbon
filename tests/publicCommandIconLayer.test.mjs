import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public command icon layer loads after the home navigation helper", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicCommandIconLayer\.mjs/);
  assert.ok(
    index.indexOf("publicHomeButtonLayer.mjs") <
      index.indexOf("publicCommandIconLayer.mjs")
  );
});

test("public command icon layer adds action icons and removes duplicate event from the grid", async () => {
  const layer = await readFile("src/publicCommandIconLayer.mjs", "utf8");

  assert.match(layer, /COMMAND_ICONS/);
  assert.match(layer, /command-card-icon/);
  assert.match(layer, /button-action-icon/);
  assert.match(layer, /"new-event"/);
  assert.match(layer, /getButtonAction/);
  assert.match(layer, /הצטרפות לאירוע/);
  assert.match(layer, /\.hero-actions button,/);
  assert.match(layer, /hideDuplicateEventCard/);
  assert.match(layer, /data-action="duplicate-event"/);
  assert.match(layer, /"open-event-settings"/);
  assert.match(layer, /existingIcon\.innerHTML = icon/);
});

test("settings command icon uses a clean sliders mark instead of an uneven gear", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const layer = await readFile("src/publicCommandIconLayer.mjs", "utf8");

  for (const source of [app, layer]) {
    assert.match(source, /M4 7h16/);
    assert.match(source, /M4 12h16/);
    assert.match(source, /M4 17h16/);
    assert.doesNotMatch(source, /M19\.4 15a1\.7/);
  }
});
