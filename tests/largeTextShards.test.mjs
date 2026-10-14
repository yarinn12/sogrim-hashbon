import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_SCOPE_SKIP_IDS, verifyLargeTextShards } from "../scripts/qa/verify-large-text-shards.mjs";

const source = "a".repeat(40), tree = "b".repeat(40);
const ids = ["ordinary-case", ...ALLOWED_SCOPE_SKIP_IDS];
const spec = id => ({
  id, title: id, file: "synthetic.spec.mjs",
  tests: [{ projectName: "iphone-large-text", expectedStatus: "passed", status: "skipped", results: [] }]
});
const report = entries => ({ suites: [{ specs: entries }], errors: [],
  stats: { expected: 0, skipped: 0, unexpected: 0, flaky: 0 } });
function fixture() {
  const inventory = report(ids.map(spec));
  const planned = { 1: report(ids.slice(0, 4).map(spec)), 2: report(ids.slice(4).map(spec)) };
  const actual = structuredClone(planned);
  for (const shard of [1, 2]) {
    for (const item of actual[shard].suites[0].specs) {
      const result = item.tests[0];
      if (ALLOWED_SCOPE_SKIP_IDS.has(item.id)) {
        result.expectedStatus = "skipped";
        result.status = "skipped";
        result.annotations = [{ type: "skip", description: "profile scope" }];
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
    { source, tree, shard, runId: "123", runAttempt: "1" }]));
  return { inventory, planned, actual, receipts, source, tree, runId: "123", runAttempt: "1" };
}

test("two independent shard reports cover the exact source inventory once with declared scope skips", () => {
  const result = verifyLargeTextShards(fixture());
  assert.deepEqual([result.count, result.shard1, result.shard2], [8, 4, 4]);
});

test("missing, duplicated and wrong-shard results are rejected", () => {
  for (const change of [
    f => f.actual[1].suites[0].specs.pop(),
    f => f.actual[2].suites[0].specs.push(structuredClone(f.actual[1].suites[0].specs[0])),
    f => { const first=f.actual[1].suites[0].specs.shift();f.actual[2].suites[0].specs.push(first); }
  ]) {
    const f=fixture();change(f);
    assert.throws(() => verifyLargeTextShards(f), /missing|extra|duplicate/i);
  }
});

test("wrong source, wrong shard, absent artifact, retry and unexpected skip fail closed", () => {
  for (const change of [
    f => { f.receipts[1].source="c".repeat(40); },
    f => { f.receipts[2].tree="c".repeat(40); },
    f => { f.receipts[1].shard=2; },
    f => { delete f.actual[2]; },
    f => { f.actual[1].suites[0].specs[0].tests[0].results.push({status:"passed",retry:1}); },
    f => { const t=f.actual[1].suites[0].specs[0].tests[0];t.status="skipped";t.expectedStatus="skipped";t.results=[{status:"skipped"}]; },
    f => { f.actual[2].stats.flaky=1; }
  ]) {
    const f=fixture();change(f);
    assert.throws(() => verifyLargeTextShards(f));
  }
});
