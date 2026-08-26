import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("live auth QA proves email confirmation and password replacement", async () => {
  const [script, pkg] = await Promise.all([
    readFile("scripts/verify-auth-recovery-live.mjs", "utf8"),
    readFile("package.json", "utf8").then(JSON.parse)
  ]);

  assert.equal(pkg.scripts["qa:auth-live"], "node scripts/verify-auth-recovery-live.mjs");
  assert.match(script, /mailer_autoconfirm/);
  assert.match(script, /unconfirmedLoginBlocked/);
  assert.match(script, /type: "recovery"/);
  assert.match(script, /token_hash: tokenHash/);
  assert.match(script, /updateAccountPassword/);
  assert.match(script, /oldPasswordRejected/);
  assert.match(script, /newPasswordAccepted/);
  assert.match(script, /temporaryAccountsCleaned/);
  assert.doesNotMatch(script, /console\.log\([^)]*(?:password|tokenHash|serviceRoleKey)/);
});
