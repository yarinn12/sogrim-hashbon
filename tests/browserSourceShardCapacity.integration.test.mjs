import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {verifyShardCapacity} from '../scripts/qa/verify-shard-capacity.mjs';
import {indexCrossPlatformReport} from '../scripts/qa/verify-cross-platform-shards.mjs';

const cli=resolve('node_modules/@playwright/test/cli.js');
function plan(shard){
  const args=[cli,'test','--config=playwright.cross-platform.config.mjs','--list','--reporter=json'];
  if(shard)args.push(`--shard=${shard}/16`);
  return JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8',windowsHide:true,
    timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,CI:'1',NO_COLOR:'1',FORCE_COLOR:'0'}}));
}
function identities(report){
  // Grouped JSON spec.id belongs to its first included project, so compare the
  // same semantic identities used by the strict existing aggregate verifier.
  return [...indexCrossPlatformReport(report,'source capacity regression',{planned:true}).keys()];
}
test('actual cross-platform source keeps reported shard nine within its fixed budget', {timeout:120000},()=>{
  const complete=identities(plan());
  assert.ok(complete.length>0);assert.equal(new Set(complete).size,complete.length);
  // Reproduce the original 251-case shard locally. The existing CI aggregate
  // separately inventories all sixteen shards and rejects missing/duplicate IDs.
  const report=plan(9),capacity=verifyShardCapacity(report),ids=identities(report);
  assert.equal(capacity.count,ids.length);
  assert.equal(new Set(ids).size,ids.length,'A case cannot be repeated inside the shard');
  const sourceIds=new Set(complete);
  assert.ok(ids.every(id=>sourceIds.has(id)),'The shard must retain actual source identities');
});
