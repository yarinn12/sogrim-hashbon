import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Complete QA465/QA467 source inventory. New tests can increase these counts;
// narrowing a project's collection requires an explicit policy update.
export const MINIMUM_PROJECT_CASES = new Map([
  ["desktop-chromium", 112], ["desktop-firefox", 123],
  ["desktop-webkit", 112], ["compact-firefox", 126],
  ["cross-engine-comparison", 9]
]);

// Four exact runtime skips from QA465 artifact 11967743798. A grouped JSON
// spec.id is the ID of its first project, so each project's ID is distinct.
export const ALLOWED_SCOPE_SKIPS = new Map([
  ["desktop-chromium", "06542729a15bf49d6364-986e29ca6f4be1216020"],
  ["desktop-firefox", "06542729a15bf49d6364-d7d7942d60c9f200e4c7"],
  ["desktop-webkit", "06542729a15bf49d6364-dab38be1b99e3de8e141"],
  ["compact-firefox", "06542729a15bf49d6364-1b8fd69c83adf4e788a6"]
].map(([projectId, id]) => [projectId, {
  id, projectId, file: "e2e/account-auth-feedback.spec.mjs",
  title: "touching the login fields focuses them on iPad and opens the software-input path",
  annotation: "the software-input path only exists in touch contexts"
}]));

const identityKey = ({ projectId, file, suitePath, title, line, column }) =>
  JSON.stringify([projectId, file, ...suitePath, title, line, column]);

export function indexCrossPlatformReport(report, label,
  { planned = false, canonical, singleProject } = {}) {
  const ids = report?.config?.projects?.map(project => project.id);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some(id => !MINIMUM_PROJECT_CASES.has(id)) ||
      (singleProject ? !ids.includes(singleProject) : ids.length !== MINIMUM_PROJECT_CASES.size)) {
    throw new Error(`${label}: wrong cross-platform project configuration`);
  }
  if (!Array.isArray(report.suites) || !Array.isArray(report.errors) || report.errors.length) {
    throw new Error(`${label}: missing suites or Playwright errors`);
  }
  const entries = new Map();
  function visit(suite, parents = []) {
    const suitePath = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      if (spec.ok !== true || !spec.id || !spec.file || !spec.title || !Number.isSafeInteger(spec.line) ||
          !Number.isSafeInteger(spec.column) || !Array.isArray(spec.tests) || !spec.tests.length) {
        throw new Error(`${label}: incomplete test identity`);
      }
      for (const test of spec.tests) {
        const projectId = test.projectId;
        if (!MINIMUM_PROJECT_CASES.has(projectId) || test.projectName !== projectId ||
            (singleProject && projectId !== singleProject)) {
          throw new Error(`${label}: wrong project for ${spec.id}`);
        }
        const entry = { id: spec.id, projectId, file: spec.file, suitePath,
          title: spec.title, line: spec.line, column: spec.column, test };
        const key = identityKey(entry);
        if (entries.has(key)) throw new Error(`${label}: duplicate case ${key}`);
        if (planned && (test.expectedStatus !== "passed" || test.status !== "skipped" ||
            test.results?.length !== 0)) {
          throw new Error(`${label}: changed or executed planning result for ${key}`);
        }
        if (canonical) {
          const sourceCase = canonical.get(key);
          if (!sourceCase) throw new Error(`${label}: case absent from canonical project inventory: ${key}`);
          // Playwright's grouped spec ID comes from its first included project.
          if (test === spec.tests[0] && spec.id !== sourceCase.id) {
            throw new Error(`${label}: grouped ID differs from its first project: ${key}`);
          }
          entry.canonicalId = sourceCase.id;
        } else if (singleProject) {
          entry.canonicalId = spec.id;
        }
        entries.set(key, entry);
      }
    }
    for (const child of suite.suites ?? []) visit(child, suitePath);
  }
  for (const suite of report.suites) visit(suite);
  if (!entries.size) throw new Error(`${label}: empty test inventory`);
  return entries;
}

function sameKeys(actual, expected, label) {
  const missing = [...expected.keys()].filter(key => !actual.has(key));
  const extra = [...actual.keys()].filter(key => !expected.has(key));
  if (missing.length || extra.length) {
    throw new Error(`${label}: ${missing.length} missing and ${extra.length} extra cases`);
  }
}

export function verifyCrossPlatformShards({ canonicalReports, inventory, planned, actual,
  receipts, source, tree, runId, runAttempt }) {
  if (!/^[a-f0-9]{40}$/.test(source ?? "") || !/^[a-f0-9]{40}$/.test(tree ?? "") ||
      !runId || !runAttempt) throw new Error("Missing exact source/run identity");
  const canonical = new Map(), counts = {};
  for (const [projectId, minimum] of MINIMUM_PROJECT_CASES) {
    const cases = indexCrossPlatformReport(canonicalReports?.[projectId],
      `${projectId} canonical inventory`, { planned: true, singleProject: projectId });
    if (cases.size < minimum) {
      throw new Error(`Canonical inventory narrowed ${projectId}: ${cases.size} < ${minimum}`);
    }
    counts[projectId] = cases.size;
    for (const [key, item] of cases) {
      if (canonical.has(key)) throw new Error(`Duplicate canonical case ${key}`);
      canonical.set(key, item);
    }
  }
  const all = indexCrossPlatformReport(inventory, "source inventory", { planned: true, canonical });
  sameKeys(all, canonical, "source versus canonical inventories");
  for (const [projectId, approved] of ALLOWED_SCOPE_SKIPS) {
    const found = [...canonical.values()].filter(item => item.projectId === projectId &&
      item.canonicalId === approved.id && item.file === approved.file && item.title === approved.title);
    if (found.length !== 1) throw new Error(`Missing or changed approved scope skip: ${projectId}`);
  }

  const plannedUnion = new Map(), actualUnion = new Map(), observedSkips = new Set();
  const shardCounts = {};
  for (const shard of [1, 2]) {
    const label = `shard ${shard}`, receipt = receipts?.[shard];
    if (receipt?.lane !== "cross-platform" || receipt.shard !== shard ||
        receipt.source !== source || receipt.tree !== tree ||
        receipt.runId !== runId || receipt.runAttempt !== runAttempt) {
      throw new Error(`${label}: missing or incorrect source receipt`);
    }
    const plan = indexCrossPlatformReport(planned?.[shard], `${label} plan`,
      { planned: true, canonical });
    const result = indexCrossPlatformReport(actual?.[shard], `${label} result`,
      { canonical });
    sameKeys(result, plan, label);
    if (actual[shard].stats?.unexpected !== 0 || actual[shard].stats?.flaky !== 0) {
      throw new Error(`${label}: Playwright reported unexpected or flaky cases`);
    }
    let passed = 0, skipped = 0;
    for (const [key, item] of result) {
      const test = item.test, run = test.results,
        approved = ALLOWED_SCOPE_SKIPS.get(item.projectId),
        isApprovedSkip = approved?.id === item.canonicalId &&
          approved.file === item.file && approved.title === item.title;
      if (isApprovedSkip) {
        if (test.expectedStatus !== "skipped" || test.status !== "skipped" ||
            run?.length !== 1 || run[0].status !== "skipped" || run[0].retry !== 0 ||
            !test.annotations?.some(annotation => annotation.type === "skip" &&
              annotation.description === approved.annotation)) {
          throw new Error(`${label}: invalid approved scope skip for ${key}`);
        }
        observedSkips.add(item.projectId); skipped++;
      } else {
        if (test.expectedStatus !== "passed" || test.status !== "expected" ||
            run?.length !== 1 || run[0].status !== "passed" || run[0].retry !== 0 ||
            test.annotations?.some(annotation => annotation.type === "skip")) {
          throw new Error(`${label}: missing, failed, retried or skipped result for ${key}`);
        }
        passed++;
      }
      if (actualUnion.has(key)) throw new Error(`Duplicate result across shards: ${key}`);
      actualUnion.set(key, item);
    }
    if (actual[shard].stats?.expected !== passed || actual[shard].stats?.skipped !== skipped) {
      throw new Error(`${label}: report totals do not match individual results`);
    }
    for (const [key, item] of plan) {
      if (plannedUnion.has(key)) throw new Error(`Duplicate planned case across shards: ${key}`);
      plannedUnion.set(key, item);
    }
    shardCounts[shard] = result.size;
  }
  sameKeys(plannedUnion, all, "combined plans");
  sameKeys(actualUnion, all, "combined results");
  if (observedSkips.size !== ALLOWED_SCOPE_SKIPS.size ||
      [...ALLOWED_SCOPE_SKIPS.keys()].some(id => !observedSkips.has(id))) {
    throw new Error("Missing one or more approved scope skips");
  }
  return { source, tree, count: all.size, projects: counts,
    shard1: shardCounts[1], shard2: shardCounts[2],
    passed: all.size - observedSkips.size, skipped: observedSkips.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inventory, plan1, plan2, actual1, actual2, receipt1, receipt2,
    ...projectPaths] = process.argv.slice(2);
  if ([inventory, plan1, plan2, actual1, actual2, receipt1, receipt2].some(path => !path) ||
      projectPaths.length !== MINIMUM_PROJECT_CASES.size) {
    throw new Error("Expected source, two plans, two results, two receipts and five project inventories");
  }
  const read = path => JSON.parse(readFileSync(path, "utf8"));
  console.log(JSON.stringify(verifyCrossPlatformShards({
    canonicalReports: Object.fromEntries([...MINIMUM_PROJECT_CASES.keys()]
      .map((id, index) => [id, read(projectPaths[index])])),
    inventory: read(inventory), planned: { 1: read(plan1), 2: read(plan2) },
    actual: { 1: read(actual1), 2: read(actual2) },
    receipts: { 1: read(receipt1), 2: read(receipt2) },
    source: process.env.EXPECTED_SOURCE,
    tree: process.env.EXPECTED_TREE,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT
  })));
}
