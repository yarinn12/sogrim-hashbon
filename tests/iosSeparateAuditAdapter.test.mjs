import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('independent post-intake audit adapter preserves original evidence and owner-only scope', () => {
  const python = process.env.SOGRIM_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/qa/ios-signing',
    '-p', 'test_owner_separate_audit_adapter.py'], {encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  assert.match(result.stderr, /\bOK\b/);
});
