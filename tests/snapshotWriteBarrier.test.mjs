import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotWriteBarrier} from '../e2e/helpers/snapshotWriteBarrier.mjs';
const origin='https://fixture.invalid',workspaceId='private-space';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(){let handler;const page={async route(_pattern,fn){handler=fn;}};
  const barrier=await snapshotWriteBarrier(page,{origin,workspaceId,accepts:p=>p.selected===true});
  return {barrier,send({method='PATCH',space=workspaceId,urlOrigin=origin,payload={selected:true},jsonError}={}){
    let passed=0;const route={request:()=>({method:()=>method,url:()=>`${urlOrigin}/rest/v1/app_snapshots?id=eq.${space}&updated_at=eq.old`,postDataJSON:()=>{if(jsonError)throw jsonError;return payload;}}),async fallback(){passed++;}};
    return {promise:handler(route),passed:()=>passed};
  }};
}
test('a formed conditional write remains pending while its peer can commit a newer version',async()=>{
  const h=await harness();const request=h.send();const observed=await h.barrier.observed;
  let released=false;h.barrier.released.then(()=>{released=true;});
  assert.equal(observed.expectedVersion,'eq.old');await tick();assert.equal(request.passed(),0);assert.equal(released,false);
  h.barrier.release();await h.barrier.released;await request.promise;assert.equal(request.passed(),1);assert.equal(released,true);
  const retry=h.send();await retry.promise;assert.equal(retry.passed(),1,'The retry must reach the unchanged CAS fixture');
});
test('the write barrier never holds reads, another workspace, another origin or an unrelated payload',async()=>{
  for(const options of [{method:'GET'},{space:'foreign'},{urlOrigin:'https://foreign.invalid'},{payload:{selected:false}}]){
    const h=await harness();const request=h.send(options);await request.promise;assert.equal(request.passed(),1);h.barrier.release();
  }
});
test('a malformed selected write remains a visible fixture error',async()=>{
  const h=await harness(),error=new Error('synthetic invalid write JSON');const request=h.send({jsonError:error});
  await assert.rejects(request.promise,e=>e===error);assert.equal(request.passed(),0);h.barrier.release();
});
