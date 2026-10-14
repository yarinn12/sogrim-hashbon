import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runOriginalTraceFinish,finalizeAdbClosure} from '../scripts/qa/android-renderer-ab/finalization.mjs';

async function baseline(t,replace){
 const directory=mkdtempSync(join(tmpdir(),'ab-finalize-control-')),file=join(directory,'old-guard.mjs');
 t.after(()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));unlinkSync(file);rmdirSync(directory);});
 const source=readFileSync(new URL('../scripts/qa/android-renderer-ab/finalization.mjs',import.meta.url),'utf8');
 const old=replace(source);assert.notEqual(old,source);writeFileSync(file,old);return import(pathToFileURL(file));
}
test('original trace finisher records incomplete capture and stops its owned observer after emulator exit; OLD precheck blocks it',async t=>{
 let finished=0;
 const options={ownerAlive:false,verifyLiveOwner:async()=>{throw Error('ENOENT /proc/owned-emulator/cmdline');},
   finishOriginal:async()=>{finished++;throw Error('original trace incomplete; owned observer stopped, raw report retained');}};
 await assert.rejects(runOriginalTraceFinish(options),/original trace incomplete/);assert.equal(finished,1);
 const old=await baseline(t,s=>s.replace('if(ownerAlive)await verifyLiveOwner();','await verifyLiveOwner();'));
 finished=0;await assert.rejects(old.runOriginalTraceFinish(options),/ENOENT/);assert.equal(finished,0);
});
test('live foreign or reused emulator PID still blocks any finisher action',async()=>{
 let finish=0;
 await assert.rejects(runOriginalTraceFinish({ownerAlive:true,verifyLiveOwner:async()=>{throw Error('foreign PID');},finishOriginal:async()=>{finish++;}}),/foreign PID/);
 assert.equal(finish,0);
});
test('missing ADB ownership is explicitly unconfirmed and never signalled; OLD silent return has no closure proof',async t=>{
 let signals=0,record;
 const options={ownerReceipt:null,initializationAttempted:true,verifyAndClose:async()=>{signals++;},requirePortFree:async()=>{},onRecord:r=>{record=r;}};
 await assert.rejects(finalizeAdbClosure(options),/closure is unconfirmed/);
 assert.equal(signals,0);assert.equal(record.closed,false);assert.equal(record.ownershipConfirmed,false);
 const old=await baseline(t,s=>s.replace('  const record={closed:false,ownershipConfirmed:Boolean(ownerReceipt),initializationAttempted};','  if(!ownerReceipt)return;\n  const record={closed:false,ownershipConfirmed:Boolean(ownerReceipt),initializationAttempted};'));
 record=undefined;await old.finalizeAdbClosure(options);assert.equal(record,undefined);
});
test('ADB closure requires verified owner and free port; verification or port failures retain a terminal record',async()=>{
 for(const failure of ['owner','port',null]){
  let record,verified=0;const owner={id:'original'};
  const options={ownerReceipt:owner,initializationAttempted:true,
    verifyAndClose:async actual=>{assert.equal(actual,owner);verified++;if(failure==='owner')throw Error('reused ADB PID');},
    requirePortFree:async()=>{if(failure==='port')throw Error('foreign listener');},onRecord:r=>{record=r;}};
  if(failure)await assert.rejects(finalizeAdbClosure(options));else await finalizeAdbClosure(options);
  assert.equal(verified,1);assert.equal(record.closed,!failure);assert.equal(record.ownershipConfirmed,true);
 }
 let record,signals=0;
 await finalizeAdbClosure({ownerReceipt:null,initializationAttempted:false,verifyAndClose:async()=>{signals++;},requirePortFree:async()=>{},onRecord:r=>{record=r;}});
 assert.equal(record.closed,true);assert.equal(record.initializationAttempted,false);assert.equal(signals,0);
});
