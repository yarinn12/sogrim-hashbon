import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOwnedHost,recordHostInventory,requireHostInventoryCoverage} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

const raw=readFileSync(new URL('./fixtures/android-native-qa468-sample552.json',import.meta.url));
const recorded=JSON.parse(raw);
function procStat(t){const fields=Array(40).fill('0');fields[10]=t.userTicks;fields[11]=t.systemTicks;fields[18]=t.startTicks;return `${t.pid} (${t.name}) ${t.state} ${fields.join(' ')}\n`;}
function replayOriginalWithSyntheticTerminalAbsence({followup=false}={}){
  const procRoot=join('qa468-proc'),owner=recorded.owner,base=join(procRoot,String(owner.pid)),taskRoot=join(base,'task'),reads=new Map();let lists=0;
  const records=new Map(recorded.threads.map(t=>[t.pid,t]));
  const read=path=>{
    reads.set(path,(reads.get(path)||0)+1);
    if(path===join(base,'cmdline'))return owner.command.join('\0');
    if(path===join(base,'stat'))return procStat(records.get(owner.pid));
    for(const[tid,t]of records){const dir=join(taskRoot,String(tid));
      if(path===join(dir,'stat')){
        if(tid===5449&&reads.get(path)===3)throw Object.assign(new Error(recorded.unavailable.find(g=>g.tid===5449&&g.field==='identity-final').error),{code:'ENOENT'});
        return procStat(t);
      }
      if(path===join(dir,'schedstat'))return `${t.runNs} ${t.runQueueWaitNs} ${t.timeslices}\n`;
      if(path===join(dir,'wchan'))return t.wchan+'\n';
    }
    throw new Error('No historical record for requested task');
  };
  // ONLY this fourth, prospective observation is synthetic. QA468 did not
  // capture a terminal inventory and remains failed under its original v3.
  const syntheticTerminal=recorded.inventory.afterFinal.filter(tid=>tid!==5449);
  const list=path=>{assert.equal(path,taskRoot);const ids=[recorded.inventory.before,recorded.inventory.afterDiscovery,recorded.inventory.afterFinal,syntheticTerminal][lists++];return(followup?ids.filter(tid=>tid!==5449):ids).map(String);};
  const sample=sampleOwnedHost({emulatorPid:owner.pid,avd:'sogrim_ci_38744710465_1',device:'emulator-5582'},{procRoot,read,list,expectedStartTicks:owner.startTicks});
  return{sample,reads,lists,taskRoot,syntheticTerminal};
}
function summary(owner){return{owner,samples:2,coverageVersion:4,coverageContract:'observed-terminal-survivors-v4',coverageScope:'observed-terminal-survivors',inventoryAtomic:false,lifetimeCoverageProven:false,rendererRoleProven:false};}

test('QA468 sample552 remains failed v3; only synthetic terminal absence supports prospective survivor coverage',()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),'a75e3e3566e997ed28a102352ee0e424166dfe8e896078e8ba11c1313cf1572e');
  assert.equal(recorded.inventory.coverageVersion,3);assert.equal(recorded.inventory.coverageComplete,false);assert.equal(recorded.threads.length,239);assert.equal(recorded.finalIdentities.length,238);
  const f=replayOriginalWithSyntheticTerminalAbsence(),sample=f.sample;
  assert.equal(sample.inventory.coverageComplete,true,'confirmed terminal absence is distinct from a missing live survivor identity');
  assert.equal(f.lists,4);assert.deepEqual(sample.threads,recorded.threads,'all239 original counter records stay unchanged');
  assert.deepEqual(sample.finalIdentities,recorded.finalIdentities,'no closing identity is invented for5449');
  for(const name of ['before','afterDiscovery','afterFinal'])assert.deepEqual(sample.inventory[name],recorded.inventory[name]);
  assert.deepEqual(sample.inventory.terminal,f.syntheticTerminal);
  assert.equal(sample.coverage.survivorsVerified.length,238);assert.deepEqual(sample.coverage.departedVerified,[5449]);assert.deepEqual(sample.coverage.departedPartial,[]);assert.deepEqual(sample.coverage.unobservedExits,[]);assert.deepEqual(sample.coverage.unresolvedGaps,[]);
  assert.ok(sample.unavailable.some(g=>g.tid===5449&&g.field==='identity-final'&&g.code==='ENOENT'));
  assert.equal(sample.inventory.coverageVersion,4);assert.equal(sample.inventory.scope,'observed-terminal-survivors');assert.equal(sample.inventory.rendererRoleProven,false);
  const receipt=summary(sample.owner),prior=new Map();recordHostInventory(receipt,sample,prior);recordHostInventory(receipt,replayOriginalWithSyntheticTerminalAbsence({followup:true}).sample,prior);
  assert.equal(requireHostInventoryCoverage(receipt),true);assert.equal(receipt.survivorsVerified,476);assert.equal(receipt.departedVerified,1);assert.equal(receipt.departedPartial,0);assert.equal(receipt.unobservedExits,0);assert.equal(receipt.unresolvedGaps,0);assert.equal(receipt.nonMainSurvivorsVerified,474);
});

// All following lifecycle controls are synthetic. They do not add information
// to QA468 or assign any role to its TIDs.
const ownerTid=3441,workerTid=3450,subjectTid=3460;
const all=[ownerTid,workerTid,subjectTid],withoutSubject=[ownerTid,workerTid];
function simulate({inventories=[all,all,all,all],failure,sticky=true,changes={}}={}){
  const procRoot=join('terminal-synthetic-proc'),base=join(procRoot,String(ownerTid)),taskRoot=join(base,'task'),reads=new Map();let listCount=0,gone=false;
  const records=new Map([ownerTid,workerTid,subjectTid,3470].map((pid,index)=>[pid,{pid,name:index?'':'qemu-system-x86',state:'S',startTicks:String(10000+index),userTicks:'3',systemTicks:'4',runNs:'100',runQueueWaitNs:'20',timeslices:'3',wchan:'futex_wait',...changes[pid]}]));
  const read=path=>{
    reads.set(path,(reads.get(path)||0)+1);
    if(path===join(base,'cmdline'))return ['/sdk/emulator/qemu-system-x86_64-headless','-avd','sogrim_ci_terminal','-port','5582',''].join('\0');
    if(path===join(base,'stat'))return procStat(records.get(ownerTid));
    for(const[tid,row]of records){const folder=join(taskRoot,String(tid));
      const file=path===join(folder,'stat')?'stat':path===join(folder,'schedstat')?'schedstat':path===join(folder,'wchan')?'wchan':undefined;
      if(!file)continue;
      const field=file==='stat'?(listCount===3?'identity-final':reads.get(path)===1?'stat':'identity-after'):file;
      if(tid===subjectTid){
        if(gone)throw Object.assign(new Error('Synthetic observed disappearance'),{code:'ENOENT'});
        if(failure?.field===field){if(sticky&&failure.code==='ENOENT')gone=true;throw Object.assign(new Error('Synthetic '+field+' '+failure.code),{code:failure.code});}
      }
      if(file==='stat'){
        if(tid===subjectTid&&changes.reuse===field)return procStat({...row,startTicks:'99999'});
        if(tid===subjectTid&&changes.malformed===field)return 'malformed actual stat\n';
        return procStat(row);
      }
      if(file==='schedstat')return tid===subjectTid&&changes.malformed==='schedstat'?'100 invalid 3\n':`${row.runNs} ${row.runQueueWaitNs} ${row.timeslices}\n`;
      return tid===subjectTid&&changes.malformed==='wchan'?'\n':row.wchan+'\n';
    }
    throw Object.assign(new Error('No synthetic task data'),{code:'ENOENT'});
  };
  const list=path=>{assert.equal(path,taskRoot);return inventories[listCount++].map(String);};
  const sample=sampleOwnedHost({emulatorPid:ownerTid,avd:'sogrim_ci_terminal',device:'emulator-5582'},{procRoot,read,list,expectedStartTicks:'10000'});
  return{sample,reads,taskRoot,listCount};
}
function assertComplete(sample){assert.equal(sample.inventory.coverageComplete,true,JSON.stringify(sample.coverage));recordHostInventory(summary(sample.owner),sample);}
function assertFailed(sample){assert.equal(sample.inventory.coverageComplete,false,JSON.stringify(sample.coverage));assert.ok(sample.coverage.unresolvedGaps.length);assert.throws(()=>recordHostInventory(summary(sample.owner),sample),/incomplete/);}

for(const field of ['stat','schedstat','wchan','identity-after','identity-final'])test('terminal absence classifies '+field+' ENOENT without inventing data',()=>{
  const late=field==='identity-final',f=simulate({inventories:late?[all,all,all,withoutSubject]:[all,withoutSubject,withoutSubject,withoutSubject],failure:{field,code:'ENOENT'}}),sample=f.sample;
  assertComplete(sample);assert.equal(f.listCount,4);assert.ok(sample.unavailable.some(g=>g.tid===subjectTid&&g.field===field&&g.code==='ENOENT'));
  assert.ok(!sample.finalIdentities.some(row=>row.pid===subjectTid));
  if(field==='stat'){
    assert.deepEqual(sample.coverage.unobservedExits,[subjectTid]);assert.ok(!sample.threads.some(row=>row.pid===subjectTid));
  }else{
    const row=sample.threads.find(row=>row.pid===subjectTid);assert.equal(row.userTicks,'3');assert.equal(row.systemTicks,'4');
    if(late){assert.equal(row.countersVerified,true);assert.deepEqual(sample.coverage.departedVerified,[subjectTid]);}
    else{assert.equal(row.countersVerified,false);assert.deepEqual(sample.coverage.departedPartial,[subjectTid]);}
    if(field==='wchan'||field==='identity-after'){assert.equal(row.runNs,'100');assert.equal(row.runQueueWaitNs,'20');assert.equal(row.timeslices,'3');}
    if(field==='identity-after')assert.equal(row.wchan,'futex_wait','actual wchan survives the failed identity-after read');
  }
});

test('fully verified task leaving only after its closing identity remains an observed departure',()=>{
  const {sample}=simulate({inventories:[all,all,all,withoutSubject]});assertComplete(sample);
  assert.deepEqual(sample.coverage.departedVerified,[subjectTid]);assert.ok(sample.finalIdentities.some(row=>row.pid===subjectTid&&row.identityVerified));
});
for(const field of ['stat','schedstat','wchan','identity-after','identity-final'])test('the same '+field+' ENOENT with terminal presence remains fatal',()=>{
  const {sample}=simulate({failure:{field,code:'ENOENT'}});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>g.tid===subjectTid&&g.kind==='live-read-gap'));
});

for(const field of ['stat','schedstat','wchan','identity-after','identity-final'])for(const code of ['EACCES','EIO'])test(field+' '+code+' stays fatal even after terminal absence',()=>{
  const {sample}=simulate({inventories:[all,all,all,withoutSubject],failure:{field,code}});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>g.kind==='non-exit-read-error'&&g.code===code));
});
for(const field of ['stat','schedstat','wchan','identity-after','identity-final'])test('malformed '+field+' stays fatal and retains the raw failed read',()=>{
  const {sample}=simulate({inventories:[all,all,all,withoutSubject],changes:{malformed:field}});assertFailed(sample);
  assert.ok(sample.unavailable.some(g=>g.tid===subjectTid&&g.field===field&&typeof g.raw==='string'));
});

for(const field of ['identity-after','identity-final'])test('observed reuse at '+field+' stays fatal even if absent at terminal',()=>{
  const {sample}=simulate({inventories:[all,all,all,withoutSubject],changes:{reuse:field}});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>/reuse/.test(g.kind)));
});
test('an ENOENT followed by another successful read cannot be labeled a clean exit',()=>{
  const {sample}=simulate({inventories:[all,withoutSubject,withoutSubject,withoutSubject],failure:{field:'schedstat',code:'ENOENT'},sticky:false});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>g.kind==='read-succeeded-after-enoent'));
});
test('a TID that disappears and reappears across inventories remains fatal',()=>{
  const {sample}=simulate({inventories:[all,withoutSubject,all,all]});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>g.kind==='inventory-reappearance'));
});

for(const field of [undefined,'stat','schedstat','identity-after'])test('discovered newborn lifecycle is classified together: '+(field||'survivor'),()=>{
  const disappears=!!field,late=field==='identity-after';
  const {sample}=simulate({inventories:[withoutSubject,all,disappears?withoutSubject:all,disappears?withoutSubject:all],failure:field?{field,code:'ENOENT'}:undefined});
  assertComplete(sample);
  if(!field)assert.ok(sample.coverage.survivorsVerified.includes(subjectTid));
  else if(field==='stat')assert.deepEqual(sample.coverage.unobservedExits,[subjectTid]);
  else{assert.deepEqual(sample.coverage.departedPartial,[subjectTid]);assert.equal(sample.threads.find(t=>t.pid===subjectTid).countersVerified,false);}
});
for(const terminalPresent of [true,false])test('a newborn outside the counter pass stays fatal, terminalPresent='+terminalPresent,()=>{
  const {sample}=simulate({inventories:[withoutSubject,withoutSubject,all,terminalPresent?all:withoutSubject]});assertFailed(sample);
  assert.ok(sample.coverage.unresolvedGaps.some(g=>g.kind==='unmeasured-birth'&&g.tid===subjectTid));
});
test('a task first seen only at terminal has no fabricated identity or counters',()=>{
  const {sample}=simulate({inventories:[withoutSubject,withoutSubject,withoutSubject,all]});assertFailed(sample);
  assert.ok(!sample.threads.some(row=>row.pid===subjectTid));assert.ok(!sample.finalIdentities.some(row=>row.pid===subjectTid));
});

test('a previously departed identity cannot reappear in a later sample',()=>{
  const gone=simulate({inventories:[all,all,all,withoutSubject]}).sample,receipt=summary(gone.owner),prior=new Map();recordHostInventory(receipt,gone,prior);
  assert.throws(()=>recordHostInventory(receipt,simulate().sample,prior),/incomplete/);
  assert.ok(receipt.historyGaps.some(g=>g.kind==='departed-identity-reappeared'));
});
test('unknown departed TID returning later remains unresolved; distinct known lifetime stays separate',()=>{
  const gone=simulate({inventories:[all,withoutSubject,withoutSubject,withoutSubject],failure:{field:'stat',code:'ENOENT'}}).sample,receipt=summary(gone.owner),prior=new Map();recordHostInventory(receipt,gone,prior);
  assert.throws(()=>recordHostInventory(receipt,simulate().sample,prior),/incomplete/);
  const known=simulate({inventories:[all,all,all,withoutSubject]}).sample,other=summary(known.owner),states=new Map();recordHostInventory(other,known,states);
  recordHostInventory(other,simulate({changes:{[subjectTid]:{startTicks:'55555',userTicks:'0',systemTicks:'0',runNs:'0',runQueueWaitNs:'0',timeslices:'0'}}}).sample,states);
});
test('decreasing actual counters stay fatal even in a departed partial row',()=>{
  const initial=simulate().sample,receipt=summary(initial.owner),prior=new Map();recordHostInventory(receipt,initial,prior);
  const partial=simulate({inventories:[all,withoutSubject,withoutSubject,withoutSubject],failure:{field:'identity-after',code:'ENOENT'},changes:{[subjectTid]:{userTicks:'2'}}}).sample;
  assert.equal(partial.inventory.coverageComplete,true);assert.throws(()=>recordHostInventory(receipt,partial,prior),/counter decreased/);
});
test('departed partial workers cannot substitute for actual non-main survivors',()=>{
  const parent=[ownerTid],pair=[ownerTid,subjectTid],sample=simulate({inventories:[pair,parent,parent,parent],failure:{field:'identity-after',code:'ENOENT'}}).sample,receipt=summary(sample.owner),prior=new Map();
  recordHostInventory(receipt,sample,prior);recordHostInventory(receipt,simulate({inventories:[parent,parent,parent,parent]}).sample,prior);
  assert.equal(receipt.departedPartial,1);assert.equal(receipt.nonMainSurvivorsVerified,0);assert.throws(()=>requireHostInventoryCoverage(receipt),/coverage is missing/);
});
test('forged classification, proof, role, counters or zero-gap claims cannot gain acceptance',()=>{
  const sample=simulate().sample;
  for(const mutate of [s=>{s.coverage.survivorsVerified.pop();},s=>{s.coverage.unresolvedGaps=[];s.inventory.rendererRoleProven=true;},s=>{s.identitiesAfterCounters.pop();},s=>{s.identitiesAfterCounters[1].startTicks='9999';},s=>{s.threads[1].countersVerified=false;},s=>{delete s.threads[1].timeslices;},s=>{s.finalIdentities.pop();},s=>{s.inventory.terminal.push(3470);},s=>{s.inventory.coverageVersion=3;}]){
    const forged=structuredClone(sample);mutate(forged);assert.throws(()=>recordHostInventory(summary(sample.owner),forged),/incomplete/);
  }
});
