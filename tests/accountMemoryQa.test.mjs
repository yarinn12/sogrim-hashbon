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

test("account memory QA removes the shared event before its personal index", async () => {
  const script = await readFile("scripts/verify-account-memory.mjs", "utf8");
  const deletionStart = script.indexOf("const deletedState = deleteEvent");
  const sharedDeletion = script.indexOf("await syncSharedEvents", deletionStart);
  const personalSave = script.indexOf(
    "await saveCloudStateWithConflictRetry",
    deletionStart
  );

  assert.ok(deletionStart >= 0);
  assert.ok(sharedDeletion > deletionStart);
  assert.ok(personalSave > sharedDeletion);
  assert.match(
    script.slice(sharedDeletion, personalSave),
    /deletedEventIds:\s*\[eventId\]/
  );
});
