import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("profile context layer loads after the public profile gate", async () => {
  const [index, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.match(index, /publicProfileContextLayer\.mjs/);
  assert.ok(
    index.indexOf("publicProfileContextLayer.mjs") >
      index.indexOf("publicProfileOverlay.mjs")
  );
  assert.ok(
    index.indexOf("publicProfileContextLayer.mjs") >
      index.indexOf("publicAccountAuthLayer.mjs")
  );
  assert.match(sw, /"\/src\/publicProfileContextLayer\.mjs"/);
});

test("profile context layer explains invite entry and memory status", async () => {
  const layer = await readFile("src/publicProfileContextLayer.mjs", "utf8");

  assert.match(layer, /parseInviteSnapshot/);
  assert.match(layer, /parseInviteEventId/);
  assert.match(layer, /loadLocalProfile/);
  assert.match(layer, /invite-profile-preview/);
  assert.match(layer, /profile-memory-status/);
  assert.match(layer, /מחובר עם Google/);
  assert.match(layer, /מחובר לחשבון האישי/);
  assert.match(layer, /נשמר עבורך במכשיר הזה/);
});
