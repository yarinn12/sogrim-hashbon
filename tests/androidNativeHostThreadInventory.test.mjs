import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,truncateSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {sampleOwnedHost,recordHostInventory,requireHostInventoryCoverage,appendHostInventory} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

function procStat(pid,name,start='12345',userTicks='3') {
  const fields=Array(40).fill('0');fields[10]=userTicks;fields[11]='4';fields[18]=start;
  return `${pid} (${name}) S ${fields.join(' ')}\n`;
}
function procFixture(t) {
  const root=resolve(mkdtempSync(join(tmpdir(),'sogrim-host-inventory-')));
  t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));assert.ok(basename(root).startsWith('sogrim-host-inventory-'));rmSync(root,{recursive:true});});
  const processDir=join(root,'3441'),taskRoot=join(processDir,'task');mkdirSync(taskRoot,{recursive:true});
  writeFileSync(join(processDir,'stat'),procStat(3441,'qemu-system-x86'));
  writeFileSync(join(processDir,'cmdline'),['/sdk/emulator/qemu-system-x86_64-headless','-avd','sogrim_ci_inventory','-port','5582',''].join('\0'));
  const add=(pid,name,start='12345',scheduler='100 20 3\n')=>{
    const folder=join(taskRoot,String(pid));mkdirSync(folder);writeFileSync(join(folder,'stat'),procStat(pid,name,start));
    writeFileSync(join(folder,'schedstat'),scheduler);writeFileSync(join(folder,'wchan'),'futex_wait\n');return folder;
  };
  add(3441,'qemu-system-x86');add(3450,'','20000','501 77 8\n');add(3460,'ASGMemConsumer','20001','601 88 9\n');add(3470,'event_engine','20002','0 0 0\n');
  return {root,taskRoot,processDir,add,options:{emulatorPid:3441,avd:'sogrim_ci_inventory',device:'emulator-5582'}};
}

test('actual sampleOwnedHost retains scheduler counters for unnamed and nonmatching owned threads',t=>{
  const f=procFixture(t),sample=sampleOwnedHost(f.options,{procRoot:f.root,expectedStartTicks:'12345'});
  assert.equal(sample.threads.length,4,'all four owned tasks require real scheduler samples');
  assert.deepEqual(sample.threads.map(t=>t.pid),[3441,3450,3460,3470]);
  assert.equal(sample.threads.find(t=>t.pid===3450).runNs,'501');
  assert.equal(sample.threads.find(t=>t.pid===3460).runQueueWaitNs,'88');
  assert.equal(sample.threads.find(t=>t.pid===3470).runNs,'0');
  assert.equal(sample.unavailable.length,0);
  assert.equal(sample.inventory.coverageComplete,true);
  assert.ok(sample.threads.every(t=>t.emulatorPid===3441&&t.emulatorStartTicks==='12345'&&t.countersVerified));
});

test('two complete real inventories prove scheduler coverage without claiming renderer roles',t=>{
  const f=procFixture(t),sample=sampleOwnedHost(f.options,{procRoot:f.root}),summary={owner:sample.owner,samples:2,coverageVersion:3,coverageContract:'observed-live-owned-host-tasks-v3',coverageScope:'observed-live-owned-host-tasks',inventoryAtomic:false,lifetimeCoverageProven:false,rendererNames:[],rendererRoleProven:false},prior=new Map();
  recordHostInventory(summary,sample,prior);recordHostInventory(summary,sampleOwnedHost(f.options,{procRoot:f.root}),prior);
  assert.equal(requireHostInventoryCoverage(summary),true);assert.equal(summary.nonMainTasksMeasured,6);assert.equal(summary.rendererRoleProven,false);
});
test('raw zero wait channel stays explicit while actual scheduler counters remain valid',t=>{
  const f=procFixture(t);writeFileSync(join(f.taskRoot,'3450','wchan'),'0\n');
  const sample=sampleOwnedHost(f.options,{procRoot:f.root});assert.equal(sample.threads.find(t=>t.pid===3450).wchan,'0');
  assert.ok(sample.unavailable.some(g=>g.code==='ZERO_WCHAN'));assert.equal(sample.inventory.coverageComplete,true);
});
for(const kind of ['permission','missing','malformed'])test('required scheduler gap is terminal and no counter is invented: '+kind,t=>{
  const f=procFixture(t),target=join(f.taskRoot,'3450','schedstat');
  if(kind==='missing')rmSync(target);if(kind==='malformed')writeFileSync(target,'101 unavailable 3\n');
  const read=(p,...args)=>{if(kind==='permission'&&p===target){const e=new Error('Permission denied');e.code='EACCES';throw e;}return readFileSync(p,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,read}),thread=sample.threads.find(t=>t.pid===3450);
  assert.equal(thread.runNs,undefined);assert.equal(thread.countersVerified,false);assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(sample.unavailable.some(g=>g.tid===3450&&g.field==='schedstat'));
  assert.throws(()=>recordHostInventory({owner:sample.owner},sample),/incomplete/);
});
test('natural task exit during read records the known identity and incomplete coverage',t=>{
  const f=procFixture(t),target=join(f.taskRoot,'3450','schedstat');let exited=false;
  const read=(p,...args)=>{if(p===target&&!exited){exited=true;rmSync(dirname(target),{recursive:true});}return readFileSync(p,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,read});assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(sample.lifecycle.some(g=>g.tid===3450&&g.kind==='exited-during-sample'&&g.startTicks==='20000'));
  assert.equal(sample.threads.find(t=>t.pid===3450).runNs,undefined);
});
test('new tasks between inventory endpoints are recorded without a guessed start time',t=>{
  const f=procFixture(t);let lists=0;
  // The closing endpoint is now the third inventory. This original negative
  // still introduces an unmeasured final TID; its failure assertions stay intact.
  const list=p=>{if(++lists===3)f.add(3480,'','20003');return readdirSync(p);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,list});assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(sample.lifecycle.some(g=>g.tid===3480&&g.kind==='born-during-sample'&&g.startTicks===null));
});
test('TID reuse during a counter read discards unverified counters',t=>{
  const f=procFixture(t),target=join(f.taskRoot,'3450','stat');let reads=0;
  const read=(p,...args)=>{if(p===target&&++reads===2)writeFileSync(target,procStat(3450,'','99999'));return readFileSync(p,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,read});assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(sample.lifecycle.some(g=>g.kind==='tid-reused-during-read'));assert.equal(sample.threads.find(t=>t.pid===3450).runNs,undefined);
});
test('owner reuse blocks all evidence acceptance and reads remain inside the owned proc tree',t=>{
  const f=procFixture(t),target=join(f.processDir,'stat'),paths=[];let checks=0;
  const read=(p,...args)=>{paths.push(p);if(p===target&&++checks===2)writeFileSync(target,procStat(3441,'qemu-system-x86','99999'));return readFileSync(p,...args);};
  assert.throws(()=>sampleOwnedHost(f.options,{procRoot:f.root,read,expectedStartTicks:'12345'}),/foreign or reused/);
  assert.ok(paths.every(p=>p.startsWith(f.processDir)));
});
test('counter regression is rejected for the same lifetime; a new TID lifetime is kept separate',t=>{
  const f=procFixture(t),sample=sampleOwnedHost(f.options,{procRoot:f.root}),summary={owner:sample.owner},prior=new Map();recordHostInventory(summary,sample,prior);
  writeFileSync(join(f.taskRoot,'3450','schedstat'),'1 0 0\n');assert.throws(()=>recordHostInventory(summary,sampleOwnedHost(f.options,{procRoot:f.root}),prior),/counter decreased/);
  writeFileSync(join(f.taskRoot,'3450','stat'),procStat(3450,'','40000'));
  recordHostInventory(summary,sampleOwnedHost(f.options,{procRoot:f.root}),prior);
  assert.ok([...prior.keys()].some(k=>k.endsWith(':3450:20000')));assert.ok([...prior.keys()].some(k=>k.endsWith(':3450:40000')));
});
test('CPU tick regression also invalidates an unchanged TID lifetime',t=>{
  const f=procFixture(t),sample=sampleOwnedHost(f.options,{procRoot:f.root}),summary={owner:sample.owner},prior=new Map();recordHostInventory(summary,sample,prior);
  writeFileSync(join(f.taskRoot,'3450','stat'),procStat(3450,'','20000','2'));
  assert.throws(()=>recordHostInventory(summary,sampleOwnedHost(f.options,{procRoot:f.root}),prior),/counter decreased/);
});
test('incomplete summary and main-only samples cannot replace worker scheduling coverage',()=>{
  for(const d of [{samples:1,coverageSamples:1,nonMainTasksMeasured:2},{samples:2,coverageSamples:1,nonMainTasksMeasured:2},{samples:2,coverageSamples:2,nonMainTasksMeasured:0},{samples:2,coverageSamples:2,nonMainTasksMeasured:2,capReached:true}])
    assert.throws(()=>requireHostInventoryCoverage({coverageVersion:3,coverageContract:'observed-live-owned-host-tasks-v3',coverageScope:'observed-live-owned-host-tasks',inventoryAtomic:false,lifetimeCoverageProven:false,rendererRoleProven:false,unobservedExits:0,samplesWithUnobservedExits:0,newbornTasksMeasured:0,finalIdentitiesVerified:d.coverageSamples+d.nonMainTasksMeasured,...d}),/coverage is missing/);
});
test('a partial or duplicated measured task set cannot claim a complete inventory',t=>{
  const f=procFixture(t),sample=sampleOwnedHost(f.options,{procRoot:f.root});
  const partial=structuredClone(sample);partial.threads.pop();assert.throws(()=>recordHostInventory({owner:sample.owner},partial),/incomplete/);
  const duplicate=structuredClone(sample);duplicate.threads[3]=duplicate.threads[2];assert.throws(()=>recordHostInventory({owner:sample.owner},duplicate),/inventory/);
});
test('permission failure on a task identity remains a coverage gap with no fabricated lifetime',t=>{
  const f=procFixture(t),target=join(f.taskRoot,'3450','stat');
  const read=(p,...args)=>{if(p===target){const e=new Error('Permission denied');e.code='EACCES';throw e;}return readFileSync(p,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,read});assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(!sample.threads.some(t=>t.pid===3450));assert.ok(sample.unavailable.some(g=>g.tid===3450&&g.code==='EACCES'));
});
test('unknown proc error is retained and never reclassified as a natural exit',t=>{
  const f=procFixture(t),target=join(f.taskRoot,'3450','stat');
  const read=(p,...args)=>{if(p===target){const e=new Error('I/O error');e.code='EIO';throw e;}return readFileSync(p,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.root,read});assert.equal(sample.inventory.coverageComplete,false);
  assert.ok(sample.unavailable.some(g=>g.tid===3450&&g.code==='EIO'));assert.ok(!sample.lifecycle.some(g=>g.tid===3450&&g.kind==='exited-during-sample'));
});
test('existing 64MiB cap rejects a full sample before partial append and preserves its failure',t=>{
  const f=procFixture(t),file=join(f.root,'host-data.jsonl');writeFileSync(file,'');truncateSync(file,64*1024*1024-1);
  const summary={},sample=sampleOwnedHost(f.options,{procRoot:f.root});
  assert.throws(()=>appendHostInventory(file,sample,summary),/disk cap/);assert.equal(statSync(file).size,64*1024*1024-1);assert.equal(summary.capReached.limit,64*1024*1024);
});
