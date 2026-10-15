import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALLOWED_SCOPE_SKIPS, MINIMUM_PROJECT_CASES,
  verifyCrossPlatformShards } from "../scripts/qa/verify-cross-platform-shards.mjs";

const captured = JSON.parse(readFileSync(new URL("./fixtures/cross-platform-qa467-lists.json", import.meta.url)));
const historicalSkips = JSON.parse(readFileSync(new URL("./fixtures/cross-platform-qa465-skips.json", import.meta.url)));
const source = captured.source, tree = "b".repeat(40), runId = "38736395636", runAttempt = "1";
const clone = value => structuredClone(value);

function visitSpecs(report, callback) {
  const visit = suite => {
    for (const spec of suite.specs ?? []) callback(spec, suite);
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites) visit(suite);
}
function ordinaryTest(report) {
  let selected;
  visitSpecs(report, spec => {
    if (!selected && spec.title !== ALLOWED_SCOPE_SKIPS.get("desktop-chromium").title) selected = spec.tests[0];
  });
  assert.ok(selected);
  return selected;
}

function executed(plan) {
  const result = clone(plan);
  let expected = 0, skipped = 0;
  visitSpecs(result, spec => {
    for (const item of spec.tests) {
      const approved = ALLOWED_SCOPE_SKIPS.get(item.projectId);
      if (approved && spec.file === approved.file && spec.title === approved.title) {
        item.expectedStatus = "skipped";
        item.status = "skipped";
        item.annotations = [{ type: "skip", description: approved.annotation }];
        item.results = [{ status: "skipped", retry: 0 }];
        skipped++;
      } else {
        item.expectedStatus = "passed";
        item.status = "expected";
        item.results = [{ status: "passed", retry: 0 }];
        expected++;
      }
    }
  });
  result.stats = { expected, skipped, unexpected: 0, flaky: 0 };
  return result;
}

function fixture() {
  const reports = clone(captured.reports);
  return {
    canonicalReports: Object.fromEntries([...MINIMUM_PROJECT_CASES.keys()].map(id => [id, reports[id]])),
    inventory: reports.all,
    planned: { 1: reports["1-2"], 2: reports["2-2"] },
    actual: { 1: executed(reports["1-2"]), 2: executed(reports["2-2"]) },
    receipts: Object.fromEntries([1, 2].map(shard => [shard,
      { lane: "cross-platform", source, tree, shard, runId, runAttempt }])),
    source, tree, runId, runAttempt
  };
}

test("captured unsharded and shard lists demonstrate why grouped spec.id is not a stable case key", () => {
  const find = report => {
    let item;
    visitSpecs(report, spec => {
      if (spec.file === "e2e/account-auth-feedback.spec.mjs" &&
          spec.title === "touching the login fields focuses them on iPad and opens the software-input path") item = spec;
    });
    return item;
  };
  const all = find(captured.reports.all), second = find(captured.reports["2-2"]);
  assert.equal(all.tests.length, 4);
  assert.equal(second.tests.length, 1);
  assert.equal(second.tests[0].projectId, "compact-firefox");
  assert.notEqual(all.id, second.id, "the old spec.id + project key would reject this valid shard");
  assert.equal(all.id, ALLOWED_SCOPE_SKIPS.get("desktop-chromium").id);
  assert.equal(second.id, ALLOWED_SCOPE_SKIPS.get("compact-firefox").id);
});

test("actual QA467 inventories reconcile all 482 cases exactly once across 241/241 planned cases", () => {
  const result = verifyCrossPlatformShards(fixture());
  assert.deepEqual([result.count, result.shard1, result.shard2,
    result.passed, result.skipped], [482, 241, 241, 478, 4]);
  assert.deepEqual(result.projects, Object.fromEntries(MINIMUM_PROJECT_CASES));
});

test("only the four skips in the successful QA465 artifact are approved", () => {
  assert.equal(historicalSkips.run, 38723325723);
  assert.equal(historicalSkips.artifact, 11967743798);
  assert.equal(historicalSkips.zipSha256,
    "4873478576b9b9004a387c9bd84d97ddaeaa7050411e681e380392459234dcfd");
  assert.deepEqual(historicalSkips.reportStats,
    { total: 482, expected: 478, unexpected: 0, flaky: 0, skipped: 4, ok: true });
  assert.equal(historicalSkips.scopeSkips.length, ALLOWED_SCOPE_SKIPS.size);
  for (const row of historicalSkips.scopeSkips) {
    const approved = ALLOWED_SCOPE_SKIPS.get(row.projectName);
    assert.ok(approved);
    assert.deepEqual([row.testId, row.file, row.title, row.outcome, row.retry, row.results,
      row.annotations], [approved.id, approved.file, approved.title, "skipped", 0, 1,
      [{ type: "skip", description: approved.annotation }]]);
  }
});

test("missing, duplicated or misplaced planned and actual cases fail closed", () => {
  const changes = [
    f => { f.actual[1].suites[0].specs.pop(); },
    f => { f.actual[1].suites[0].specs.push(clone(f.actual[1].suites[0].specs[0])); },
    f => { f.planned[2].suites[0].specs.pop(); },
    f => { f.planned[2].suites[0].specs.push(clone(f.planned[2].suites[0].specs[0])); },
    f => { f.actual[2].suites[0].specs.push(f.actual[1].suites[0].specs.pop()); },
    f => { f.canonicalReports["desktop-chromium"].suites[0].specs.pop(); }
  ];
  for (const change of changes) {
    const f = fixture(); change(f);
    assert.throws(() => verifyCrossPlatformShards(f));
  }
});

test("foreign source, project, metadata and grouped Playwright ID fail closed", () => {
  for (const change of [
    f => { f.receipts[1].source = "c".repeat(40); },
    f => { f.receipts[2].tree = "c".repeat(40); },
    f => { f.receipts[1].shard = 2; },
    f => { f.receipts[1].runId = "foreign"; },
    f => { f.receipts[2].runAttempt = "2"; },
    f => { f.actual[1].suites[0].specs[0].tests[0].projectId = "foreign"; },
    f => { f.actual[1].suites[0].specs[0].file = "other.spec.mjs"; },
    f => { f.actual[1].suites[0].specs[0].title = "other case"; },
    f => { f.actual[1].suites[0].specs[0].id = "invented-id"; }
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyCrossPlatformShards(f));
  }
});

test("new skip, altered approved skip, retry, flaky and missing result fail closed", () => {
  for (const change of [
    f => { const t = ordinaryTest(f.actual[1]); t.status = "skipped"; t.expectedStatus = "skipped"; t.results = [{ status: "skipped", retry: 0 }]; },
    f => { let changed = false; visitSpecs(f.actual[1], spec => { if (!changed && spec.title === ALLOWED_SCOPE_SKIPS.get("desktop-chromium").title) { spec.tests[0].annotations = [{ type: "skip", description: "other reason" }]; changed = true; } }); assert.ok(changed); },
    f => { ordinaryTest(f.actual[1]).results.push({ status: "passed", retry: 1 }); },
    f => { f.actual[2].stats.flaky = 1; },
    f => { ordinaryTest(f.actual[1]).results = []; },
    f => { f.actual[2].errors.push({ message: "browser failure" }); }
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyCrossPlatformShards(f));
  }
});
