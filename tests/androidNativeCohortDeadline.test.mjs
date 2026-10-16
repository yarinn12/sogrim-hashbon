import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {cohortFrame} from './helpers/androidHostCohort.mjs';
import {watchOwnedHost} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';
import {ownedHostStopRequest,verifyHostObservationStatus} from '../scripts/qa/android-native-isolated/diagnostic-contract.mjs';

for(const stopAt of [1200002,1200000,1200001,1199999])test('owned stop observed at '+stopAt+'ms respects the unchanged1200000ms window',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'native-cohort-deadline-'));
  t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true});});
  const frame=cohortFrame().sample,start={diagnosticsVersion:2,diagnosticsContract:'owned-transport-and-cohort-v2',diagnosticsProducer:'owned-trace-start-v2',source:'a'.repeat(40),session:'sogrim_ci_cohort_1_'+'a'.repeat(16),hostOwner:frame.owner,emulatorPid:frame.owner.pid};
  writeFileSync(join(dir,'trace-start.json'),JSON.stringify(start));let time=0,sleeps=0;
  const summary=await watchOwnedHost(dir,{sample:()=>cohortFrame().sample,clock:()=>time,sleep:async()=>{
    if(++sleeps===1)time+=600001;
    else{time=stopAt;writeFileSync(join(dir,'host-stop'),JSON.stringify(ownedHostStopRequest(start)));}
  }});
  const expired=stopAt>=1200000;
  assert.equal(summary.hostCaptureWindowComplete,!expired,'an owned stop arriving at/after expiry cannot complete the window');
  assert.equal(summary.captureComplete,!expired);assert.equal(summary.hostObservationIntegrity,true,'valid retained cohort prefix remains intact');
  assert.equal(summary.ownedStop.verified,true,'late owned acknowledgement stays retained as an actual observation');
  assert.deepEqual(JSON.parse(summary.rawStop),ownedHostStopRequest(start));assert.equal(readFileSync(join(dir,'host-stop'),'utf8'),summary.rawStop);
  assert.equal(summary.limits.durationMs,1200000);assert.equal(summary.samples,expired?2:3);assert.equal(summary.observationErrors.length,0);
  assert.deepEqual(summary.windowErrors.map(e=>e.code),expired?['DURATION_CAP']:[]);
  assert.equal(summary.errors.length,expired?1:0);assert.deepEqual(verifyHostObservationStatus(summary,start),{hostObservationIntegrity:true,hostCaptureWindowComplete:!expired});
});
