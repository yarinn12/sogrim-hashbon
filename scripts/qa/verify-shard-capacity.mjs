import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Bounded from the original 30/40-minute jobs, without changing a test deadline.
export const MAX_BROWSER_SHARD_CASES = 250;
export function verifyShardCapacity(report) {
  assert.ok(Array.isArray(report?.errors) && report.errors.length === 0, 'Shard planning errors');
  assert.ok(Array.isArray(report?.suites), 'Missing planned suites');
  let count = 0;
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      assert.ok(spec.id && spec.ok === true && Array.isArray(spec.tests) && spec.tests.length > 0,
        'Missing planned test identity');
      for (const test of spec.tests) {
        assert.equal(test.status, 'skipped', 'Capacity requires unexecuted source inventory');
        assert.equal(test.expectedStatus, 'passed', 'Planning must not hide a test');
        assert.ok(Array.isArray(test.results) && test.results.length === 0, 'Planning already executed a test');
        count++;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  report.suites.forEach(visit);
  assert.ok(count > 0 && count <= MAX_BROWSER_SHARD_CASES,
    `Browser shard has ${count} cases; fixed capacity is 1..${MAX_BROWSER_SHARD_CASES}`);
  return {count, maximum:MAX_BROWSER_SHARD_CASES};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  console.log(JSON.stringify(verifyShardCapacity(JSON.parse(readFileSync(process.argv[2], 'utf8')))));
