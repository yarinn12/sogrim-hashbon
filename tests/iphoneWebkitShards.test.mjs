import test from "node:test";
import assert from "node:assert/strict";
import { IPHONE_WEBKIT_SCOPE_SKIP_IDS, verifyIphoneWebkitShards } from "../scripts/qa/verify-large-text-shards.mjs";

const source = "a".repeat(40), tree = "b".repeat(40);
const ids = ["ordinary-case", ...IPHONE_WEBKIT_SCOPE_SKIP_IDS];
const spec = id => ({ id, title: id, file: "synthetic.spec.mjs",
  tests: [{ projectName: "iphone-webkit", expectedStatus: "passed", status: "skipped", results: [] }] });
const report = entries => ({ suites: [{ specs: entries }], errors: [],
  stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 } });
function fixture() {
  const inventory = report(ids.map(spec));
  const planned = { 1: report(ids.slice(0, 3).map(spec)), 2: report(ids.slice(3).map(spec)) };
  const actual = structuredClone(planned);
  for (const shard of [1, 2]) {
    for (const item of actual[shard].suites[0].specs) {
      const result = item.tests[0];
      if (IPHONE_WEBKIT_SCOPE_SKIP_IDS.has(item.id)) {
        result.expectedStatus = "skipped";
        result.status = "skipped";
        result.annotations = [{ type: "skip", description: "iPad-only layout" }];
        result.results = [{ status: "skipped", retry: 0 }];
        actual[shard].stats.skipped++;
      } else {
        result.status = "expected";
        result.results = [{ status: "passed", retry: 0 }];
        actual[shard].stats.expected++;
      }
    }
  }
  const receipts = Object.fromEntries([1, 2].map(shard => [shard,
    { project: "iphone-webkit", source, tree, shard, runId: "123", runAttempt: "1" }]));
  return { inventory, planned, actual, receipts, source, tree, runId: "123", runAttempt: "1" };
}

test("two WebKit shards cover every source test once with only four iPad scope skips", () => {
  const result = verifyIphoneWebkitShards(fixture());
  assert.deepEqual([result.count, result.shard1, result.shard2], [5, 3, 2]);
});

test("WebKit shard verification rejects a missing, duplicate or misplaced test", () => {
  for (const change of [
    f => f.actual[1].suites[0].specs.pop(),
    f => f.actual[2].suites[0].specs.push(structuredClone(f.actual[1].suites[0].specs[0])),
    f => { const first = f.actual[1].suites[0].specs.shift(); f.actual[2].suites[0].specs.push(first); }
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyIphoneWebkitShards(f), /missing|extra|duplicate/i);
  }
});

test("WebKit shard verification rejects wrong project, source, retries and unexpected skips", () => {
  for (const change of [
    f => { f.inventory.suites[0].specs[0].tests[0].projectName = "iphone-large-text"; },
    f => { f.actual[1].suites[0].specs[0].tests[0].projectName = "iphone-large-text"; },
    f => { f.receipts[1].project = "iphone-large-text"; },
    f => { f.receipts[2].source = "c".repeat(40); },
    f => { f.actual[1].suites[0].specs[0].tests[0].results.push({ status: "passed", retry: 1 }); },
    f => { const result = f.actual[1].suites[0].specs[0].tests[0]; result.status = "skipped"; result.expectedStatus = "skipped"; result.results = [{ status: "skipped", retry: 0 }]; },
    f => { f.actual[2].stats.flaky = 1; }
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyIphoneWebkitShards(f));
  }
});
