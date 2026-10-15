import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOwnedHost,recordHostInventory,requireHostInventoryCoverage} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

const raw=readFileSync(new URL('./fixtures/android-native-qa467-sample284.json',import.meta.url));
const recorded=JSON.parse(raw);
// QA467 captured NO identity/counters for4548. Only this explicitly synthetic
// control supplies them. Never attribute these values to the historical run.
const syntheticNewborn={provenance:'synthetic-only; not QA467 evidence',pid:4548,name:'',state:'S',startTicks:'90000',userTicks:'7',systemTicks:'2',runNs:'1200',runQueueWaitNs:'300',timeslices:'4',wchan:'futex_wait'};
function procStat(thread){const fields=Array(40).fill('0');fields[10]=thread.userTicks;fields[11]=thread.systemTicks;fields[18]=thread.startTicks;return `${thread.pid} (${thread.name}) ${thread.state} ${fields.join(' ')}\n`;}
function replay(changes={}){
  const procRoot=join('qa467-proc'),owner=recorded.owner,base=join(procRoot,String(owner.pid)),taskRoot=join(base,'task');
  const options={emulatorPid:owner.pid,avd:'sogrim_ci_38736395636_1',device:'emulator-5582'},reads=new Map();let lists=0;
  const records=new Map([...recorded.threads,syntheticNewborn,{...syntheticNewborn,pid:99999,startTicks:'91000'}].map(t=>[t.pid,t]));
  const originalWorker=recorded.threads.find(t=>t.pid!==owner.pid).pid;
  const fail=code=>{throw Object.assign(new Error('Controlled synthetic proc failure'),{code});};
  const read=path=>{
    reads.set(path,(reads.get(path)||0)+1);
    if(path===join(base,'cmdline'))return owner.command.join('\0');
    if(path===join(base,'stat'))return procStat(records.get(owner.pid));
    for(const[tid,thread]of records){const dir=join(taskRoot,String(tid));
      if(path===join(dir,'stat')){
        if(tid===4548&&changes.newbornStatError&&lists===2)return fail(changes.newbornStatError);
        if(lists===3&&tid===changes.finalErrorTid)return fail(changes.finalError);
        if(lists===3&&tid===changes.finalReuseTid)return procStat({...thread,startTicks:'999999'});
        if(lists===3&&tid===changes.finalPidMismatch)return procStat({...thread,pid:tid+1});
        if(lists===3&&changes.finalCpuOnly)return procStat({...thread,userTicks:'88888',systemTicks:'99999'});
        return procStat(thread);
      }
      if(path===join(dir,'schedstat')){
        if(tid===4548&&changes.newbornCounterMissing)return fail('ENOENT');
        if(tid===4548&&changes.newbornCounterMalformed)return '1200 unavailable 4\n';
        if(tid===4548&&changes.decreasingNewborn)return '1 0 0\n';
        return `${thread.runNs} ${thread.runQueueWaitNs} ${thread.timeslices}\n`;
      }
      if(path===join(dir,'wchan'))return tid===4548&&changes.newbornZeroWchan?'0\n':thread.wchan+'\n';
    }
    throw Object.assign(new Error('No actual fixture data for this task'),{code:'ENOENT'});
  };
  const list=path=>{
    assert.equal(path,taskRoot);lists++;const ids=[...(lists===1?recorded.inventory.before:recorded.inventory.after)];
    if(lists===3){if(changes.lateBirth)ids.push(99999);if(changes.newbornExit)ids.splice(ids.indexOf(4548),1);if(changes.oldExit)ids.splice(ids.indexOf(originalWorker),1);}
    return ids.sort((a,b)=>a-b).map(String);
  };
  return{sample:sampleOwnedHost(options,{procRoot,read,list,expectedStartTicks:owner.startTicks}),reads,get lists(){return lists;},taskRoot,originalWorker};
}
function summary(owner){return{owner,samples:2,coverageVersion:3,coverageContract:'observed-live-owned-host-tasks-v3',coverageScope:'observed-live-owned-host-tasks',inventoryAtomic:false,lifetimeCoverageProven:false,rendererRoleProven:false};}

test('QA467 sample284 stays failed; synthetic newborn counters permit only the prospective v3 replay',()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),'95eff2eef0ee989c92dd9fb9d2c90afbcad2d6eee63b1145abf61edcc6390a1c');
  assert.equal(recorded.inventory.coverageComplete,false);assert.equal(recorded.threads.length,179);assert.ok(!recorded.threads.some(t=>t.pid===4548));
  assert.deepEqual(recorded.lifecycle,[{tid:4548,kind:'born-during-sample',startTicks:null}]);
  assert.match(syntheticNewborn.provenance,/synthetic-only; not QA467 evidence/);
  const f=replay(),sample=f.sample;
  assert.equal(sample.inventory.coverageComplete,true,'a discovered newborn needs actual counter reads and final identity verification');
  assert.deepEqual(sample.threads.filter(t=>t.pid!==4548),recorded.threads,'all179 historical counter records stay unchanged');
  assert.deepEqual(sample.inventory.before,recorded.inventory.before);assert.deepEqual(sample.inventory.afterDiscovery,recorded.inventory.after);assert.deepEqual(sample.inventory.afterFinal,recorded.inventory.after);
  assert.equal(f.lists,3);assert.equal(sample.threads.length,180);assert.equal(sample.finalIdentities.length,180);
  assert.equal(sample.inventory.coverageVersion,3);assert.equal(sample.inventory.rendererRoleProven,false);
  for(const thread of sample.threads){const dir=join(f.taskRoot,String(thread.pid));assert.equal(f.reads.get(join(dir,'stat')),3,'two counter-bound identity reads plus one final identity-only read');assert.equal(f.reads.get(join(dir,'schedstat')),1);assert.equal(f.reads.get(join(dir,'wchan')),1);}
  const receipt=summary(sample.owner),prior=new Map();recordHostInventory(receipt,sample,prior);recordHostInventory(receipt,sample,prior);
  assert.equal(requireHostInventoryCoverage(receipt),true);assert.equal(receipt.newbornTasksMeasured,2);assert.equal(receipt.finalIdentitiesVerified,360);assert.equal(receipt.unobservedExits,0);
});

for(const code of ['ENOENT','EACCES','EIO'])test('a newborn initial stat '+code+' remains failed without a retry',()=>{
  const f=replay({newbornStatError:code}),sample=f.sample;
  assert.equal(sample.inventory.coverageComplete,false);assert.ok(sample.unavailable.some(g=>g.tid===4548&&g.field==='stat'&&g.phase==='newborn'&&g.code===code));
  assert.ok(!sample.threads.some(t=>t.pid===4548));assert.ok(!sample.lifecycle.some(e=>e.tid===4548&&e.kind==='unobserved-exit'));
  assert.equal(f.reads.get(join(f.taskRoot,'4548','schedstat')),undefined);
  assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);
});
for(const key of ['newbornCounterMissing','newbornCounterMalformed','newbornExit','oldExit'])test('newborn collection preserves required failure: '+key,()=>{
  const {sample}=replay({[key]:true});assert.equal(sample.inventory.coverageComplete,false);
  if(key.startsWith('newbornCounter'))assert.equal(sample.threads.find(t=>t.pid===4548).runNs,undefined);
  assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);
});

test('a task born only in afterFinal has no counter pass and cannot be accepted',()=>{
  const f=replay({lateBirth:true}),sample=f.sample;
  assert.equal(sample.inventory.coverageComplete,false);assert.ok(!sample.threads.some(t=>t.pid===99999));
  assert.equal(f.reads.get(join(f.taskRoot,'99999','schedstat')),undefined);
  assert.equal(f.reads.get(join(f.taskRoot,'99999','stat')),1,'only closing identity is attempted, never guessed counters');
  assert.ok(sample.lifecycle.some(e=>e.tid===99999&&e.phase==='final'&&e.startTicks===null));
  assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);
});

for(const kind of ['original','newborn']){
  const tid=kind==='newborn'?4548:recorded.threads.find(t=>t.pid!==recorded.owner.pid).pid;
  for(const code of ['ENOENT','EACCES','EIO'])test('final survivor identity '+code+' remains failed: '+kind,()=>{
    const {sample}=replay({finalErrorTid:tid,finalError:code});assert.equal(sample.inventory.coverageComplete,false);
    assert.equal(sample.threads.find(t=>t.pid===tid).countersVerified,true,'earlier real counters never override a failed closing identity');
    assert.ok(sample.unavailable.some(g=>g.tid===tid&&g.field==='identity-final'&&g.code===code));
    assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);
  });
  for(const field of ['finalReuseTid','finalPidMismatch'])test('identity-only closing pass rejects '+field+': '+kind,()=>{
    const {sample}=replay({[field]:tid});assert.equal(sample.inventory.coverageComplete,false);
    assert.ok(sample.lifecycle.some(e=>e.tid===tid&&e.kind==='tid-reused-before-final-identity'));
    assert.equal(sample.finalIdentities.find(t=>t.pid=== (field==='finalPidMismatch'?tid+1:tid)).identityVerified,false);
    assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);
  });
}

test('closing pass reads identity only and does not resample any of the five counters',()=>{
  const normal=replay().sample,f=replay({finalCpuOnly:true});
  assert.equal(f.sample.inventory.coverageComplete,true);assert.deepEqual(f.sample.threads,normal.threads);
  for(const thread of f.sample.threads){const path=join(f.taskRoot,String(thread.pid));assert.equal(f.reads.get(join(path,'schedstat')),1);assert.equal(f.reads.get(join(path,'wchan')),1);assert.equal(f.reads.get(join(path,'stat')),3);}
});
test('optional newborn ZERO_WCHAN is retained with all actual counters',()=>{
  const {sample}=replay({newbornZeroWchan:true});assert.equal(sample.inventory.coverageComplete,true);
  assert.equal(sample.threads.find(t=>t.pid===4548).wchan,'0');assert.ok(sample.unavailable.some(g=>g.tid===4548&&g.code==='ZERO_WCHAN'));
  recordHostInventory(summary(sample.owner),sample);
});
test('newborn counters must remain monotone in the same observed lifetime',()=>{
  const normal=replay().sample,receipt=summary(normal.owner),prior=new Map();recordHostInventory(receipt,normal,prior);
  assert.throws(()=>recordHostInventory(receipt,replay({decreasingNewborn:true}).sample,prior),/counter decreased/);
});
test('sample and summary consumers require actual final identities and v3 accounting',()=>{
  const sample=replay().sample;
  for(const mutate of [s=>{s.finalIdentities.pop();},s=>{s.finalIdentities[1]=s.finalIdentities[0];},s=>{s.finalIdentities[1].startTicks='999999';},s=>{s.finalIdentities[1].identityVerified=false;},s=>{s.finalIdentities[1].identityVerified=undefined;},s=>{s.finalIdentityReadCount--;},s=>{s.inventory.afterDiscovery=s.inventory.before;},s=>{s.inventory.coverageVersion=2;},s=>{s.inventory.coverageContract='observed-live-owned-host-tasks-v2';}]){
    const forged=structuredClone(sample);mutate(forged);assert.throws(()=>recordHostInventory(summary(sample.owner),forged),/incomplete/);
  }
  const receipt=summary(sample.owner);recordHostInventory(receipt,sample);recordHostInventory(receipt,sample);
  for(const changes of [{coverageVersion:2},{coverageContract:'observed-live-owned-host-tasks-v2'},{newbornTasksMeasured:undefined},{newbornTasksMeasured:-1},{newbornTasksMeasured:99999},{finalIdentitiesVerified:undefined},{finalIdentitiesVerified:359}])
    assert.throws(()=>requireHostInventoryCoverage({...receipt,...changes}),/coverage is missing/);
});
