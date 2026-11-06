import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');

for (const script of ['test_native_stall_monitor.py', 'test_native_host_preflight.py']) {
  test('permanent native diagnostic controls: ' + script, () => {
    const result = spawnSync(python, ['-B', fileURLToPath(new URL('../scripts/qa/ios-parity/' + script, import.meta.url))], {
      cwd: repository,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
      env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: '1'}
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, script + ' was terminated');
    assert.equal(result.status, 0, script + '\n' + result.stdout + '\n' + result.stderr);
  });
}
