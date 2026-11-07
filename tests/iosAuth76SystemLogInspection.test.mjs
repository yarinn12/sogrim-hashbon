import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('./ios_auth76_system_log_inspection_test.py', import.meta.url));
const env = {
  PATH: process.env.PATH || '',
  SystemRoot: process.env.SystemRoot || '',
  TEMP: process.env.TEMP || '',
  TMP: process.env.TMP || '',
  TMPDIR: process.env.TMPDIR || '',
  HOME: process.env.HOME || '',
  USERPROFILE: process.env.USERPROFILE || '',
  PYTHONUTF8: '1',
  PYTHONDONTWRITEBYTECODE: '1',
  SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD: '1',
};
const candidates = [process.env.PYTHON_EXECUTABLE, process.env.PYTHON, 'python3', 'python'].filter(Boolean);

test('Auth76 original system log archive and command controls', () => {
  const python = candidates.find(file => {
    const result = spawnSync(file, ['--version'], {encoding: 'utf8', windowsHide: true, env});
    return result.status === 0 && /Python 3\./.test((result.stdout || '') + (result.stderr || ''));
  });
  assert.ok(python, 'Python 3 required for permanent Auth76 system log controls');
  const result = spawnSync(python, ['-B', script], {
    cwd: repository,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'Auth76 system log controls were terminated');
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
});