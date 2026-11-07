import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Scope guards in the app test files. Test IDs include the Playwright project.
// Large Text skips three native iOS provider cases and four iPad-only layouts.
export const ALLOWED_SCOPE_SKIP_IDS = new Set([
  "a8206df1cbecf2fd7bd3-394b526612aa5e412f97",
  "a8206df1cbecf2fd7bd3-4a2af2a4f6e80d4ae736",
  "a8206df1cbecf2fd7bd3-d8ba0ff1e3c293e2222f",
  "d2bcf4eb79ae557ae9c9-17a276a34853b8430759",
  "d2bcf4eb79ae557ae9c9-e2b4088520ce040259c9",
  "d2bcf4eb79ae557ae9c9-690c1d2c7a8a5c3b72b1",
  "d2bcf4eb79ae557ae9c9-ac8ba7f8ab06590ab03f"
]);
export const IPHONE_WEBKIT_SCOPE_SKIP_IDS = new Set([
  "d2bcf4eb79ae557ae9c9-dec2ef63e2a6411019f5",
  "d2bcf4eb79ae557ae9c9-3a6624728fb667d8e6f3",
  "d2bcf4eb79ae557ae9c9-83d866818fa36cd6c0ee",
  "d2bcf4eb79ae557ae9c9-7dad0308516bf37c9fee"
]);
const mobileScopes=JSON.parse(readFileSync(new URL("./mobile-scope-skips.json",import.meta.url),"utf8"));
export const SCOPE_SKIPS_BY_PROJECT = new Map([
  ...Object.entries(mobileScopes.projects).map(([project,rows])=>[project,new Set(rows.map(row=>row.id))]),
  ["iphone-large-text", ALLOWED_SCOPE_SKIP_IDS],
  ["iphone-webkit", IPHONE_WEBKIT_SCOPE_SKIP_IDS]
]);
export const MINIMUM_MOBILE_PROJECT_CASES=new Map([...SCOPE_SKIPS_BY_PROJECT.keys()].map(project=>[project,1203]));

function specs(report, project) {
  const found = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      if (!spec.id || spec.tests?.length !== 1 || spec.tests[0].projectName !== project) {
        throw new Error(`Invalid ${project} test identity`);
      }
      found.push(spec);
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites ?? []) visit(suite);
  return found;
}

function index(report, label, project) {
  if(!Array.isArray(report?.errors)||report.errors.length)
    throw new Error(`${label}: report errors or incomplete metadata`);
  const byId = new Map();
  for (const spec of specs(report, project)) {
    if (byId.has(spec.id)) throw new Error(`${label}: duplicate test ${spec.id}`);
    byId.set(spec.id, spec);
  }
  if (!byId.size) throw new Error(`${label}: empty test inventory`);
  return byId;
}

function sameIds(actual, expected, label) {
  const missing = [...expected.keys()].filter(id => !actual.has(id));
  const extra = [...actual.keys()].filter(id => !expected.has(id));
  if (missing.length || extra.length) {
    throw new Error(`${label}: ${missing.length} missing and ${extra.length} extra tests`);
  }
}

export function verifyIphoneShards({ project, inventory, planned, actual, receipts, source, tree, runId, runAttempt, shardCount=2 }) {
  if (!/^[a-f0-9]{40}$/.test(source??'') || !/^[a-f0-9]{40}$/.test(tree??'') || !runId || !runAttempt)
    throw new Error('Missing exact mobile source/run identity');
  const allowedScopeSkipIds = SCOPE_SKIPS_BY_PROJECT.get(project);
  if (!allowedScopeSkipIds) throw new Error(`Unsupported iPhone shard project: ${project}`);
  if (![2,8].includes(shardCount)) throw new Error("Invalid fixed mobile shard count");
  const shardIds=Array.from({length:shardCount},(_,i)=>i+1);
  for(const [label,rows] of Object.entries({planned,actual,receipts}))
    if(JSON.stringify(Object.keys(rows??{}).sort((a,b)=>Number(a)-Number(b)))!==JSON.stringify(shardIds.map(String)))
      throw new Error(`${label}: missing or extra shard`);
  const all = index(inventory, "source inventory", project);
  if(shardCount===8 && all.size<MINIMUM_MOBILE_PROJECT_CASES.get(project))
    throw new Error(`source inventory narrowed ${project}: ${all.size} < ${MINIMUM_MOBILE_PROJECT_CASES.get(project)}`);
  for(const scope of mobileScopes.projects[project]??[]){
    const original=all.get(scope.id);
    if(!original || original.file!==scope.file || original.title!==scope.title)
      throw new Error('Missing or changed source-declared mobile scope case: '+scope.id);
  }
  const union = new Map();
  const observedSkips = new Set();
  for (const shard of shardIds) {
    const label = `shard ${shard}`;
    const plan = index(planned[shard], `${label} plan`, project);
    const result = index(actual[shard], `${label} result`, project);
    const receipt = receipts[shard];
    if (receipt?.project !== project || receipt?.source !== source || receipt?.tree !== tree ||
        receipt?.runId !== runId || receipt?.runAttempt !== runAttempt ||
        receipt?.shard !== shard || receipt?.shardCount !== shardCount) {
      throw new Error(`${label}: missing or incorrect source receipt`);
    }
    sameIds(result, plan, label);
    if (actual[shard].errors?.length || actual[shard].stats?.unexpected !== 0 ||
        actual[shard].stats?.flaky !== 0) {
      throw new Error(`${label}: Playwright reported errors, unexpected results or flaky tests`);
    }
    let passed=0,skipped=0;
    for (const [id, spec] of result) {
      const plannedSpec = plan.get(id);
      if (spec.title !== plannedSpec.title || spec.file !== plannedSpec.file) {
        throw new Error(`${label}: test metadata differs from source for ${id}`);
      }
      const plannedTest = plannedSpec.tests[0];
      const test = spec.tests[0];
      if(test.results?.some(result=>result.error!=null ||
        result.errors!==undefined && (!Array.isArray(result.errors)||result.errors.length)))
        throw new Error(`${label}: reported a nested result error for ${id}`);
      if (allowedScopeSkipIds.has(id)) {
        if (test.expectedStatus !== "skipped" || test.status !== "skipped" ||
            test.results?.length !== 1 || test.results[0].status !== "skipped" ||
            test.results[0].retry !== 0 ||
            !test.annotations?.some(item => item.type === "skip")) {
          throw new Error(`${label}: missing or invalid scope skip for ${id}`);
        }
        observedSkips.add(id);skipped++;
      } else if (test.expectedStatus !== plannedTest.expectedStatus ||
                 test.status !== "expected" || test.results?.length !== 1 ||
                 test.results[0].status !== "passed" || test.results[0].retry !== 0) {
        throw new Error(`${label}: missing, failed, retried or skipped result for ${id}`);
      } else passed++;
      if (union.has(id)) throw new Error(`duplicate result across shards: ${id}`);
      union.set(id, spec);
    }
    if(actual[shard].stats.expected!==passed || actual[shard].stats.skipped!==skipped)
      throw new Error(`${label}: report totals differ from individual cases`);
  }
  sameIds(union, all, "combined shards");
  if (observedSkips.size !== allowedScopeSkipIds.size ||
      [...allowedScopeSkipIds].some(id => !observedSkips.has(id))) {
    throw new Error("Missing one or more required scope skips");
  }
  return { project, source, tree, count: all.size,
    shard1: index(actual[1], "shard 1", project).size,
    shard2: index(actual[2], "shard 2", project).size, shardCount,
    shards:Object.fromEntries(shardIds.map(id=>[id,index(actual[id],`shard ${id}`,project).size])) };
}

export const verifyMobileShards = verifyIphoneShards;

export const verifyLargeTextShards = options => verifyIphoneShards({ ...options, project: "iphone-large-text" });
export const verifyIphoneWebkitShards = options => verifyIphoneShards({ ...options, project: "iphone-webkit" });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--shard-count") {
    const [,countArg,inventoryDir,resultsDir]=process.argv.slice(2);
    const shardCount=Number(countArg),project=process.env.EXPECTED_PROJECT;
    if(shardCount!==8 || !inventoryDir || !resultsDir || !SCOPE_SKIPS_BY_PROJECT.has(project))
      throw new Error("Expected eight complete mobile shards and explicit project");
    const read=path=>JSON.parse(readFileSync(path,"utf8"));
    const ids=Array.from({length:shardCount},(_,i)=>i+1);
    const rows=pathFor=>Object.fromEntries(ids.map(id=>[id,read(pathFor(id))]));
    const directory=project==='iphone-webkit'?'qa-iphone-webkit-shard':project==='iphone-large-text'?'qa-large-text-shard':'qa-mobile-shard';
    console.log(JSON.stringify(verifyMobileShards({project,shardCount,
      inventory:read(join(inventoryDir,'all.json')),
      planned:rows(id=>join(inventoryDir,`${id}-${shardCount}.json`)),
      actual:rows(id=>join(resultsDir,`playwright-report-${project}-shard-${id}`,directory,'results.json')),
      receipts:rows(id=>join(resultsDir,`playwright-report-${project}-shard-${id}`,directory,'receipt.json')),
      source:process.env.EXPECTED_SOURCE,tree:process.env.EXPECTED_TREE,
      runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT
    })));
  } else {
  const [inventory, plan1, plan2, actual1, actual2, receipt1, receipt2] = process.argv.slice(2);
  const read = path => JSON.parse(readFileSync(path, "utf8"));
  const result = verifyIphoneShards({
    project: process.env.EXPECTED_PROJECT ?? "iphone-large-text",
    inventory: read(inventory),
    planned: { 1: read(plan1), 2: read(plan2) },
    actual: { 1: read(actual1), 2: read(actual2) },
    receipts: { 1: read(receipt1), 2: read(receipt2) },
    source: process.env.EXPECTED_SOURCE,
    tree: process.env.EXPECTED_TREE,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT
  });
  console.log(JSON.stringify(result));
}
}
