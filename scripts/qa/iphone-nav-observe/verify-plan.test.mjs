import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPlans } from './verify-plan.mjs';
function fixture() {
  return { config: { workers: 1, projects: [{ name: 'iphone-webkit', timeout: 90000,
    retries: 0, expect: { timeout: 8000 } }] }, suites: [{ title: 'synthetic.spec.mjs',
    specs: Array.from({ length: 159 }, (_, i) => ({ file: 'synthetic.spec.mjs', line: i + 1,
      column: 1, title: 'case ' + i, tests: [{ projectName: 'iphone-webkit',
        timeout: 90000, expectedStatus: 'passed' }] })) }] };
}
test('accepts the same complete ordered original cohort', () => assert.equal(verifyPlans(fixture(), fixture()), 159));
for (const [name, mutate] of [
  ['dropped original case', x => x.suites[0].specs.pop()],
  ['changed original order', x => x.suites[0].specs.reverse()],
  ['extended timeout', x => x.config.projects[0].timeout++],
  ['weakened assertion timeout', x => x.config.projects[0].expect.timeout++],
  ['enabled retry', x => x.config.projects[0].retries++],
  ['changed worker concurrency', x => x.config.workers++]
]) test(`rejects ${name}`, () => {
  const observed = fixture(); mutate(observed);
  assert.throws(() => verifyPlans(fixture(), observed));
});
