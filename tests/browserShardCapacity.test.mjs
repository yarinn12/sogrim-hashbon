import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyShardCapacity, MAX_BROWSER_SHARD_CASES} from '../scripts/qa/verify-shard-capacity.mjs';
const report = count => ({errors:[],suites:[{specs:Array.from({length:count},(_,i)=>({
  id:'case-'+i,ok:true,tests:[{status:'skipped',expectedStatus:'passed',results:[]}]
}))}]});
test('original 1735-case hosted shard is rejected before browser execution',()=>{
  assert.throws(()=>verifyShardCapacity(report(1735)),/1735 cases/);
});
test('planned browser shard retains all cases within the fixed budget',()=>{
  assert.deepEqual(verifyShardCapacity(report(217)),{count:217,maximum:MAX_BROWSER_SHARD_CASES});
  assert.equal(verifyShardCapacity(report(MAX_BROWSER_SHARD_CASES)).count,MAX_BROWSER_SHARD_CASES);
});
test('empty, excessive, failed, executed or hidden plans are rejected',()=>{
  for (const count of [0,251]) assert.throws(()=>verifyShardCapacity(report(count)));
  for (const change of [r=>r.errors.push({message:'planner error'}),r=>r.suites[0].specs[0].ok=false,
    r=>r.suites[0].specs[0].tests[0].expectedStatus='skipped',
    r=>r.suites[0].specs[0].tests[0].results.push({status:'passed'}),
    r=>r.suites[0].specs[0].tests[0].status='expected']) {
    const r=report(1);change(r);assert.throws(()=>verifyShardCapacity(r));
  }
});
