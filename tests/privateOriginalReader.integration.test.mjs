import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
test('private original-result extraction and packaging preserve bytes and reject unsafe archives',()=>{
 const py=process.env.PYTHON_EXECUTABLE||'python',result=spawnSync(py,['-B','scripts/qa/ios-parity/test_private_original_reader.py'],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Ran 12 tests/);assert.match(result.stderr,/\bOK\s*$/);
});
