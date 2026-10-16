import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('private intake rejects changed signing origin, unbound pins and unsafe distribution in the normal suite',()=>{
 const entry=fileURLToPath(new URL('../scripts/qa/ios-signing/intake-guards.test.mjs',import.meta.url));
 const result=spawnSync(process.execPath,['--test',entry],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
