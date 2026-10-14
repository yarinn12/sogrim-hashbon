import { readFileSync } from "node:fs";
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
const SCOPE_SKIPS_BY_PROJECT = new Map([
  ["iphone-large-text", ALLOWED_SCOPE_SKIP_IDS],
  ["iphone-webkit", IPHONE_WEBKIT_SCOPE_SKIP_IDS]
]);

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

export function verifyIphoneShards({ project, inventory, planned, actual, receipts, source, tree, runId, runAttempt }) {
  const allowedScopeSkipIds = SCOPE_SKIPS_BY_PROJECT.get(project);
  if (!allowedScopeSkipIds) throw new Error(`Unsupported iPhone shard project: ${project}`);
  const all = index(inventory, "source inventory", project);
  const union = new Map();
  const observedSkips = new Set();
  for (const shard of [1, 2]) {
    const label = `shard ${shard}`;
    const plan = index(planned[shard], `${label} plan`, project);
    const result = index(actual[shard], `${label} result`, project);
    const receipt = receipts[shard];
    if (receipt?.project !== project || receipt?.source !== source || receipt?.tree !== tree ||
        receipt?.runId !== runId || receipt?.runAttempt !== runAttempt ||
        receipt?.shard !== shard) {
      throw new Error(`${label}: missing or incorrect source receipt`);
    }
    sameIds(result, plan, label);
    if (actual[shard].errors?.length || actual[shard].stats?.unexpected !== 0 ||
        actual[shard].stats?.flaky !== 0) {
      throw new Error(`${label}: Playwright reported errors, unexpected results or flaky tests`);
    }
    for (const [id, spec] of result) {
      const plannedSpec = plan.get(id);
      if (spec.title !== plannedSpec.title || spec.file !== plannedSpec.file) {
        throw new Error(`${label}: test metadata differs from source for ${id}`);
      }
      const plannedTest = plannedSpec.tests[0];
      const test = spec.tests[0];
      if (allowedScopeSkipIds.has(id)) {
        if (test.expectedStatus !== "skipped" || test.status !== "skipped" ||
            test.results?.length !== 1 || test.results[0].status !== "skipped" ||
            test.results[0].retry !== 0 ||
            !test.annotations?.some(item => item.type === "skip")) {
          throw new Error(`${label}: missing or invalid scope skip for ${id}`);
        }
        observedSkips.add(id);
      } else if (test.expectedStatus !== plannedTest.expectedStatus ||
                 test.status !== "expected" || test.results?.length !== 1 ||
                 test.results[0].status !== "passed" || test.results[0].retry !== 0) {
        throw new Error(`${label}: missing, failed, retried or skipped result for ${id}`);
      }
      if (union.has(id)) throw new Error(`duplicate result across shards: ${id}`);
      union.set(id, spec);
    }
  }
  sameIds(union, all, "combined shards");
  if (observedSkips.size !== allowedScopeSkipIds.size ||
      [...allowedScopeSkipIds].some(id => !observedSkips.has(id))) {
    throw new Error("Missing one or more required scope skips");
  }
  return { project, source, tree, count: all.size,
    shard1: index(actual[1], "shard 1", project).size,
    shard2: index(actual[2], "shard 2", project).size };
}

export const verifyLargeTextShards = options => verifyIphoneShards({ ...options, project: "iphone-large-text" });
export const verifyIphoneWebkitShards = options => verifyIphoneShards({ ...options, project: "iphone-webkit" });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
