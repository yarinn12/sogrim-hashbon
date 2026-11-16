import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOwnedHost,recordHostInventory,requireHostInventoryCoverage} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

// Original QA469 last journal line, including its newline. No historical
// identity/counter is supplied for6047, which was seen only at terminal.
const raw=readFileSync(new URL('./fixtures/android-native-qa469-sample421.json',import.meta.url)),recorded=JSON.parse(raw);
function stat(row){const f=Array(40).fill('0');f[10]=row.userTicks;f[11]=row.systemTicks;f[18]=row.startTicks;return `${row.pid} (${row.name}) ${row.state} ${f.join(' ')}\n`;}
function replay(){
  const procRoot=join('qa469-cohort-proc'),owner=recorded.owner,base=join(procRoot,String(owner.pid)),taskRoot=join(base,'task'),reads=new Map();let lists=0;
  const records=new Map(recorded.threads.map(row=>[row.pid,row]));
  const read=path=>{
    reads.set(path,(reads.get(path)||0)+1);
    if(path===join(base,'cmdline'))return owner.command.join('\0');
    if(path===join(base,'stat'))return stat(records.get(owner.pid));
    for(const[tid,row]of records){const dir=join(taskRoot,String(tid));
      if(path===join(dir,'stat'))return stat(row);
      if(path===join(dir,'schedstat'))return `${row.runNs} ${row.runQueueWaitNs} ${row.timeslices}\n`;
      if(path===join(dir,'wchan'))return row.wchan+'\n';
    }
    assert.fail('No identity or counter read is authorized outside the fixed cohort: '+path);
  };
  const list=path=>{assert.equal(path,taskRoot);return recorded.inventory[['before','afterDiscovery','afterFinal','terminal'][lists++]].map(String);};
  return {sample:sampleOwnedHost({emulatorPid:owner.pid,avd:'sogrim_ci_38754139702_1',device:'emulator-5582'},{procRoot,read,list,expectedStartTicks:owner.startTicks}),reads,taskRoot,get lists(){return lists;}};
}

test('QA469 sample421 remains failed v4; prospective fixed-cohort v5 retains215 counters and outside6047 without inventing coverage',()=>{
  assert.equal(raw.length,95494);assert.equal(createHash('sha256').update(raw).digest('hex'),'37e9cbd3f65f572db09bd53e2012b4e5ff475ccc910ec70d4ace33ce303b666a');
  assert.equal(recorded.inventory.coverageVersion,4);assert.equal(recorded.inventory.coverageComplete,false);assert.deepEqual(recorded.coverage.unresolvedGaps,[{kind:'unmeasured-birth',tid:6047}]);
  const f=replay(),sample=f.sample;
  assert.equal(sample.inventory.coverageComplete,true,'an observation first made outside the closed counter cohort is retained without counter/worker credit');
  assert.equal(f.lists,4);assert.deepEqual(sample.threads,recorded.threads,'all215 original counter rows remain exact');
  assert.deepEqual(sample.identitiesAfterCounters,recorded.identitiesAfterCounters);assert.deepEqual(sample.finalIdentities,recorded.finalIdentities,'all original identities remain exact');
  for(const name of ['before','afterDiscovery','afterFinal','terminal'])assert.deepEqual(sample.inventory[name],recorded.inventory[name]);
  assert.deepEqual(sample.inventory.cohort,recorded.inventory.before);assert.equal(sample.inventory.coverageVersion,5);assert.equal(sample.inventory.scope,'observed-owned-cohort');
  assert.deepEqual(sample.coverage.observedOutsideCohort,[6047]);assert.deepEqual(sample.coverage.unresolvedGaps,[]);assert.equal(sample.coverage.survivorsVerified.length,215);
  assert.ok(!sample.threads.some(row=>row.pid===6047));assert.ok(!sample.finalIdentities.some(row=>row.pid===6047));assert.equal(f.reads.get(join(f.taskRoot,'6047','stat')),undefined);
  assert.equal(sample.inventory.identityContinuityProven,false);assert.equal(sample.inventory.allThreadsCoverageProven,false);assert.equal(sample.inventory.rendererRoleProven,false);
  const receipt={owner:sample.owner,samples:2,coverageVersion:5,coverageContract:'observed-owned-cohort-v5',coverageScope:'observed-owned-cohort',cohortSelection:'union-before-afterDiscovery',inventoryAtomic:false,lifetimeCoverageProven:false,identityContinuityProven:false,allThreadsCoverageProven:false,rendererRoleProven:false,hostCaptureWindowComplete:false,captureComplete:false},prior=new Map();
  recordHostInventory(receipt,sample,prior);recordHostInventory(receipt,replay().sample,prior);
  assert.equal(requireHostInventoryCoverage(receipt),true);assert.equal(receipt.survivorsVerified,430);assert.equal(receipt.nonMainSurvivorsVerified,428);assert.equal(receipt.cohortTasksTargeted,430);assert.equal(receipt.observedOutsideCohort,2);assert.equal(receipt.samplesWithOutsideCohort,2);
  assert.equal(receipt.hostCaptureWindowComplete,false,'prospective frame validity cannot retroactively supply an owned stop for the interrupted historical window');assert.equal(receipt.captureComplete,false);
});
