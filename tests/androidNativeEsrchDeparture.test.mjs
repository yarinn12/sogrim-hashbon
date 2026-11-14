import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {sampleOwnedHost,watchOwnedHost,recordHostInventory} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';
import {classifyHostCohort} from '../scripts/qa/android-native-isolated/cohort-observation-coverage.mjs';
import {ownedHostStopRequest,verifyHostObservationStatus} from '../scripts/qa/android-native-isolated/diagnostic-contract.mjs';

// Exact original QA496 journal line128, including LF. No original value is repaired.
const raw=readFileSync(new URL('./fixtures/android-native-qa496-esrch-frame128.json',import.meta.url)),original=JSON.parse(raw);
function stat(row){const fields=Array(40).fill('0');fields[10]=row.userTicks;fields[11]=row.systemTicks;fields[18]=row.startTicks;return `${row.pid} (${row.name}) ${row.state} ${fields.join(' ')}\n`;}
function replay({errno='ESRCH',inventories=original.inventory,ownerError=false,errorField='identity-after'}={}){
  const procRoot=join('qa496-esrch-proc'),owner=original.owner,base=join(procRoot,String(owner.pid)),taskRoot=join(base,'task'),reads=new Map();let scans=0;
  const rows=new Map(original.threads.map(row=>[row.pid,row]));
  const read=path=>{
    const count=(reads.get(path)||0)+1;reads.set(path,count);
    if(ownerError&&path===join(base,'stat'))throw Object.assign(new Error('Owned process exited'),{code:'ESRCH'});
    if(path===join(base,'cmdline'))return owner.command.join('\0');
    if(path===join(base,'stat'))return stat(rows.get(owner.pid));
    for(const[tid,row]of rows){const dir=join(taskRoot,String(tid));
      if(path===join(dir,'stat')){
        if(tid===4342&&count===(errorField==='stat'?1:2))throw Object.assign(new Error(errno==='ESRCH'?'ESRCH: no such process, read':'Controlled proc read error'),{code:errno});
        return stat(row);
      }
      if(path===join(dir,'schedstat'))return `${row.runNs} ${row.runQueueWaitNs} ${row.timeslices}\n`;
      if(path===join(dir,'wchan'))return row.wchan+'\n';
    }
    assert.fail('Unexpected read outside the original observed cohort: '+path);
  };
  const list=path=>{assert.equal(path,taskRoot);return inventories[['before','afterDiscovery','afterFinal','terminal'][scans++]].map(String);};
  return {sample:sampleOwnedHost({emulatorPid:owner.pid,avd:'sogrim_ci_42274817530_1',device:'emulator-5582'},{procRoot,read,list,expectedStartTicks:owner.startTicks}),reads,taskRoot};
}
function afterDeparture(frame){
  // Synthetic next observation for loop/stop controls, retaining every surviving
  // recorded value and proving nothing about the interrupted historical window.
  const sample=structuredClone(frame);sample.atUtc='2026-11-06T19:03:17.512Z';sample.monotonicNs=String(BigInt(frame.monotonicNs)+1000000000n);
  for(const key of ['before','afterDiscovery','afterFinal','terminal','cohort'])sample.inventory[key]=sample.inventory[key].filter(tid=>tid!==4342);
  sample.threads=sample.threads.filter(row=>row.pid!==4342);sample.unavailable=sample.unavailable.filter(row=>row.tid!==4342);sample.lifecycle=[];
  sample.threadsScanned=sample.inventory.cohort.length;sample.selectedThreads=sample.threads.length;sample.coverage=classifyHostCohort(sample);sample.inventory.coverageComplete=sample.coverage.unresolvedGaps.length===0;
  return sample;
}
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'host-esrch-'));
  t.after(()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));rmSync(dir,{recursive:true});});
  const start={diagnosticsVersion:2,diagnosticsContract:'owned-transport-and-cohort-v2',diagnosticsProducer:'owned-trace-start-v2',source:'2d4a973a197a2228fcd134f01d6763f500fd63bb',session:'sogrim_ci_42274817530_1_'+'a'.repeat(16),hostOwner:original.owner,emulatorPid:original.owner.pid};
  writeFileSync(join(dir,'trace-start.json'),JSON.stringify(start));
  return {dir,start,stop:()=>writeFileSync(join(dir,'host-stop'),JSON.stringify(ownedHostStopRequest(start)))};
}

test('QA496 original ESRCH departure is partial without invented identity or repaired counters',()=>{
  assert.equal(raw.length,43797);assert.equal(createHash('sha256').update(raw).digest('hex'),'b57b38badd8f6c0023c6d1fcc6815d55ccea00a5bde21994ace8221542453b6c');
  assert.equal(original.inventory.coverageComplete,false,'the historical capture stays failed');
  const f=replay(),sample=f.sample;
  assert.deepEqual(sample.coverage.unresolvedGaps,[]);assert.deepEqual(sample.coverage.departedPartial,[4342]);
  assert.deepEqual(sample.threads,original.threads);assert.deepEqual(sample.unavailable,original.unavailable);assert.deepEqual(sample.lifecycle,original.lifecycle);
  assert.deepEqual(sample.identitiesAfterCounters,original.identitiesAfterCounters);assert.deepEqual(sample.finalIdentities,original.finalIdentities);
  assert.equal(sample.threads.find(row=>row.pid===4342).countersVerified,false);assert.ok(!sample.finalIdentities.some(row=>row.pid===4342));
  for(const key of ['before','afterDiscovery','afterFinal','terminal','cohort'])assert.deepEqual(sample.inventory[key],original.inventory[key]);
  assert.equal(f.reads.get(join(f.taskRoot,'4342','stat')),2,'no retry or fabricated closing read');
  assert.equal(sample.inventory.lifetimeCoverageProven,false);assert.equal(sample.inventory.allThreadsCoverageProven,false);assert.equal(sample.inventory.rendererRoleProven,false);
});

test('an ESRCH partial departure keeps collection alive until an actual owned stop',async t=>{
  const f=fixture(t),first=replay().sample;let samples=0;
  const result=await watchOwnedHost(f.dir,{sample:()=>++samples===1?first:afterDeparture(first),sleep:async()=>f.stop()});
  assert.equal(samples,2);assert.equal(result.samples,2);assert.equal(result.departedPartial,1);assert.equal(result.unavailableFields,first.unavailable.length+afterDeparture(first).unavailable.length);
  assert.equal(result.ownedStop.verified,true);assert.equal(result.captureComplete,true);assert.deepEqual(verifyHostObservationStatus(result,f.start),{hostObservationIntegrity:true,hostCaptureWindowComplete:true});
  assert.equal(result.lifetimeCoverageProven,false);assert.equal(result.allThreadsCoverageProven,false);assert.equal(result.rendererRoleProven,false);assert.equal(result.kernelWaitChannelsComplete,false);
  const saved=readFileSync(join(f.dir,'host-scheduling.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(saved[0].unavailable.find(row=>row.tid===4342&&row.field==='identity-after').code,'ESRCH');assert.equal(saved[0].threads.find(row=>row.pid===4342).countersVerified,false);
  assert.equal(saved[1].inventory.cohort.includes(4342),false);assert.equal(result.data.sha256,result.expectedJournal.sha256);
});

test('an ESRCH partial prefix cannot invent a stop for the interrupted historical capture',async t=>{
  const f=fixture(t),first=replay().sample;let samples=0,time=0;
  const result=await watchOwnedHost(f.dir,{sample:()=>++samples===1?first:afterDeparture(first),clock:()=>time,sleep:async()=>{time+=600001;}});
  assert.equal(result.hostObservationIntegrity,true);assert.equal(result.hostCaptureWindowComplete,false);assert.equal(result.captureComplete,false);assert.equal(result.windowErrors[0].code,'DURATION_CAP');
  f.stop();assert.deepEqual(verifyHostObservationStatus(result,f.start),{hostObservationIntegrity:true,hostCaptureWindowComplete:false});
});

test('owner ESRCH remains fatal before any frame can be classified',()=>{assert.throws(()=>replay({ownerError:true}),error=>error.code==='ESRCH');});
test('ESRCH before initial counters retains an unobserved exit without an identity',()=>{
  const {sample}=replay({errorField:'stat'});
  assert.deepEqual(sample.coverage.unresolvedGaps,[]);assert.deepEqual(sample.coverage.unobservedExits,[4342]);
  assert.ok(!sample.threads.some(row=>row.pid===4342));assert.ok(!sample.finalIdentities.some(row=>row.pid===4342));
  assert.deepEqual(sample.lifecycle.find(row=>row.tid===4342),{tid:4342,kind:'unobserved-exit',startTicks:null,identity:null,counters:null});
  assert.equal(sample.unavailable.find(row=>row.tid===4342).code,'ESRCH');
});
for(const errno of ['EACCES','EIO'])test(errno+' remains invalid for the same departed thread',()=>{
  const {sample}=replay({errno});assert.equal(sample.inventory.coverageComplete,false);assert.ok(sample.coverage.unresolvedGaps.some(gap=>gap.kind==='non-exit-read-error'&&gap.code===errno));
});
test('ESRCH with a terminal-live or reappearing thread is not an observed departure',()=>{
  for(const keys of [['terminal'],['afterDiscovery','afterFinal','terminal']]){
    const inventories=structuredClone(original.inventory);for(const key of keys)inventories[key]=[...new Set([...inventories[key],4342])].sort((a,b)=>a-b);
    const {sample}=replay({inventories});assert.equal(sample.inventory.coverageComplete,false);assert.ok(sample.coverage.unresolvedGaps.length);
  }
});
test('ESRCH never excuses a reused post-counter identity or a forged verified counter',()=>{
  for(const mutate of [s=>{s.identitiesAfterCounters.push({tid:4342,pid:4342,startTicks:'999999'});},s=>{s.threads.find(row=>row.pid===4342).countersVerified=true;},s=>{s.owner={...s.owner,startTicks:'999999'};}]){
    const sample=structuredClone(replay().sample);mutate(sample);assert.ok(classifyHostCohort(sample).unresolvedGaps.length);
  }
});
test('the original failed journal declaration cannot be adopted as a completed fresh frame',()=>{
  assert.throws(()=>recordHostInventory({owner:original.owner},original),/incomplete/);
});
test('same-length journal corruption stays fatal after the ESRCH departure',async t=>{
  const f=fixture(t),first=replay().sample;let samples=0;
  const result=await watchOwnedHost(f.dir,{sample:()=>++samples===1?first:afterDeparture(first),sleep:async()=>{const path=join(f.dir,'host-scheduling.jsonl'),bytes=readFileSync(path);bytes[0]=33;writeFileSync(path,bytes);f.stop();}});
  assert.equal(result.ownedStop.verified,true);assert.equal(result.captureComplete,false);assert.equal(result.hostObservationIntegrity,false);assert.equal(result.data.bytes,result.expectedJournal.bytes);assert.notEqual(result.data.sha256,result.expectedJournal.sha256);
});
