import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("profile memory guard loads before the app and preserves account auth fields", async () => {
  const [index, layer, sw] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/publicProfileMemoryGuardLayer.mjs", "utf8"),
    readFile("sw.js", "utf8")
  ]);

  assert.ok(
    index.indexOf("publicProfileMemoryGuardLayer.mjs") < index.indexOf("src/app.mjs")
  );
  assert.match(layer, /LOCAL_PROFILE_KEY/);
  assert.match(layer, /Storage\.prototype\.setItem/);
  assert.match(layer, /\["google", "apple", "email"\]/);
  assert.match(layer, /authProvider: previous\.authProvider/);
  assert.match(layer, /authSubject/);
  assert.match(layer, /email/);
  assert.match(sw, /"\/src\/publicProfileMemoryGuardLayer\.mjs"/);
});
