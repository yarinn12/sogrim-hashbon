import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);

for (const config of ["playwright.config.mjs", "playwright.sync.config.mjs"]) {
  test(`${config} JSON artifacts do not serialize inherited secrets`, () => {
    const secret = `synthetic-private-${randomUUID()}`;
    const cli = join(dirname(require.resolve("playwright/package.json")), "cli.js");
    const child = spawnSync(process.execPath, [cli, "test", `--config=${config}`, "--list", "--reporter=json"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024,
      env: {...process.env, SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: "1", QA_REGRESSION_PRIVATE_KEY: secret,
        PLAYWRIGHT_JSON_OUTPUT_FILE: "", PLAYWRIGHT_JSON_OUTPUT_NAME: "", PLAYWRIGHT_JSON_OUTPUT_DIR: ""}
    });
    assert.equal(child.status, 0, `Playwright listing failed: ${child.stderr?.slice(-1000)}`);
    // Never include the report itself in assertion output: the baseline contains inherited secrets.
    assert.equal(child.stdout.includes(secret), false, "A private inherited environment value reached the JSON artifact");
    const report = JSON.parse(child.stdout);
    assert.equal(report.config.webServer.env.SUPABASE_SERVICE_ROLE_KEY, " ");
    assert.ok(report.suites.length > 0, "Exercise the real JSON reporter rather than an empty stand-in");
  });
}
