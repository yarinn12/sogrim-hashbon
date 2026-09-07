import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import config from "../playwright.config.mjs";
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
