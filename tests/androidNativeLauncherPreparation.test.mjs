import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {prepareOwnedLauncher,inspectPreparationWindow} from '../scripts/qa/android-native-isolated/launcher-preparation.mjs';
import {assertEmulatorHealthy} from '../scripts/qa/android-native-isolated/emulator-health.mjs';

const recorded=JSON.parse(readFileSync(new URL('./fixtures/android-launcher-anr-qa459.json',import.meta.url),'utf8'));
const launcher='com.google.android.apps.nexuslauncher',target='com.sogrimhashbon.app.debug';
const targetAnr='10-14 22:45:18.000 685 2005 I am_anr: [0,999,com.sogrimhashbon.app.debug,123,Input dispatching timed out]';
const cleanWindow='WINDOW MANAGER DISPLAY CONTENTS\n  mCurrentFocus=null\n';

function fixture(t,changes={}){
  const root=mkdtempSync(join(tmpdir(),'sogrim-launcher-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const options={adbPath:'owned-adb',device:'emulator-5582',avd:'sogrim_ci_38648945193_1',source:recorded.provenance.source,emulatorPid:3441,output:join(root,'evidence')};
  const state={ticks:'12345',window:recorded.window,history:recorded.logcat,lastAnr:recorded.lastAnr,packages:'',stops:0,packageReads:0,...changes},calls=[];
  const read=path=>String(path).endsWith('cmdline')?['/sdk/emulator/emulator','-avd',state.hostAvd||options.avd,'-port','5582',''].join('\0'):
    `3441 (emulator) S ${Array.from({length:19},(_,i)=>i===18?state.ticks:'0').join(' ')}`;
  function run(binary,args,settings){
    assert.equal(binary,options.adbPath);assert.deepEqual(args.slice(0,2),['-s',options.device]);assert.equal(settings.timeout,20000);
    const cmd=args.slice(2);calls.push(cmd);state.onCommand?.(cmd,state);
    if(state.fail&&cmd.join(' ')===state.fail)return {status:1,stderr:'failed boundary command'};
    if(cmd[0]==='emu')return {status:0,stdout:(state.avd||options.avd)+'\nOK\n'};
    if(cmd[0]==='logcat'){assert.deepEqual(cmd,['logcat','-b','all','-d','-v','threadtime']);return {status:0,stdout:state.history};}
    if(cmd.join(' ')==='shell dumpsys window')return {status:0,stdout:state.window};
    if(cmd.join(' ')==='shell dumpsys activity lastanr')return {status:0,stdout:state.lastAnr};
    if(cmd[1]==='cmd'){assert.deepEqual(cmd,['shell','cmd','package','list','packages','--user','0',target]);state.packageReads++;return {status:0,stdout:state.packages};}
    assert.deepEqual(cmd,['shell','am','force-stop','--user','0',launcher]);
    state.stops++;if(!state.stillAnr)state.window=cleanWindow;
    if(state.postTargetAnr)state.history+='\n'+targetAnr;
    return {status:0,stdout:''};
  }
  return {root,options,state,calls,deps:{run,read},run:()=>prepareOwnedLauncher(options,{run,read})};
}

test('recorded Launcher ANR is removed once before installation with unchanged raw history and receipts',t=>{
  const f=fixture(t);
  // OLD uses the exact pre-fix health gate, which accepts this recorded boot.
  const result=process.env.ANDROID_QA_LAUNCHER_BASELINE==='1'?{ready:assertEmulatorHealthy(recorded.logcat).healthy}:f.run();
  assert.equal(result.ready,true,result.errors?.join('\n'));
  assert.doesNotMatch(f.state.window,/Application Not Responding:/,'recorded ANR still owns focus before Native measurement');
  assert.equal(f.state.stops,1);assert.equal(result.hostOwner.startTicks,'12345');
  assert.equal(readFileSync(join(f.options.output,'before-window.txt'),'utf8'),recorded.window);
  assert.equal(readFileSync(join(f.options.output,'before-logcat.txt'),'utf8'),recorded.logcat);
  assert.equal(readFileSync(join(f.options.output,'after-logcat.txt'),'utf8'),recorded.logcat);
  assert.equal(readFileSync(join(f.options.output,'before-last-anr.txt'),'utf8'),recorded.lastAnr);
  assert.equal(JSON.parse(readFileSync(join(f.options.output,'launcher-preparation.json'),'utf8')).ready,true);
  assert.ok(result.anrEvidence.allAnrLines.some(line=>line.includes('com.google.android.gms.persistent')));
  assert.equal(recorded.provenance.zipSha256,'18b603b31a01466f0a4139d1e15e9d018ddeb86c58dbba2c62d648fa441bdeb4');
});

test('normal or temporarily null focus needs no force-stop; exact package filtering ignores a prefix sibling',t=>{
  for(const window of [cleanWindow,'mCurrentFocus=Window{abc123 u0 com.android.settings/.Settings}\n']){
    const f=fixture(t,{window,packages:'package:'+target+'.other\n'}),r=f.run();
    assert.equal(r.ready,true,r.errors.join('\n'));assert.equal(f.state.stops,0);assert.equal(r.forceStopAttempted,false);
  }
});

test('target, foreign, ambiguous or hidden ANR windows cannot authorize any stop',t=>{
  for(const window of [recorded.window.replaceAll(launcher,target),recorded.window.replaceAll(launcher,'foreign.app'),recorded.window.replace('mCurrentFocus=','unreadable='),cleanWindow+'Window{abc u0 Application Not Responding: '+launcher+'}\n','mCurrentFocus=Window{abc u0 Application Not Responding: '+launcher+'.other}\n','mCurrentFocus=Window{abc u10 Application Not Responding: '+launcher+'}\n']){
    const f=fixture(t,{window}),r=f.run();assert.equal(r.ready,false);assert.equal(f.state.stops,0);assert.ok(r.errors.length);
  }
});

test('installed or newly installed debug app blocks preparation and is never force-stopped',t=>{
  for(const late of [false,true]){
    const f=fixture(t,{packages:late?'':'package:'+target+'\n',onCommand(cmd,s){if(late&&cmd[1]==='cmd'&&s.packageReads===1)s.packages='package:'+target+'\n';}}),r=f.run();
    assert.equal(r.ready,false);assert.equal(f.state.stops,0);assert.match(r.errors.join('\n'),/already installed/);
  }
});

test('any earlier or newly observed target ANR stays red before or after Launcher recovery',t=>{
  for(const kind of ['before','preAction','after','lastAnr']){
    const f=fixture(t,{postTargetAnr:kind==='after',onCommand(cmd,s){if(kind==='preAction'&&cmd[1]==='cmd'&&s.packageReads===1)s.history+='\n'+targetAnr;}});
    if(kind==='before')f.state.history+='\n'+targetAnr;
    if(kind==='lastAnr')f.state.lastAnr='Reason: Input dispatching timed out ('+target+'/MainActivity is not responding)';
    const r=f.run();assert.equal(r.ready,false);assert.match(r.errors.join('\n'),/Target (?:Android )?app.*ANR/);
    assert.equal(f.state.stops,kind==='after'?1:0);
  }
});

test('explicit owner inputs and matching actual host/AVD are mandatory before SDK mutation',t=>{
  for(const change of [{device:'physical-phone'},{avd:'unowned'},{source:'99b'},{emulatorPid:0},{adbPath:''}]){
    const f=fixture(t);assert.throws(()=>prepareOwnedLauncher({...f.options,...change},f.deps),/Require explicit/);assert.equal(f.calls.length,0);
  }
  for(const change of [{avd:'foreign_avd'},{hostAvd:'foreign_avd'}]){
    const f=fixture(t,change),r=f.run();assert.equal(r.ready,false);assert.equal(f.state.stops,0);
    assert.equal(f.calls.length,change.hostAvd?0:1);
  }
});

test('PID reuse or AVD ownership changes before mutation never adopt the replacement',t=>{
  for(const kind of ['ticks','avd']){
    const f=fixture(t,{onCommand(cmd,s){if(cmd[1]==='cmd'&&s.packageReads===1){if(kind==='ticks')s.ticks='99999';else s.avd='foreign_avd';}}}),r=f.run();
    assert.equal(r.ready,false);assert.equal(f.state.stops,0);assert.match(r.errors.join('\n'),/foreign|reused/i);
  }
});

test('changing focus, post-action ownership and SDK errors remain failures with no additional stop',t=>{
  for(const kind of ['focus','pidAfter','avdAfter','commandError','throws']){
    const f=fixture(t,{onCommand(cmd,s){
      if(kind==='focus'&&cmd.join(' ')==='shell dumpsys activity lastanr'&&s.packageReads===2)s.window=recorded.window.replaceAll(launcher,'foreign.app');
      if(cmd.includes('force-stop')){
        if(kind==='pidAfter')s.ticks='99999';
        if(kind==='avdAfter')s.avd='foreign_avd';
        if(kind==='throws')throw new Error('SDK pipe failed');
      }
    }});
    if(kind==='commandError'){
      const run=f.deps.run;f.deps.run=(binary,args,settings)=>args.includes('force-stop')?{status:0,stdout:'Permission Denial: cannot stop package'}:run(binary,args,settings);
    }
    const r=prepareOwnedLauncher(f.options,f.deps);assert.equal(r.ready,false);assert.ok(r.errors.length);
    assert.ok(r.commands.filter(row=>row.args.includes('force-stop')).length<=1);
  }
});

test('failed stop, remaining ANR, malformed evidence and a second invocation cannot pass or retry',t=>{
  for(const change of [{fail:'shell am force-stop --user 0 '+launcher},{stillAnr:true},{history:''},{packages:'Error: package service failed\n'}]){
    const f=fixture(t,change),r=f.run();assert.equal(r.ready,false);assert.ok(r.errors.length);
    assert.ok(f.calls.filter(cmd=>cmd.includes('force-stop')).length<=1);
    assert.ok(f.calls.every(cmd=>!cmd.includes('-c')&&!cmd.includes('kill')&&!cmd.includes('kill-all')&&!cmd.includes('clear')));
  }
  const f=fixture(t);assert.equal(f.run().ready,true);const count=f.calls.length;
  assert.throws(()=>f.run(),/EEXIST/);assert.equal(f.calls.length,count);assert.equal(f.state.stops,1);
});

test('workflow calls preparation exactly once immediately before APK install and retains later Native gates',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  assert.equal(workflow.match(/node scripts\/qa\/android-native-isolated\/launcher-preparation\.mjs/g)?.length,1);
  assert.match(workflow,/ANDROID_QA_EMULATOR_PID="\$\(cat artifacts\/android-native-isolated\/emulator\.pid\)" node scripts\/qa\/android-native-isolated\/launcher-preparation\.mjs\r?\n\s+"\$ADB_PATH" -s "\$ANDROID_QA_DEVICE" install android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.ok(workflow.indexOf('launcher-preparation.mjs')<workflow.indexOf('font-regression.mjs'));
  assert.match(workflow,/anr-diagnostics\.mjs/);assert.match(workflow,/acceptance\.mjs/);
});
