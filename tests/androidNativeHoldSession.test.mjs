import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const matrix=readFileSync(process.env.NATIVE_HOLD_SESSION_MATRIX || new URL('../scripts/qa/android-native-isolated/matrix.mjs',import.meta.url),'utf8');

test('a separate hold launch revalidates actual owned orientation before any hold',async()=>{
  const start=matrix.indexOf('      row.exceptions=page.exceptions;');
  const end=matrix.indexOf('      row.nativeHolds.push',start);
  assert.ok(start>=0 && end>start);
  const calls=[], receipt={verified:true}, next={exceptions:[]}, old={exceptions:['cold-evidence'],close(){calls.push('close');}};
  const context={page:old,row:{},orientation:'landscape',rotation:1,waitFor(){},adb(){},measuringHold:false,
    launch(){throw Error('Unverified direct launch cannot establish a landscape hold session');},
    async launchForOwnedOrientation(options){
      assert.equal(options.orientation,'landscape');assert.equal(options.rotation,1);assert.equal(options.timeout,15000);
      assert.equal(options.launch,context.launch);assert.equal(options.waitFor,context.waitFor);assert.equal(options.adb,context.adb);
      calls.push('verified-launch');options.onPage(next);return{page:next,receipt};
    },
  };
  await vm.runInNewContext(`(async()=>{${matrix.slice(start,end)}})()`,context);
  assert.deepEqual(calls,['close','verified-launch']);assert.equal(context.page,next);
  assert.equal(context.row.holdRotationReceipt,receipt);assert.equal(context.row.exceptions,old.exceptions);
});

const failureBody=matrix.match(/\}catch\(error\)\{([\s\S]*?)\}\s*\n\s*finally\{/)[1];
async function captureFailure(measuringHold){
  const coldState={screen:'settlement',firstColdTap:'retained'},coldRotation={cold:true},coldExceptions=['cold-evidence'];
  const failureState={screen:'home',hold:'failed'},failureRotation={failedSession:true},failureExceptions=['second-session-error'];
  const error=Object.assign(new Error('measured session failed'),{rotationReceipt:failureRotation});
  const row={state:coldState,rotationReceipt:coldRotation,exceptions:coldExceptions};
  const context={row,error,measuringHold,inspectExpression:'only-synthetic-state',page:{exceptions:failureExceptions,evaluate:async()=>failureState}};
  await vm.runInNewContext(`(async()=>{${failureBody}})()`,context);
  return{row,coldState,coldRotation,coldExceptions,failureState,failureRotation,failureExceptions};
}

test('a failed hold retains cold tap state, orientation and exceptions as separate evidence',async()=>{
  const p=await captureFailure(true);
  assert.equal(p.row.state,p.coldState);assert.equal(p.row.rotationReceipt,p.coldRotation);assert.equal(p.row.exceptions,p.coldExceptions);
  assert.equal(p.row.holdState,p.failureState);assert.equal(p.row.holdRotationReceipt,p.failureRotation);assert.equal(p.row.holdExceptions,p.failureExceptions);
  assert.match(p.row.error,/measured session failed/);
});

test('a failed original cold session still records its own state and orientation failure',async()=>{
  const p=await captureFailure(false);
  assert.equal(p.row.state,p.failureState);assert.equal(p.row.rotationReceipt,p.failureRotation);
  assert.equal(p.row.holdState,undefined);assert.match(p.row.error,/measured session failed/);
});
