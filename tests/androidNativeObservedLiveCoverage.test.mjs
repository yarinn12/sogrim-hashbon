import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOwnedHost,recordHostInventory,requireHostInventoryCoverage} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

// Actual retained QA466 sample300, unchanged. Reconstructed proc responses below
// exercise the collector; they do not reclassify that failed historical run.
const raw=readFileSync(new URL('./fixtures/android-native-qa466-sample300.json',import.meta.url));
const recorded=JSON.parse(raw);
function procStat(thread){
  const fields=Array(40).fill('0');fields[10]=thread.userTicks;fields[11]=thread.systemTicks;fields[18]=thread.startTicks;
  return `${thread.pid} (${thread.name}) ${thread.state} ${fields.join(' ')}\n`;
}
function replayQA466(changes={}){
  const procRoot=join('qa466-proc'),owner=recorded.owner,base=join(procRoot,String(owner.pid)),taskRoot=join(base,'task');
  const options={emulatorPid:owner.pid,avd:'sogrim_ci_38729651372_1',device:'emulator-5582'},reads=new Map();let lists=0;
  const records=new Map(recorded.threads.map(thread=>[thread.pid,thread]));
  const read=(path)=>{
    reads.set(path,(reads.get(path)||0)+1);
    if(path===join(base,'cmdline'))return owner.command.join('\0');
    if(path===join(base,'stat'))return procStat(records.get(owner.pid));
    for(const[tid,thread]of records){
      const dir=join(taskRoot,String(tid));
      if(path===join(dir,'stat')){
        if(changes.exitAfterIdentity===tid&&reads.get(path)===2)throw Object.assign(new Error('Exited after identity'),{code:'ENOENT'});
        if(changes.reuse===tid&&reads.get(path)===2)return procStat({...thread,startTicks:'99999999'});
        return procStat(thread);
      }
      if(path===join(dir,'schedstat')){
        if(changes.missingCounter===tid)throw Object.assign(new Error('Missing scheduler counters'),{code:'ENOENT'});
        return `${thread.runNs} ${thread.runQueueWaitNs} ${thread.timeslices}\n`;
      }
      if(path===join(dir,'wchan'))return thread.wchan+'\n';
    }
    assert.equal(path,join(taskRoot,'4622','stat'),'no guessed identity or counters may be requested');
    throw Object.assign(new Error('Recorded initial stat read unavailable'),{code:changes.initialError||'ENOENT'});
  };
  const list=path=>{
    assert.equal(path,taskRoot);lists++;
    const ids=[...(lists===1?recorded.inventory.before:recorded.inventory.after)];
    if(lists===2){if(changes.presentAfter)ids.push(4622);if(changes.newAfter)ids.push(99999);const exited=changes.exitAfterIdentity||changes.exitAfterCounters;if(exited)ids.splice(ids.indexOf(exited),1);}
    return ids.sort((a,b)=>a-b).map(String);
  };
  const sample=sampleOwnedHost(options,{procRoot,read,list,expectedStartTicks:owner.startTicks});
  return{sample,reads,lists,taskRoot};
}
function summary(owner){return{owner,samples:2,coverageVersion:2,coverageContract:'observed-live-owned-host-tasks-v2',coverageScope:'observed-live-owned-host-tasks',inventoryAtomic:false,lifetimeCoverageProven:false,rendererRoleProven:false,unobservedExits:0,samplesWithUnobservedExits:0};}

for(const value of [true,undefined,'false']){
  const label=value===undefined?'undefined':JSON.stringify(value);
  test('sample rendererRoleProven must be explicitly false; rejects '+label,()=>{
    const {sample}=replayQA466();assert.equal(sample.inventory.rendererRoleProven,false);
    recordHostInventory(summary(sample.owner),sample);
    sample.inventory.rendererRoleProven=value;
    assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/inventory\/counter coverage is incomplete/,'invalid sample renderer role claim must be rejected');
  });
  test('summary rendererRoleProven must be explicitly false; rejects '+label,()=>{
    const {sample}=replayQA466(),receipt=summary(sample.owner);
    recordHostInventory(receipt,sample);recordHostInventory(receipt,sample);
    assert.equal(receipt.rendererRoleProven,false);assert.equal(requireHostInventoryCoverage(receipt),true);
    receipt.rendererRoleProven=value;
    assert.throws(()=>requireHostInventoryCoverage(receipt),/coverage is missing/,'invalid summary renderer role claim must be rejected');
  });
}

test('QA466 sample300 retains 188 real counters and explicitly unknown pre-identity exit without dropping the sample',()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),'7f34db455a903289e7435e7ce397f68941c836d582852208ecca1285ae9d016f');
  assert.equal(recorded.inventory.coverageComplete,false,'historical QA466 remains failed under its original contract');
  assert.equal(recorded.owner.pid,3286);assert.equal(recorded.owner.startTicks,'29104');
  assert.equal(recorded.inventory.before.length,189);assert.equal(recorded.inventory.after.length,188);
  const {sample,reads,lists,taskRoot}=replayQA466();
  assert.equal(sample.inventory.coverageComplete,true,'only initial ENOENT plus final absence is an explicit unobserved exit');
  assert.equal(lists,2);assert.equal(reads.get(join(taskRoot,'4622','stat')),1,'one attempt, no retry');
  assert.equal(sample.threads.length,188);assert.deepEqual(sample.inventory.before,recorded.inventory.before);assert.deepEqual(sample.inventory.after,recorded.inventory.after);
  assert.deepEqual(sample.threads,recorded.threads,'all retained counters come from actual records');
  assert.equal(sample.unavailable.find(g=>g.tid===4622).code,'ENOENT');
  assert.deepEqual(sample.lifecycle,[{tid:4622,kind:'unobserved-exit',startTicks:null,identity:null,counters:null}]);
  assert.equal(sample.inventory.coverageVersion,2);assert.equal(sample.inventory.scope,'observed-live-owned-host-tasks');
  assert.equal(sample.inventory.atomic,false);assert.equal(sample.inventory.lifetimeCoverageProven,false);assert.equal(sample.inventory.rendererRoleProven,false);
  const receipt=summary(sample.owner),prior=new Map();recordHostInventory(receipt,sample,prior);recordHostInventory(receipt,sample,prior);
  assert.equal(receipt.coverageSamples,2);assert.equal(receipt.nonMainTasksMeasured,374);assert.equal(receipt.unobservedExits,2);assert.equal(receipt.samplesWithUnobservedExits,2);
  assert.equal(prior.size,188);assert.ok(![...prior.keys()].some(key=>key.includes(':4622:')));
  assert.equal(requireHostInventoryCoverage(receipt),true);
});

for(const changes of [{presentAfter:true},{initialError:'EACCES'},{initialError:'EIO'},{initialError:'ENOTDIR'},{exitAfterIdentity:3291},{exitAfterCounters:3291},{newAfter:true},{missingCounter:3291},{reuse:3291}])test('the unobserved-exit exception never accepts another required gap: '+JSON.stringify(changes),()=>{
  const {sample}=replayQA466(changes);assert.equal(sample.inventory.coverageComplete,false);
  if(changes.exitAfterIdentity||changes.exitAfterCounters){
    assert.ok(sample.lifecycle.some(event=>event.tid===3291&&event.kind==='exited-during-sample'&&event.startTicks===recorded.threads.find(t=>t.pid===3291).startTicks));
    if(changes.exitAfterCounters)assert.equal(sample.threads.find(t=>t.pid===3291).countersVerified,true,'even a fully read known identity may not use the pre-identity exception');
  }
  // The recorder independently checks the retained evidence, even if a caller
  // falsely labels the sample complete. No existing negative is reclassified.
  sample.inventory.coverageComplete=true;
  assert.throws(()=>recordHostInventory({owner:sample.owner},sample),/incomplete/);
});

test('an exception label cannot replace its exact first-read and endpoint evidence',()=>{
  const mutations=[
    s=>{s.unavailable=s.unavailable.filter(g=>g.tid!==4622);},
    s=>{s.lifecycle=[];},
    s=>{s.lifecycle.push({...s.lifecycle[0]});},
    s=>{s.unavailable.push({...s.unavailable.find(g=>g.tid===4622)});},
    s=>{s.unavailable.find(g=>g.tid===4622).phase='identity-after';},
    s=>{s.unavailable.find(g=>g.tid===4622).startTicks='123';},
    s=>{s.lifecycle[0].identity={pid:4622,startTicks:'123'};},
    s=>{s.lifecycle[0].counters={runNs:'0'};},
    s=>{s.lifecycle[0].startTicks='123';},
    s=>{s.lifecycle[0].kind='exited-during-sample';},
    s=>{s.inventory.after.push(4622);s.inventory.after.sort((a,b)=>a-b);},
    s=>{s.inventory.before=s.inventory.before.filter(tid=>tid!==4622);},
    s=>{s.inventory.coverageVersion=1;},
    s=>{s.inventory.scope='all-owned-host-tasks';},
    s=>{s.inventory.coverageContract='all-owned-host-tasks-v1';},
    s=>{s.inventory.atomic=true;},
    s=>{s.inventory.lifetimeCoverageProven=true;},
  ];
  const original=replayQA466().sample;
  for(const mutate of mutations){const sample=structuredClone(original);mutate(sample);assert.throws(()=>recordHostInventory({owner:sample.owner},sample),/incomplete/);}
});

test('every final task still requires its own real identity and all five counters',()=>{
  const original=replayQA466().sample;
  for(const mutate of [s=>s.threads.pop(),s=>s.threads.push(s.threads[0]),s=>{s.threads[1].countersVerified=false;},s=>{delete s.threads[1].startTicks;},...['userTicks','systemTicks','runNs','runQueueWaitNs','timeslices'].map(key=>s=>{delete s.threads[1][key];})]){
    const sample=structuredClone(original);mutate(sample);assert.throws(()=>recordHostInventory({owner:sample.owner},sample),/incomplete|identity\/counters/);
  }
});

test('exception accounting never substitutes for complete samples, worker counters or caps',()=>{
  const {sample}=replayQA466(),valid=summary(sample.owner);recordHostInventory(valid,sample);recordHostInventory(valid,sample);
  for(const changes of [{coverageVersion:1},{coverageContract:'all-owned-host-tasks-v1'},{coverageScope:'all-owned-host-tasks'},{samples:3},{coverageSamples:1},{nonMainTasksMeasured:0},{unobservedExits:-1},{unobservedExits:undefined},{samplesWithUnobservedExits:0},{samplesWithUnobservedExits:3},{samplesWithUnobservedExits:undefined},{capReached:{kind:'host-bytes'}},{errors:['EIO']},{inventoryAtomic:true},{lifetimeCoverageProven:true}])
    assert.throws(()=>requireHostInventoryCoverage({...valid,...changes}),/coverage is missing/);
});
