import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import config from "../playwright.config.mjs";
import syncConfig from "../playwright.sync.config.mjs";
import { getRuntimeConfig } from "../src/server/runtimeConfig.mjs";
import { loadPrivateOperatorEnv } from "../src/server/envFile.mjs";

test("browser QA cannot auto-load private operator credentials", () => {
  const env = { ...config.webServer.env, SOGRIM_PRIVATE_ENV_FILE: "./must-not-read-private.env" };
  assert.equal(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD, "1");
  // The loader would throw on this inside-workspace path if it were reached.
  assert.doesNotThrow(() => loadPrivateOperatorEnv(env));
  const runtime = getRuntimeConfig(env);
  assert.equal(runtime.storage.mode, "local");
  assert.equal(runtime.launch.cloudStorageReady, false);
  assert.equal(runtime.launch.shareLinksReady, false);
});

test("local UI benchmarking opts out of private credential auto-loading too", () => {
  const source = readFileSync(new URL("../scripts/benchmark-large-event-ui.mjs", import.meta.url), "utf8");
  assert.match(source, /SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:\s*"1"/);
});

test("two-client QA has an isolated local server and cannot load cloud credentials", () => {
  assert.equal(syncConfig.webServer.reuseExistingServer, false);
  assert.notEqual(syncConfig.webServer.env.APP_LOCAL_STATE_FILE, config.webServer.env.APP_LOCAL_STATE_FILE);
  assert.equal(new URL(syncConfig.use.baseURL).hostname, "127.0.0.1");
  const env = { ...syncConfig.webServer.env, SOGRIM_PRIVATE_ENV_FILE: "./must-not-read-private.env" };
  assert.doesNotThrow(() => loadPrivateOperatorEnv(env));
  const runtime = getRuntimeConfig(env);
  assert.equal(runtime.storage.mode, "local");
  assert.equal(runtime.launch.cloudStorageReady, false);
  assert.equal(runtime.launch.shareLinksReady, false);
});

test("two-client journeys are a single independent lane with first-failure evidence", () => {
  assert.equal(syncConfig.testDir, "./e2e-sync");
  assert.equal(syncConfig.projects.length, 1);
  assert.equal(syncConfig.retries, 0);
  assert.equal(config.use.trace, "retain-on-failure");
  assert.equal(syncConfig.use.trace, "retain-on-failure");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["qa:sync"], "playwright test --config playwright.sync.config.mjs");
  for (const path of [".vercelignore", ".dockerignore"]) {
    const ignore = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").split(/\r?\n/);
    for (const directory of ["e2e-sync", "test-results-sync", "playwright-report-sync"]) {
      assert.ok(ignore.includes(directory), `${path} must exclude ${directory}`);
    }
  }
});

test("CI rejects focused-only and failed-then-passed browser tests in both lanes", () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import mobile from "./playwright.config.mjs";
    import sync from "./playwright.sync.config.mjs";
    console.log(JSON.stringify([mobile, sync].map(config => ({
      forbidOnly: config.forbidOnly,
      failOnFlakyTests: config.failOnFlakyTests,
      trace: config.use.trace
    }))));
  `], { cwd: new URL("..", import.meta.url), env: { ...process.env, CI: "1" }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  for (const config of JSON.parse(child.stdout)) {
    assert.deepEqual(config, { forbidOnly: true, failOnFlakyTests: true, trace: "retain-on-failure" });
  }
});
