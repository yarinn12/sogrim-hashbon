import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function cases(value) {
  const result = [];
  function visit(suite, parents = []) {
    const path = [...parents, suite.title];
    for (const spec of suite.specs ?? []) for (const test of spec.tests)
      result.push({ file: spec.file, line: spec.line, column: spec.column,
        title: [...path, spec.title], project: test.projectName, timeout: test.timeout,
        expectedStatus: test.expectedStatus });
    for (const child of suite.suites ?? []) visit(child, path);
  }
  for (const suite of value.suites) visit(suite);
  return result;
}
export function verifyPlans(original, observed) {
  const baseline = cases(original), candidate = cases(observed);
  assert.ok(baseline.length >= 150 && baseline.length <= 200);
  assert.deepEqual(candidate, baseline, 'Original source, order, project, timeouts and statuses must match');
  const op = original.config.projects.find(p => p.name === 'iphone-webkit');
  const cp = observed.config.projects.find(p => p.name === 'iphone-webkit');
  assert.ok(op && cp);
  assert.equal(op.timeout, 90000); assert.equal(cp.timeout, op.timeout);
  assert.deepEqual(cp.expect, op.expect);
  assert.equal(cp.retries, 0);
  assert.equal(observed.config.workers, 1);
  assert.equal(original.config.workers, 1);
  return baseline.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [originalPath, observedPath, receiptPath] = process.argv.slice(2);
  const original = JSON.parse(readFileSync(originalPath, 'utf8'));
  const observed = JSON.parse(readFileSync(observedPath, 'utf8'));
  const count = verifyPlans(original, observed);
  const digest = p => createHash('sha256').update(readFileSync(p)).digest('hex');
  writeFileSync(receiptPath, JSON.stringify({ source: 'd7675a31fffa93699a1de65c9f786ab1ff619e30',
    originalPlanSha256: digest(originalPath), observedPlanSha256: digest(observedPath),
    cases: count, originalCohortOrderAndAssertionsUnchanged: true,
    retries: 0, nativeAcceptance: false, releaseAcceptance: false }, null, 2) + '\n');
}
