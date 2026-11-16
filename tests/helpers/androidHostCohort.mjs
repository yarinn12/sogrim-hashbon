import assert from 'node:assert/strict';
import {join} from 'node:path';
import {sampleOwnedHost} from '../../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

// Synthetic proc controls only. Outside-cohort rows exist in this model for a
// later frame, but the collector must not read them in an earlier late scan.
export const ownerTid=3441,workerTid=3450,lateTid=3460;
export function cohortFrame({inventories=Array(4).fill([ownerTid,workerTid]),counterError,records={}}={}){
  const root=join('cohort-test-proc'),base=join(root,String(ownerTid)),taskRoot=join(base,'task'),reads=[];let scans=0;
  const rows=new Map([ownerTid,workerTid,lateTid].map((tid,index)=>[tid,{pid:tid,name:index?'':'qemu-system-x86',state:'S',startTicks:String(12345+index),userTicks:'3',systemTicks:'4',runNs:'100',runQueueWaitNs:'20',timeslices:'3',wchan:'futex_wait',...records[tid]}]));
  const stat=row=>{const fields=Array(40).fill('0');fields[10]=row.userTicks;fields[11]=row.systemTicks;fields[18]=row.startTicks;return `${row.pid} (${row.name}) ${row.state} ${fields.join(' ')}\n`;};
  const read=path=>{
    reads.push(path);
    if(path===join(base,'cmdline'))return ['/sdk/emulator/qemu-system-x86_64-headless','-avd','sogrim_ci_cohort_1','-port','5582',''].join('\0');
    if(path===join(base,'stat'))return stat(rows.get(ownerTid));
    for(const[tid,row]of rows){const folder=join(taskRoot,String(tid));
      if(path===join(folder,'stat'))return stat(row);
      if(path===join(folder,'schedstat')){
        if(counterError?.tid===tid)throw Object.assign(new Error('Synthetic scheduling read failure'),{code:counterError.code});
        return `${row.runNs} ${row.runQueueWaitNs} ${row.timeslices}\n`;
      }
      if(path===join(folder,'wchan'))return row.wchan+'\n';
    }
    assert.fail('No synthetic identity for requested path '+path);
  };
  const list=path=>{assert.equal(path,taskRoot);return inventories[scans++].map(String);};
  const sample=sampleOwnedHost({emulatorPid:ownerTid,avd:'sogrim_ci_cohort_1',device:'emulator-5582'},{procRoot:root,read,list,expectedStartTicks:'12345'});
  return {sample,reads,taskRoot};
}
export function cohortSummary(owner){return{owner,samples:2,coverageVersion:5,coverageContract:'observed-owned-cohort-v5',coverageScope:'observed-owned-cohort',cohortSelection:'union-before-afterDiscovery',inventoryAtomic:false,lifetimeCoverageProven:false,identityContinuityProven:false,allThreadsCoverageProven:false,rendererRoleProven:false};}
