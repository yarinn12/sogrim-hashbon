import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {captureHoldFailure,readOwnedHostKernelStacks} from '../scripts/qa/android-native-isolated/hold-failure-evidence.mjs';

const recorded=JSON.parse(readFileSync(new URL('./fixtures/android-native-hold-failure-qa462.json',import.meta.url),'utf8'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const procStat=(pid,ticks,name='RenderThread')=>`${pid} (${name}) S ${Array.from({length:19},(_,i)=>i===18?ticks:'0').join(' ')}`;

function fixture(t,changes={}){
  const root=mkdtempSync(join(tmpdir(),'sogrim-hold-evidence-'));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const options={source:recorded.source,device:'emulator-5582',avd:'sogrim_ci_38704274623_1',adbPath:'owned-adb',emulatorPid:4166,traceStartFile:'synthetic-trace',output:join(root,'evidence'),phase:'foreground-orientation',scale:2,orientation:'landscape',errorAtUtc:'2026-10-15T08:28:08.402Z',error:new Error('original recorded ANR timeout')};
  const state={ticks:'44499',time:0,appPid:7426,...changes},calls=[];
  const trace={...options,hostOwner:{pid:4166,startTicks:'44499'},captureStarted:true};
  const read=path=>{
    if(path===options.traceStartFile)return JSON.stringify({...trace,...state.trace});
    if(String(path).endsWith('cmdline'))return ['/sdk/emulator/emulator','-avd',state.hostAvd||options.avd,'-port','5582',''].join('\0');
    return procStat(4166,state.ticks,'emulator');
  };
  function run(binary,args,settings){
    calls.push({binary,args,settings});state.onCommand?.(binary,args,state);
    assert.ok(settings.timeout>0&&settings.timeout<=1500);
    if(binary!=='owned-adb')return state.hostResult||{status:0,stdout:JSON.stringify({available:false,kind:'kernel-only',unavailable:'permission denied'})};
    assert.deepEqual(args.slice(0,2),['-s',options.device]);const cmd=args.slice(2);
    if(state.fail===cmd.join(' '))return {status:1,stderr:'diagnostic unavailable',stdout:''};
    if(cmd[0]==='emu')return {status:0,stdout:(state.avd||options.avd)+'\nOK\n'};
    if(cmd[0]==='exec-out')return {status:0,stdout:state.invalidPng?png.subarray(0,16):png};
    if(cmd[1]==='dumpsys'){assert.deepEqual(cmd,['shell','dumpsys','window','displays']);return {status:0,stdout:state.window??recorded.window};}
    if(cmd[1]==='pidof')return {status:0,stdout:String(state.appPid)};
    assert.deepEqual(cmd,['shell','cat',`/proc/${state.appPid}/stat`]);return {status:0,stdout:procStat(state.appPid,'12345')};
  }
  return {options,state,calls,deps:{run,read,clock:()=>state.time}};
}

test('recorded ANR keeps exact screenshot, default-display focus, phase, source and stable app/host PID bindings',t=>{
  const f=fixture(t),r=captureHoldFailure(f.options,f.deps);
  assert.equal(r.originalError,f.options.error.stack);assert.equal(r.phase,'foreground-orientation');assert.equal(r.source,recorded.source);
  assert.equal(r.errorAtUtc,f.options.errorAtUtc);assert.equal(r.focus,recorded.focus);assert.equal(r.appBefore.pid,7426);assert.equal(r.appIdentityStable,true);
  assert.equal(r.hostOwner.pid,4166);assert.equal(r.hostOwner.startTicks,'44499');assert.equal(r.diagnosticOnly,true);
  assert.deepEqual(readFileSync(r.screenshot.path),png);assert.equal(readFileSync(join(f.options.output,'failure-display.txt'),'utf8'),recorded.window);
  assert.equal(JSON.parse(readFileSync(join(f.options.output,'failure-evidence.json'),'utf8')).originalError,r.originalError);
  assert.equal(r.hostKernelStacks.available,false);assert.equal(r.unavailable.length,0);
  assert.ok(f.calls.filter(c=>c.binary==='owned-adb').every(c=>['emu','exec-out','shell'].includes(c.args[2])));
  assert.ok(f.calls.every(c=>!c.args.includes('am')&&!c.args.includes('input')&&!c.args.includes('kill')&&!c.args.includes('settings')));
});

test('foreign/reused host, stale trace or different AVD never permit screenshot or debugger observation',t=>{
  for(const changes of [{ticks:'999'},{hostAvd:'foreign_avd'},{trace:{source:'0'.repeat(40)}},{avd:'foreign_avd'}]){
    const f=fixture(t,changes),r=captureHoldFailure(f.options,f.deps);
    assert.equal(r.originalError,f.options.error.stack);assert.ok(r.unavailable.length);assert.equal(r.screenshot,undefined);
    assert.ok(f.calls.every(c=>c.binary==='owned-adb'&&c.args[2]==='emu'));
  }
});

test('ownership change during screenshot halts further SDK/host observations while retaining original failure',t=>{
  const f=fixture(t,{onCommand(binary,args,s){if(args.includes('screencap'))s.ticks='999';}}),r=captureHoldFailure(f.options,f.deps);
  assert.equal(r.originalError,f.options.error.stack);assert.equal(r.focus,undefined);
  assert.ok(!f.calls.some(c=>c.args.includes('dumpsys')||c.binary!=='owned-adb'));assert.ok(r.unavailable.length);
});

test('unavailable screenshots, invalid PNG, missing host tooling and diagnostic storage are optional evidence',t=>{
  for(const changes of [{fail:'exec-out screencap -p'},{invalidPng:true},{hostResult:{status:null,error:new Error('bounded child timeout')}},{window:'unreadable displays'}]){
    const f=fixture(t,changes),r=captureHoldFailure(f.options,f.deps);assert.equal(r.originalError,f.options.error.stack);assert.ok(r.unavailable.length);
  }
  const f=fixture(t),r=captureHoldFailure(f.options,{...f.deps,mkdir(){throw new Error('evidence disk unavailable');}});
  assert.equal(r.originalError,f.options.error.stack);assert.ok(r.unavailable.length);assert.equal(f.calls.length,0);
});

test('failure diagnostics enforce an overall bound, never retry, and never call input or relaunch',t=>{
  const f=fixture(t,{onCommand(binary,args,s){s.time+=1600;}}),r=captureHoldFailure(f.options,f.deps);
  assert.ok(r.unavailable.length);assert.ok(r.elapsedMs<=8000);assert.equal(new Set(f.calls.map(c=>c.args.join(' '))).size,f.calls.length);
});

function hostFixture(changes={}){
  const options={source:recorded.source,device:'emulator-5582',avd:'sogrim_ci_38704274623_1',emulatorPid:4166,expectedStartTicks:'44499'};
  const state={ticks:'44499',reads:[],...changes};
  const read=path=>{
    path=String(path).replaceAll('\\','/');state.reads.push(path);
    if(path.endsWith('cmdline'))return ['/sdk/emulator/emulator','-avd',state.avd||options.avd,'-port','5582',''].join('\0');
    if(path.endsWith('/4166/stat'))return procStat(4166,state.ticks,'emulator');
    if(path.endsWith('/stat'))return procStat(Number(path.split(/[\\/]/).at(-2)),'222');
    if(state.denied)throw new Error('EACCES kernel stacks');
    if(state.reuse)state.ticks='999';return '[<0>] futex_wait\n';
  };
  return {options,state,deps:{platform:'linux',read,list:()=>['4166','5523','5524','5525','5526','5527','5528','5529','5530']}};
}

test('host backtrace reads at most eight kernel stacks under only the verified emulator task tree',()=>{
  const f=hostFixture(),r=readOwnedHostKernelStacks(f.options,f.deps);assert.equal(r.available,true);assert.equal(r.kind,'kernel-only');assert.equal(r.stacks.length,8);
  assert.ok(f.state.reads.filter(p=>p.endsWith('/stack')).every(p=>p.startsWith('/proc/4166/task/')));
  assert.ok(!f.state.reads.some(p=>p.includes('/5530/stack')));
});

test('host permission denial is unavailable; foreign ownership or PID reuse cannot supply accepted stacks',()=>{
  const denied=hostFixture({denied:true});assert.equal(readOwnedHostKernelStacks(denied.options,denied.deps).available,false);
  for(const changes of [{ticks:'999'},{avd:'foreign_avd'},{reuse:true}]){const f=hostFixture(changes);assert.throws(()=>readOwnedHostKernelStacks(f.options,f.deps),/foreign or reused/);}
  const f=hostFixture();assert.equal(readOwnedHostKernelStacks(f.options,{...f.deps,platform:'win32'}).available,false);assert.equal(f.state.reads.length,0);
});
