import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALLOWED_SCOPE_SKIPS, MINIMUM_PROJECT_CASES,
  verifyCrossPlatformShards } from "../scripts/qa/verify-cross-platform-shards.mjs";

const captured = JSON.parse(readFileSync(new URL("./fixtures/cross-platform-qa467-lists.json", import.meta.url)));
const historicalSkips = JSON.parse(readFileSync(new URL("./fixtures/cross-platform-qa465-skips.json", import.meta.url)));
const touchScopes=JSON.parse(readFileSync(new URL('../scripts/qa/cross-platform-touch-scopes.json',import.meta.url),'utf8')).cases;
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
      const touchScope=touchScopes.find(row=>row.projectId===item.projectId&&row.file===spec.file&&row.title===spec.title);
      if (approved && spec.file === approved.file && spec.title === approved.title || touchScope) {
        item.expectedStatus = "skipped";
        item.status = "skipped";
        item.annotations = [{ type: "skip", description: touchScope?.annotation??approved.annotation }];
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
      { lane: "cross-platform", source, tree, shard, shardCount:2, runId, runAttempt }])),
    source, tree, runId, runAttempt
  };
}

function sixteenShardFixture() {
  const f=touchScopeFixture(), shardCount=16;
  for(const [project,count] of Object.entries({'desktop-chromium':858,'desktop-firefox':869,'desktop-webkit':858,'compact-firefox':872,'cross-engine-comparison':9})){
    let existing=0;visitSpecs(f.canonicalReports[project],()=>existing++);
    const specs=Array.from({length:count-existing},(_,i)=>({id:`padding-${project}-${i}`,ok:true,
      file:'capacity-padding.spec.mjs',title:'capacity case '+i,line:i+1,column:1,
      tests:[{projectId:project,projectName:project,expectedStatus:'passed',status:'skipped',results:[]}]}));
    const suite={title:'capacity-padding.spec.mjs',specs,suites:[]};
    f.canonicalReports[project].suites.push(clone(suite));f.inventory.suites.push(clone(suite));
  }
  let ordinal=0;
  const trees=Object.values(f.canonicalReports).map(report=>report.suites);
  const tagged=trees.map(suites=>{
    const tag=suite=>{for(const spec of suite.specs??[])spec.__shard=ordinal++%shardCount+1;
      for(const child of suite.suites??[])tag(child);};
    suites.forEach(tag);return suites;
  });
  const select=(suite,shard)=>{
    const out=clone(suite);
    out.specs=(suite.specs??[]).filter(spec=>spec.__shard===shard).map(spec=>{
      const copy=clone(spec);delete copy.__shard;return copy;
    });
    out.suites=(suite.suites??[]).map(child=>select(child,shard))
      .filter(child=>child.specs.length||child.suites.length);
    return out;
  };
  const planned=Object.fromEntries(Array.from({length:shardCount},(_,i)=>{
    const report=clone(f.inventory);
    report.suites=tagged.flat().map(suite=>select(suite,i+1))
      .filter(suite=>suite.specs.length||suite.suites.length);
    return[i+1,report];
  }));
  // Tagging is local test fixture bookkeeping, never part of the source report.
  for(const r of Object.values(f.canonicalReports))visitSpecs(r,spec=>delete spec.__shard);
  return {...f,shardCount,planned,
    actual:Object.fromEntries(Object.entries(planned).map(([id,plan])=>[id,executed(plan)])),
    receipts:Object.fromEntries(Array.from({length:shardCount},(_,i)=>[i+1,{
      lane:'cross-platform',source,tree,shard:i+1,shardCount,runId,runAttempt
    }]))};
}

test('sixteen planned shards execute the complete canonical inventory exactly once',()=>{
  const r=verifyCrossPlatformShards(sixteenShardFixture());
  assert.equal(r.count,3466);assert.equal(r.shardCount,16);
  assert.equal(Object.values(r.shards).reduce((a,b)=>a+b,0),3466);
  assert.equal(r.passed,3454);assert.equal(r.skipped,12);
});
test('coherent omission from all cross-engine plans and results cannot narrow the source',()=>{
  const f=sixteenShardFixture(),id='padding-desktop-chromium-0';
  const remove=r=>{
    let count=0;const visit=s=>{s.specs=(s.specs??[]).filter(spec=>{if(spec.id===id){count++;return false;}return true;});(s.suites??[]).forEach(visit);};
    r.suites.forEach(visit);return count;
  };
  remove(f.canonicalReports['desktop-chromium']);remove(f.inventory);
  Object.values(f.planned).forEach(remove);
  for(const r of Object.values(f.actual))if(remove(r))r.stats.expected--;
  assert.throws(()=>verifyCrossPlatformShards(f),/inventory narrowed/);
});

function touchScopeFixture(){
  const f=fixture();
  for(const row of touchScopes){
    const spec={id:'fixture-touch-'+row.projectId+'-'+row.title.split(' ').at(-1),ok:true,
      file:row.file,title:row.title,line:6,column:26,
      tests:[{projectId:row.projectId,projectName:row.projectId,expectedStatus:'passed',status:'skipped',results:[]}]};
    const suite={title:row.file,specs:[spec],suites:[]};
    f.canonicalReports[row.projectId].suites.push(clone(suite));
    f.inventory.suites.push(clone(suite));f.planned[1].suites.push(clone(suite));
  }
  f.actual[1]=executed(f.planned[1]);return f;
}
test('source-declared desktop keyboard scope is retained without hiding any ordinary test',()=>{
  const r=verifyCrossPlatformShards(touchScopeFixture());
  assert.equal(r.count,490);assert.equal(r.passed,478);assert.equal(r.skipped,12);
});
test('desktop touch scope rejects a changed annotation or an unapproved skipped case',()=>{
  const f=touchScopeFixture();
  const s=f.actual[1].suites.at(-1).specs[0];
  s.tests[0].annotations=[{type:'skip',description:'hide a failure'}];
  assert.throws(()=>verifyCrossPlatformShards(f),/invalid approved scope skip/);
  const ordinary=touchScopeFixture(),t=ordinary.actual[1].suites[0].specs.find(s=>s.title!==ALLOWED_SCOPE_SKIPS.get('desktop-chromium').title).tests[0];
  t.expectedStatus='skipped';t.status='skipped';t.results=[{status:'skipped',retry:0}];
  assert.throws(()=>verifyCrossPlatformShards(ordinary));
});

test('sixteen-shard acceptance rejects absent, extra, misbound and retried evidence',()=>{
  for(const change of [f=>delete f.actual[16],f=>f.receipts[16].shardCount=2,
    f=>f.receipts[16].source='f'.repeat(40),f=>f.planned[17]=clone(f.planned[16]),
    f=>ordinaryTest(f.actual[16]).results.push({status:'passed',retry:1}),
    f=>f.actual[16].stats.flaky=1]){
    const f=sixteenShardFixture();change(f);assert.throws(()=>verifyCrossPlatformShards(f));
  }
});

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

for (const mode of ["passed", "approved-skip"]) {
  for (const field of ["error", "errors"]) {
    test(`cross-platform rejects nested result ${field} in ${mode} cases`, () => {
      const f = fixture();
      let selected = mode === "passed" ? ordinaryTest(f.actual[1]) : undefined;
      if (!selected) visitSpecs(f.actual[1], spec => {
        if (!selected && spec.title === ALLOWED_SCOPE_SKIPS.get("desktop-chromium").title)
          selected = spec.tests[0];
      });
      assert.ok(selected);
      selected.results[0][field] = field === "error"
        ? { message: "controlled result error" } : [{ message: "controlled result error" }];
      assert.throws(() => verifyCrossPlatformShards(f), /reported a result error/);
    });
  }
}
