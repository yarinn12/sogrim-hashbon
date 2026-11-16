import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
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
  const context={row,error,measuringHold,holdPhase:'foreground-orientation',scale:2,orientation:'landscape',out:'synthetic-output',resolve,provenance:{sourceCommit:'a'.repeat(40)},process:{env:{}},captureHoldFailure:()=>({diagnosticOnly:true}),inspectExpression:'only-synthetic-state',page:{exceptions:failureExceptions,evaluate:async()=>failureState}};
  await vm.runInNewContext(`(async()=>{${failureBody}})()`,context);
  return{row,coldState,coldRotation,coldExceptions,failureState,failureRotation,failureExceptions};
}

test('a failed hold retains cold tap state, orientation and exceptions as separate evidence',async()=>{
  const p=await captureFailure(true);
  assert.equal(p.row.state,p.coldState);assert.equal(p.row.rotationReceipt,p.coldRotation);assert.equal(p.row.exceptions,p.coldExceptions);
  assert.equal(p.row.holdState,p.failureState);assert.equal(p.row.holdRotationReceipt,p.failureRotation);assert.equal(p.row.holdExceptions,p.failureExceptions);
  assert.match(p.row.error,/measured session failed/);
});

const recordedHoldFailure=JSON.parse(readFileSync(new URL('./fixtures/android-native-hold-failure-qa462.json',import.meta.url),'utf8'));
async function replayRecordedFailure({captureThrows=false,measuringHold=true}={}){
  const calls=[],row={state:{cold:'retained'},checks:Array.from({length:33},()=>({ok:true}))};
  const error=Object.assign(new Error('Actual owned QA Activity foreground before rotation timed out'),{stack:recordedHoldFailure.error,rotationReceipt:{observations:[{atUtc:recordedHoldFailure.lastObservationAtUtc,focus:recordedHoldFailure.focus}]}});
  const context={row,error,measuringHold,holdPhase:'foreground-orientation',scale:2,orientation:'landscape',out:'synthetic-output',resolve,provenance:{sourceCommit:recordedHoldFailure.source},process:{env:{}},inspectExpression:'synthetic',
    captureHoldFailure(options){calls.push('capture');assert.equal(options.error,error);assert.equal(options.phase,'foreground-orientation');assert.equal(options.source,recordedHoldFailure.source);if(captureThrows)throw new Error('diagnostic storage unavailable');return {diagnosticOnly:true,screenshot:'failure.png',focus:recordedHoldFailure.focus};},
    page:{exceptions:[],async evaluate(){calls.push('evaluate');return {screen:'home'};},close(){calls.push('close');}}};
  await vm.runInNewContext(`(async()=>{${failureBody}})()`,context);context.page.close();return {row,calls,error};
}

test('failure evidence: recorded hold ANR captures evidence once before inspection and cleanup',async()=>{
  const p=await replayRecordedFailure();assert.equal(p.row.holdFailureEvidence?.screenshot,'failure.png','failed hold has no retained screenshot receipt');
  assert.deepEqual(p.calls,['capture','evaluate','close']);assert.equal(p.row.error,p.error.stack);assert.equal(p.row.state.cold,'retained');
});

test('failure evidence: diagnostic failure leaves the exact original ANR error and failed outcome intact',async()=>{
  const p=await replayRecordedFailure({captureThrows:true});assert.equal(p.calls.filter(c=>c==='capture').length,1,'failed hold did not attempt failure evidence');
  assert.equal(p.row.error,p.error.stack);assert.match(p.row.holdFailureEvidence.unavailable,/diagnostic storage unavailable/);
  assert.equal(p.row.checks.length,33);assert.equal(typeof p.row.error,'string');
});

test('original cold failure does not invoke hold-only evidence collection',async()=>{
  const p=await replayRecordedFailure({measuringHold:false});assert.deepEqual(p.calls,['evaluate','close']);assert.equal(p.row.error,p.error.stack);
});

test('a failed original cold session still records its own state and orientation failure',async()=>{
  const p=await captureFailure(false);
  assert.equal(p.row.state,p.failureState);assert.equal(p.row.rotationReceipt,p.failureRotation);
  assert.equal(p.row.holdState,undefined);assert.match(p.row.error,/measured session failed/);
});
