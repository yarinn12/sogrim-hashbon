import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account memory QA saves through the authenticated account workspace", async () => {
  const script = await readFile("scripts/verify-account-memory.mjs", "utf8");

  assert.match(script, /account:\s*\{/);
  assert.match(script, /userId,/);
  assert.match(script, /accessToken: refreshedSession\.access_token/);
  assert.match(script, /spaceId: workspace\.id/);
});
