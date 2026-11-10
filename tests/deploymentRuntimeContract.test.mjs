import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the deployed server runtime and lockfile stay on the major exercised by release CI', () => {
  const workflows = ['qa.yml', 'qa-windows.yml', 'cross-engine-font-provenance-qa.yml',
    'ios-auth-return-qa.yml', 'deploy-vercel.yml'];
  const majors = workflows.flatMap(name => {
    const text = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    const versions = [...text.matchAll(/\bnode-version:\s*['"]?(\d+)(?:\.x)?['"]?\s*(?:#.*)?$/gm)]
      .map(match => match[1]);
    assert.ok(versions.length, `${name} must exercise an explicit Node major`);
    return versions;
  });
  assert.equal(new Set(majors).size, 1, 'release CI and the deployment job must use one Node major');
  const supportedRuntime = `${majors[0]}.x`;
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(manifest.engines.node, supportedRuntime,
    'an open Node range lets Vercel silently choose a newer, untested runtime');
  assert.equal(lockfile.packages[''].engines.node, supportedRuntime,
    'npm clean installs must preserve the same runtime contract');
});
