import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync,truncateSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {cohortFrame,cohortSummary,ownerTid,workerTid,lateTid} from './helpers/androidHostCohort.mjs';
import {recordHostInventory,requireHostInventoryCoverage,watchOwnedHost,appendHostInventory} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';
import {ownedHostStopRequest,verifyHostObservationStatus} from '../scripts/qa/android-native-isolated/diagnostic-contract.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'native-cohort-window-'));
  t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true});});
  const frame=cohortFrame().sample;
  const start={diagnosticsVersion:2,diagnosticsContract:'owned-transport-and-cohort-v2',diagnosticsProducer:'owned-trace-start-v2',source:'a'.repeat(40),session:'sogrim_ci_cohort_1_'+'a'.repeat(16),hostOwner:frame.owner,emulatorPid:ownerTid};
  writeFileSync(join(dir,'trace-start.json'),JSON.stringify(start));
  const stop=change=>writeFileSync(join(dir,'host-stop'),JSON.stringify({...ownedHostStopRequest(start),...change}));
  return {dir,start,stop,frame};
}
const lateInventories=[[ownerTid,workerTid],[ownerTid,workerTid],[ownerTid,workerTid,lateTid],[ownerTid,workerTid,lateTid]];

test('fixed cohort stays the union even when a required counter read fails',()=>{
  const {sample}=cohortFrame({counterError:{tid:workerTid,code:'EACCES'}});
  assert.deepEqual(sample.inventory.cohort,[ownerTid,workerTid]);assert.equal(sample.inventory.coverageComplete,false);
  const forged=structuredClone(sample);forged.inventory.cohort=[ownerTid];forged.inventory.coverageComplete=true;forged.coverage.unresolvedGaps=[];
  assert.throws(()=>recordHostInventory(cohortSummary(sample.owner),forged),/incomplete/);
});
test('outside-cohort observations have no counter or closing pass, even when present at afterFinal',()=>{
  const f=cohortFrame({inventories:lateInventories});assert.equal(f.sample.inventory.coverageComplete,true);
  assert.deepEqual(f.sample.coverage.observedOutsideCohort,[lateTid]);assert.ok(!f.reads.some(path=>path.startsWith(join(f.taskRoot,String(lateTid)))));
  assert.equal(f.sample.finalIdentityReadCount,2);assert.equal(f.sample.threadsScanned,2);
  assert.deepEqual(f.sample.lifecycle,[{tid:lateTid,kind:'observed-outside-cohort',phase:'final',startTicks:null,identity:null,counters:null}]);
});
test('outside-cohort data cannot fabricate identity, counters, membership or worker credit',()=>{
  const original=cohortFrame({inventories:lateInventories}).sample;
  const actualLate=cohortFrame({inventories:Array(4).fill([ownerTid,workerTid,lateTid])}).sample;
  for(const mutate of [s=>s.threads.push(actualLate.threads.find(r=>r.pid===lateTid)),s=>s.finalIdentities.push(actualLate.finalIdentities.find(r=>r.pid===lateTid)),s=>s.identitiesAfterCounters.push(actualLate.identitiesAfterCounters.find(r=>r.tid===lateTid)),s=>{s.inventory.cohort.push(lateTid);},s=>{s.inventory.cohort.pop();},s=>{s.coverage.survivorsVerified.push(lateTid);},s=>{s.coverage.observedOutsideCohort=[];},s=>{s.lifecycle[0].identity={pid:lateTid,startTicks:'12347'};}]){
    const sample=structuredClone(original);mutate(sample);assert.throws(()=>recordHostInventory(cohortSummary(sample.owner),sample),/incomplete/);
  }
});
test('a late TID is measured only in a future frame whose cohort actually contains it',()=>{
  const first=cohortFrame({inventories:lateInventories}),second=cohortFrame({inventories:Array(4).fill([ownerTid,workerTid,lateTid])}),summary=cohortSummary(first.sample.owner),prior=new Map();
  recordHostInventory(summary,first.sample,prior);assert.ok(![...prior.keys()].some(key=>key.includes(':'+lateTid+':')));
  recordHostInventory(summary,second.sample,prior);assert.ok([...prior.keys()].some(key=>key.includes(':'+lateTid+':')));
  assert.equal(requireHostInventoryCoverage(summary),true);assert.equal(summary.observedOutsideCohort,1);assert.equal(summary.cohortTasksTargeted,5);assert.equal(summary.nonMainSurvivorsVerified,3);
  assert.ok(second.reads.some(path=>path===join(second.taskRoot,String(lateTid),'schedstat')));
});
for(const mutation of [s=>{s.inventory.cohortSelection='successful-reads';},s=>{s.inventory.cohort=undefined;},s=>{s.inventory.cohort=[workerTid,ownerTid];},s=>{s.inventory.allThreadsCoverageProven=true;},s=>{s.inventory.identityContinuityProven=true;},s=>{s.inventory.terminal=[ownerTid,workerTid,workerTid];},s=>{s.inventory.terminal=[];},s=>{s.inventory.afterFinal.push(-1);}])test('malformed inventory or broadened proof cannot change the cohort contract: '+mutation.toString(),()=>{
  const sample=cohortFrame().sample;mutation(sample);assert.throws(()=>recordHostInventory(cohortSummary(sample.owner),sample),/incomplete/);
});
test('late observations do not stop collection or replace owned stop acknowledgement',async t=>{
  const f=fixture(t);let reads=0;
  const summary=await watchOwnedHost(f.dir,{sample:()=>{reads++;return cohortFrame({inventories:lateInventories}).sample;},sleep:async()=>f.stop()});
  assert.equal(reads,2);assert.equal(summary.samples,2);assert.equal(summary.observedOutsideCohort,2);
  assert.equal(summary.hostObservationIntegrity,true);assert.equal(summary.hostCaptureWindowComplete,true);assert.equal(summary.captureComplete,true);
  assert.deepEqual(verifyHostObservationStatus(summary,f.start),{hostObservationIntegrity:true,hostCaptureWindowComplete:true});
  assert.equal(readFileSync(join(f.dir,'host-scheduling.jsonl'),'utf8').trim().split('\n').length,2);
  assert.deepEqual(summary.limits,{intervalMs:1000,durationMs:1200000,maxHostBytes:67108864,maxTraceBytes:536870912});
});
test('a valid partial prefix remains integral but is not a completed window without owned stop',async t=>{
  const f=fixture(t);let time=0;
  const summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,clock:()=>time,sleep:async()=>{time+=600001;}});
  assert.equal(summary.samples,2);assert.equal(summary.hostObservationIntegrity,true);assert.equal(summary.hostCaptureWindowComplete,false);assert.equal(summary.captureComplete,false);
  assert.equal(summary.windowErrors[0].code,'DURATION_CAP');assert.equal(summary.observationErrors.length,0);
  assert.deepEqual(verifyHostObservationStatus(summary,f.start),{hostObservationIntegrity:true,hostCaptureWindowComplete:false});
  assert.throws(()=>verifyHostObservationStatus({...summary,hostCaptureWindowComplete:true,captureComplete:true},f.start),/claims/);
  f.stop();assert.deepEqual(verifyHostObservationStatus(summary,f.start),{hostObservationIntegrity:true,hostCaptureWindowComplete:false},'a later stop file cannot retroactively complete an already interrupted prefix');
});
test('a late worker never substitutes for a measured non-main cohort survivor',async t=>{
  const f=fixture(t),inventories=[[ownerTid],[ownerTid],[ownerTid,workerTid],[ownerTid,workerTid]];
  const summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame({inventories}).sample,sleep:async()=>f.stop()});
  assert.equal(summary.observedOutsideCohort,2);assert.equal(summary.nonMainSurvivorsVerified,0);assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.hostCaptureWindowComplete,false);assert.equal(summary.captureComplete,false);
  assert.ok(summary.observationErrors.some(error=>error.includes('coverage is missing')));
});
for(const change of [{source:'b'.repeat(40)},{session:'sogrim_ci_cohort_1_'+'b'.repeat(16)},{owner:{pid:ownerTid,startTicks:'99999'}},{stopVersion:4}])test('foreign/stale/malformed owned stop cannot complete a valid prefix: '+JSON.stringify(change),async t=>{
  const f=fixture(t),summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,sleep:async()=>f.stop(change)});
  assert.equal(summary.hostObservationIntegrity,true);assert.equal(summary.hostCaptureWindowComplete,false);assert.equal(summary.captureComplete,false);
  assert.equal(summary.windowErrors[0].code,'INVALID_OWNED_STOP');assert.ok(summary.rawStop);assert.equal(summary.ownedStop,undefined);
});
test('malformed stop JSON is retained and cannot complete the window',async t=>{
  const f=fixture(t),summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,sleep:async()=>writeFileSync(join(f.dir,'host-stop'),'{broken')});
  assert.equal(summary.rawStop,'{broken');assert.equal(summary.captureComplete,false);assert.equal(summary.windowErrors[0].code,'INVALID_OWNED_STOP');
});
test('preexisting malformed journal is preserved and cannot be adopted as this capture',async t=>{
  const f=fixture(t),file=join(f.dir,'host-scheduling.jsonl');writeFileSync(file,'{broken\n');
  const summary=await watchOwnedHost(f.dir,{sample:()=>assert.fail('must refuse preexisting journal before reading tasks')});
  assert.equal(readFileSync(file,'utf8'),'{broken\n');assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.captureComplete,false);assert.ok(summary.observationErrors.some(e=>e.includes('EEXIST')));
});
test('actual append failure keeps its error and never claims an integral window',async t=>{
  const f=fixture(t),summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,append:()=>{throw Object.assign(new Error('controlled journal I/O failure'),{code:'EIO'});}});
  assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.captureComplete,false);assert.ok(summary.observationErrors.some(e=>e.includes('journal I/O failure')));
});
test('same-length journal corruption after acknowledgement is retained and rejects observation integrity',async t=>{
  const f=fixture(t);let changed=false;
  const summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,sleep:async()=>{const file=join(f.dir,'host-scheduling.jsonl'),bytes=readFileSync(file);bytes[0]='!'.charCodeAt(0);writeFileSync(file,bytes);changed=true;f.stop();}});
  assert.equal(changed,true);assert.equal(readFileSync(join(f.dir,'host-scheduling.jsonl'))[0],'!'.charCodeAt(0));
  assert.equal(summary.data.bytes,summary.expectedJournal.bytes);assert.notEqual(summary.data.sha256,summary.expectedJournal.sha256);
  assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.hostCaptureWindowComplete,false);assert.equal(summary.captureComplete,false);assert.ok(summary.observationErrors.some(e=>e.includes('fully acknowledged observation sequence')));
});
test('the existing64MiB cap remains fatal and keeps the last complete prefix',async t=>{
  const f=fixture(t);let appends=0;
  const summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,append:(file,frame,receipt)=>{if(++appends===2)truncateSync(file,64*1024*1024-1);appendHostInventory(file,frame,receipt);},sleep:async()=>f.stop()});
  assert.equal(summary.capReached.limit,67108864);assert.equal(statSync(join(f.dir,'host-scheduling.jsonl')).size,67108863);assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.captureComplete,false);
});
test('a live cohort gap and owner loss stay fatal even with an owned stop',async t=>{
  for(const kind of ['counter','owner']){
    const f=fixture(t);let calls=0;
    const summary=await watchOwnedHost(f.dir,{sample:()=>{const frame=cohortFrame({counterError:++calls===2&&kind==='counter'?{tid:workerTid,code:'EIO'}:undefined}).sample;if(calls===2&&kind==='owner')frame.owner={...frame.owner,startTicks:'99999'};return frame;},sleep:async()=>f.stop()});
    assert.equal(summary.samples,2);assert.equal(summary.coverageSamples,1);assert.equal(summary.hostObservationIntegrity,false);assert.equal(summary.hostCaptureWindowComplete,false);assert.equal(summary.captureComplete,false);assert.equal(summary.ownedStop.verified,true);assert.ok(summary.observationErrors.length);
  }
});
test('new consumer rejects historical incomplete v4 summary rather than reinterpreting it',()=>{
  const historical=JSON.parse(readFileSync(new URL('./fixtures/android-native-qa469-host-summary.json',import.meta.url),'utf8'));
  assert.equal(historical.captureComplete,false);assert.equal(historical.samples,421);assert.equal(historical.coverageSamples,420);
  const start={source:historical.source,hostOwner:historical.owner,session:'sogrim_ci_cohort_1_'+'a'.repeat(16)};
  assert.throws(()=>verifyHostObservationStatus(historical,start),/schema\/producer/);
});
test('consumer rejects forged journal, error accounting and completion flags',async t=>{
  const f=fixture(t),summary=await watchOwnedHost(f.dir,{sample:()=>cohortFrame().sample,sleep:async()=>f.stop()});
  for(const mutate of [s=>{s.expectedJournal.sha256='f'.repeat(64);},s=>{s.errors.push('hidden EIO');},s=>{s.observationErrors.push('hidden EIO');},s=>{s.windowErrors.push({code:'IGNORED_READ_ERROR',error:'EIO'});s.errors.push('EIO');},s=>{s.hostObservationIntegrity=undefined;},s=>{s.hostCaptureWindowComplete=undefined;},s=>{s.captureComplete=undefined;},s=>{s.ownedStop.verified=false;},s=>{s.ownedStop.observedAtUtc='invalid';}]){
    const forged=structuredClone(summary);mutate(forged);assert.throws(()=>verifyHostObservationStatus(forged,f.start),/claims|accounting/);
  }
});
