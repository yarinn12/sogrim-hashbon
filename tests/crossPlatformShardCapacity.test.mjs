import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/qa.yml", import.meta.url), "utf8");
const baseConfig = readFileSync(new URL("../playwright.config.mjs", import.meta.url), "utf8");
const crossConfig = readFileSync(new URL("../playwright.cross-platform.config.mjs", import.meta.url), "utf8");
const jobs = [...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\r?$/gm)];
const job = name => {
  const index = jobs.findIndex(match => match[1] === name);
  return index < 0 ? "" : workflow.slice(jobs[index].index, jobs[index + 1]?.index ?? workflow.length);
};

test("cross-platform capacity runs two complete Playwright shards with the original per-job deadline", () => {
  for (const shard of [1, 2]) {
    const block = job(`cross-platform-shard-${shard}`);
    assert.ok(block, `missing cross-platform shard ${shard}`);
    assert.match(block, /timeout-minutes: 30/);
    assert.match(block, new RegExp(`--shard=${shard}/2`));
    assert.match(block, /npm run qa:cross-platform/);
    assert.match(block, new RegExp(`PW_QA_PORT: "418${shard + 6}"`));
    assert.match(block, new RegExp(`CROSS_PLATFORM_OUTPUT_DIR: test-results-cross-platform-shard-${shard}`));
    assert.doesNotMatch(block, /--workers|--retries|--project|--grep|--test-match/i);
  }
  assert.match(baseConfig, /workers: 1/);
  assert.match(baseConfig, /retries: process\.env\.CI \? 1 : 0/);
  assert.match(baseConfig, /failOnFlakyTests: Boolean\(process\.env\.CI\)/);
  assert.match(crossConfig, /APP_LOCAL_STATE_FILE: `\.qa-cross-platform-\$\{process\.env\.PW_QA_PORT/);
  const aggregate = job("cross-platform");
  assert.match(aggregate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(aggregate, /cross-platform-shard-1/);
  assert.match(aggregate, /cross-platform-shard-2/);
  assert.match(aggregate, /verify-cross-platform-shards\.mjs/);
  assert.match(aggregate, /for project in desktop-chromium desktop-firefox desktop-webkit compact-firefox cross-engine-comparison/);
  assert.match(aggregate, /inventory\/project-\$project\.json/);
  assert.match(job("unit-and-mobile"), /CROSS_PLATFORM_SHARD_1_RESULT/);
  assert.match(job("unit-and-mobile"), /CROSS_PLATFORM_SHARD_2_RESULT/);
});
