import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertLiveQaWritesAllowed } from "../scripts/liveQaWriteGuard.mjs";

test("live write diagnostics require an exact opt-in, not just a staging label", () => {
  for (const env of [{}, { LIVE_QA_ENVIRONMENT: "staging" },
    { LIVE_QA_ALLOW_WRITES: "true" }, { LIVE_QA_ALLOW_PRODUCTION: "0" }]) {
    assert.throws(() => assertLiveQaWritesAllowed(env), /consumes cloud quota/);
  }
  assert.doesNotThrow(() => assertLiveQaWritesAllowed({ LIVE_QA_ALLOW_WRITES: "1" }));
  assert.doesNotThrow(() => assertLiveQaWritesAllowed({ LIVE_QA_ALLOW_PRODUCTION: "1" }));
});

for (const script of ["verify-account-memory.mjs", "verify-two-account-event-live.mjs",
  "verify-auth-recovery-live.mjs",
  "verify-friend-network-live.mjs", "verify-app-feedback-live.mjs",
  "verify-atomic-shared-event-notes-live.mjs", "verify-product-metrics-live.mjs"]) {
  test(`${script} exits before any backend setup without live-write approval`, () => {
    const source = readFileSync(new URL(`../scripts/${script}`, import.meta.url), "utf8");
    assert.ok(source.indexOf("assertLiveQaWritesAllowed();") < source.indexOf("const supabaseUrl"));
    const result = spawnSync(process.execPath, [`scripts/${script}`], {
      cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10_000,
      // Empty values remain explicitly defined, so .env files cannot opt the
      // child process into a live run. Never let a broken guard test reach a
      // real backend through another database or public-origin setting either.
      env: { ...process.env, LIVE_QA_ALLOW_WRITES: "", LIVE_QA_ALLOW_PRODUCTION: "",
        SUPABASE_URL: "https://unreachable-fixture.invalid", SUPABASE_ANON_KEY: "fixture-public-key",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
        POSTGRES_URL_NON_POOLING: "postgres://fixture:fixture@127.0.0.1:1/fixture",
        SUPABASE_DB_URL: "postgres://fixture:fixture@127.0.0.1:1/fixture",
        DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:1/fixture",
        POSTGRES_URL: "postgres://fixture:fixture@127.0.0.1:1/fixture",
        APP_PUBLIC_URL: "https://unreachable-fixture.invalid",
        PUBLIC_APP_URL: "https://unreachable-fixture.invalid",
        TWO_ACCOUNT_QA_ORIGIN: "https://unreachable-fixture.invalid" }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Live QA performs real network writes/);
    assert.doesNotMatch(result.stderr, /fetch failed|ENOTFOUND|ECONNREFUSED/);
  });
}
