import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('./ios_auth79_ax_services_test.py',import.meta.url));
const env=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP','TMPDIR','HOME','USERPROFILE'].map(key=>[key,process.env[key]||'']));
Object.assign(env,{PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1'});
test('Auth79 original-only AX service namespace and actor identity',()=>{
  const candidates=[process.env.PYTHON_EXECUTABLE,process.env.PYTHON,'python3','python'].filter(Boolean);
  const python=candidates.find(file=>{const r=spawnSync(file,['--version'],{encoding:'utf8',windowsHide:true,env});return r.status===0&&/Python 3\./.test((r.stdout||'')+(r.stderr||''));});
  assert.ok(python,'Python 3 required for permanent Auth79 AX service controls');
  const r=spawnSync(python,['-B',script],{cwd:repository,encoding:'utf8',windowsHide:true,timeout:60_000,maxBuffer:4*1024*1024,env});
  assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
