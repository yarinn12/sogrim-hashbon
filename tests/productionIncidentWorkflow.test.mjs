import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  buildIncidentBody,
  collectFailureBoundaries
} from "../scripts/production-incident-state.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const workflow = await readFile(
  new URL("../.github/workflows/production-availability.yml", import.meta.url),
  "utf8"
);
const failureLog = "FAILED  recovery matches the release source - remote " +
  "a".repeat(64) + ", local " + "b".repeat(64);
const boundaries = collectFailureBoundaries([
  { label: "failover", outcome: "failure", log: failureLog }
]);

function incidentHarness() {
  const issue = {
    number: 6,
    title: "[Production] Availability or deployment parity failed",
    state: "open",
    body: buildIncidentBody(boundaries, new Date("2026-10-01T00:00:00Z"))
  };
  const updates = [];
  const comments = [];
  const issues = {
    listForRepo: () => {},
    async update(update) {
      assert.equal(update.issue_number, issue.number);
      updates.push(update);
      if (update.body !== undefined) issue.body = update.body;
      if (update.state !== undefined) issue.state = update.state;
    },
    async createComment(comment) {
      comments.push(comment);
    },
    async create() {
      assert.fail("an existing incident must not be recreated");
    }
  };
  return {
    issue,
    updates,
    comments,
    github: {
      rest: { issues },
      async paginate() {
        return issue.state === "open" ? [{ ...issue }] : [];
      }
    }
  };
}

function workflowScript(stepName, source = workflow) {
  const lines = source.split(/\r?\n/u);
  const start = lines.indexOf(`      - name: ${stepName}`);
  assert.notEqual(start, -1, `workflow step exists: ${stepName}`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("      - name:")) end += 1;
  const step = lines.slice(start, end);
  const scriptStart = step.indexOf("          script: |");
  assert.notEqual(scriptStart, -1, `workflow step has a script: ${stepName}`);
  return step.slice(scriptStart + 1).map((line) => line.slice(12)).join("\n");
}

async function runStep(stepName, harness, source = workflow) {
  const saved = Object.fromEntries(
    ["GITHUB_WORKSPACE", "VERIFY_OUTCOME", "PARITY_OUTCOME"].map((name) => [name, process.env[name]])
  );
  Object.assign(process.env, {
    GITHUB_WORKSPACE: root,
    VERIFY_OUTCOME: "success",
    PARITY_OUTCOME: "failure"
  });
  const workflowRequire = (name) => name === "fs" ? {
    existsSync: (file) => file === "production-failover.log",
    readFileSync: () => failureLog
  } : require(name);
  try {
    return await new AsyncFunction("require", "github", "context", "core", workflowScript(stepName, source))(
      workflowRequire,
      harness.github,
      { repo: { owner: "test-owner", repo: "test-repo" } },
      { info() {} }
    );
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

for (const lineEnding of ["LF", "CRLF"]) {
  const lfSource = workflow.replace(/\r\n/gu, "\n");
  const source = lineEnding === "CRLF" ? lfSource.replace(/\n/gu, "\r\n") : lfSource;
  const pass = (harness) => runStep("Close recovered incident issue", harness, source);
  const fail = (harness) => runStep("Open or update one incident issue", harness, source);

test(`an unchanged failure resets recovery before the next successful check (${lineEnding})`, async () => {
  const harness = incidentHarness();
  const originalBody = harness.issue.body;

  await pass(harness);
  assert.match(harness.issue.body, /recovery-streak:1/u);
  assert.equal(await fail(harness), "unchanged");
  const bodyAfterFailure = harness.issue.body;

  await pass(harness);
  assert.equal(harness.issue.state, "open", "a nonconsecutive pass must not close the incident");
  assert.equal(bodyAfterFailure, originalBody, "failure clears only the pending recovery verification");
  assert.match(harness.issue.body, /recovery-streak:1/u);
  assert.equal(harness.comments.length, 0, "failure deduplication must not add another alert");
});

test(`two consecutive successful workflow checks close the incident (${lineEnding})`, async () => {
  const harness = incidentHarness();
  await pass(harness);
  assert.equal(harness.issue.state, "open");
  await pass(harness);
  assert.equal(harness.issue.state, "closed");
  assert.equal(harness.comments.length, 1);
  assert.match(harness.comments[0].body, /^Recovered automatically at /u);
});

test(`an unchanged failure without recovery progress remains quiet (${lineEnding})`, async () => {
  const harness = incidentHarness();
  const originalBody = harness.issue.body;
  assert.equal(await fail(harness), "unchanged");
  assert.equal(harness.issue.body, originalBody);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.comments.length, 0);
});

}
