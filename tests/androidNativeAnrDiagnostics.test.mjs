import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const {assertNoTargetAppAnr,collectOwnedAnrDiagnostics}=await import(process.env.ANDROID_QA_ANR_TEST_MODULE||'../scripts/qa/android-native-isolated/anr-diagnostics.mjs');
const healthy='10-11 00:48:05.026 690 1636 I ActivityTaskManager: START u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity';
// Exact event lines from failed4acd SDK logcat; these are boundary controls,
// never Native acceptance or a claim that the ANR cause is repaired.
const actualAnr='10-11 00:45:49.134   690 14481 E ActivityManager: ANR in com.sogrimhashbon.app.debug (com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity)';
const actualWindow='10-11 00:45:48.071   690   815 I WindowManager: ANR in Window{9be07ca u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity}. Reason:Input dispatching timed out';
const foreign='10-11 00:41:49.494   690 3515 E ActivityManager: ANR in com.google.android.gms.persistent';
test('actual target-app ANR remains rejected after force-stop, relaunch and recovery',()=>{
  assert.throws(()=>assertNoTargetAppAnr(actualAnr+'\n'+actualWindow+'\n'+foreign+'\n'+healthy),error=>{assert.equal(error.anrEvidence.targetAppAnrLines.length,2);assert.equal(error.anrEvidence.allAnrLines.length,3);return /later recovery/.test(error.message);});
});
test('foreign ANRs and similar package prefixes remain in evidence without attribution to target',()=>{
  const prefix=actualAnr.replaceAll('com.sogrimhashbon.app.debug','com.sogrimhashbon.app.debugging'),window=actualWindow.replaceAll('com.sogrimhashbon.app.debug','foreign.app');
  const evidence=assertNoTargetAppAnr(foreign+'\n'+prefix+'\n'+window+'\n'+healthy);assert.equal(evidence.targetAppAnrLines.length,0);assert.equal(evidence.allAnrLines.length,3);
});
test('events-buffer target ANR is rejected and foreign events remain observable',()=>{
  const event='10-11 00:45:48.071 690 815 I am_anr: [0,14380,com.sogrimhashbon.app.debug,123,FocusEvent timeout]';
  assert.throws(()=>assertNoTargetAppAnr(event+'\n'+healthy),/Target Android app/);
  assert.equal(assertNoTargetAppAnr(event.replace('com.sogrimhashbon.app.debug','foreign.app')).allAnrLines.length,1);
});
function fixture(t,{last='<no ANR has occurred since boot>',history=healthy,wrongOwner=false,failedBugreport=false,missingHistory=false}={}){
  const root=mkdtempSync(join(tmpdir(),'sogrim-anr-diagnostic-'));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const out=join(root,'anr-diagnostics'),calls=[];mkdirSync(out);if(!missingHistory)writeFileSync(join(root,'logcat-live.log'),history);
  const config={adbPath:'owned-adb',device:'emulator-5582',avd:'sogrim_ci_control_1',source:'a'.repeat(40),output:out,run:(binary,args,options)=>{
    assert.equal(binary,'owned-adb');assert.deepEqual(args.slice(0,2),['-s','emulator-5582']);assert.ok(options.timeout<=180000);calls.push(args);
    if(args[2]==='emu')return {status:0,stdout:wrongOwner?'foreign_avd\nOK':'sogrim_ci_control_1\nOK'};
    if(args[2]==='bugreport'){if(failedBugreport)return {status:null,error:new Error('Bounded bugreport timeout'),stderr:'diagnostic failure'};writeFileSync(args[3],'boundary-only fake ZIP bytes');return {status:0,stdout:'Saved boundary-only bugreport'};}
    if(args[2]==='logcat')return {status:0,stdout:healthy};
    if(args[5]==='lastanr')return {status:0,stdout:last};
    return {status:0,stdout:'No entries found'};
  }};return {config,calls,out};
}
test('only a verified owned AVD can supply diagnostic data',t=>{
  const f=fixture(t,{wrongOwner:true}),r=collectOwnedAnrDiagnostics(f.config);assert.equal(r.ownershipVerified,false);assert.equal(f.calls.length,1);assert.match(r.error,/foreign or unreadable/);
  assert.throws(()=>collectOwnedAnrDiagnostics({...f.config,device:'physical-phone'}),/explicit owned/);assert.equal(f.calls.length,1);
});
test('healthy owned history captures scoped diagnostics without a bugreport or mutating device input',t=>{
  const f=fixture(t),r=collectOwnedAnrDiagnostics(f.config);assert.equal(r.diagnosticsComplete,true);assert.equal(r.continuousLogCaptured,true);assert.equal(r.anrHistoryReady,true);assert.equal(r.bugreportRequested,false);assert.equal(f.calls.length,5);
  assert.ok(f.calls.every(args=>['emu','shell','logcat'].includes(args[2])));assert.ok(!f.calls.some(args=>args.includes('kill')||args.includes('force-stop')||args.includes('settings')));
});
test('earlier target ANR requests retained bugreport and stays red after final log looks healthy',t=>{
  const f=fixture(t,{last:'ANR time: Oct11\nReason: FocusEvent timeout',history:actualAnr+'\n'+healthy}),r=collectOwnedAnrDiagnostics(f.config);
  assert.equal(r.diagnosticsComplete,true);assert.equal(r.bugreportRequested,true);assert.ok(r.bugreport.bytes>0);assert.equal(r.anrHistoryReady,false);assert.equal(r.targetAppAnrLines.length,1);assert.equal(f.calls.filter(args=>args[2]==='bugreport').length,1);
  assert.equal(JSON.parse(readFileSync(join(f.out,'anr-diagnostics.json'))).anrHistoryReady,false);
});
test('failed bounded bugreport and absent continuous history are retained and cannot pass collection',t=>{
  const f=fixture(t,{failedBugreport:true,missingHistory:true}),r=collectOwnedAnrDiagnostics({...f.config,jobStatus:'failure'});
  assert.equal(r.diagnosticsComplete,false);assert.equal(r.anrHistoryReady,false);assert.match(r.bugreportError,/not successfully retained/);assert.match(r.historyError,/absent/);assert.equal(f.calls.filter(args=>args[2]==='bugreport').length,1);
  assert.match(readFileSync(join(f.out,'bugreport.txt'),'utf8'),/diagnostic failure/);
});
test('foreign last-ANR and foreign historical events are retained without requesting a target bugreport on success',t=>{
  const f=fixture(t,{last:'ANR time: Oct11\nReason: Broadcast of Intent com.google.android.gms/.Receiver',history:foreign+'\n'+healthy}),r=collectOwnedAnrDiagnostics(f.config);
  assert.equal(r.anrHistoryReady,true);assert.equal(r.targetAppAnrLines.length,0);assert.equal(r.allAnrLines.length,1);assert.equal(r.bugreportRequested,false);assert.match(readFileSync(join(f.out,'last-anr.txt'),'utf8'),/com.google.android.gms/);
});
test('target ANR first observed in final snapshot still captures one bugreport before cleanup',t=>{
  const f=fixture(t),original=f.config.run;f.config.run=(binary,args,options)=>args[2]==='logcat'?{status:0,stdout:actualAnr+'\n'+healthy}:original(binary,args,options);
  const r=collectOwnedAnrDiagnostics(f.config);assert.equal(r.anrHistoryReady,false);assert.equal(r.bugreportRequested,true);assert.ok(r.bugreport.bytes>0);assert.equal(f.calls.filter(args=>args[2]==='bugreport').length,1);assert.ok(r.commands.some(command=>command.name==='logcat-post-bugreport'));
});
