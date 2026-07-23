import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app startup avoids an unconditional cloud write after every reload", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const startup = app.slice(
    app.indexOf("loadSharedState().then"),
    app.indexOf("loadRuntimeConfig().then")
  );

  assert.match(startup, /hasSharedStateChanged\(sharedState, nextState\)/);
  assert.match(startup, /if \(shouldSaveJoinedProfile\) await saveSharedState\(state\)/);
  assert.doesNotMatch(startup, /if \(localProfile\) await saveSharedState\(state\)/);
});
