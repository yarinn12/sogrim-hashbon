import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createTelemetry,boundedUptimeAnchor,boundedGuestClockAnchor} from '../scripts/qa/android-native-isolated/pages-restart-telemetry.mjs';
import {SOURCE,TREE,instrumentDriver,instrumentPages,validatePrelude,targetDiagnosticComplete,diagnosticOutcome} from '../scripts/qa/android-native-isolated/pages-restart-materialize.mjs';
import {requireConfiguration,materializeHarness} from '../scripts/qa/android-native-isolated/pages-restart-diagnostic.mjs';
import {runTarget,armScale} from '../scripts/qa/android-native-isolated/pages-restart-target.mjs';
import {launchForOwnedOrientation} from '../scripts/qa/android-native-isolated/orientation.mjs';

function temporary(fn){const path=mkdtempSync(join(tmpdir(),'sogrim-restart-synthetic-'));return Promise.resolve().then(()=>fn(path)).finally(()=>rmSync(path,{recursive:true,force:true}));}
const before={atUtc:'2026-10-15T19:48:25.000Z',monotonicNs:'10000000000'},after={atUtc:'2026-10-15T19:48:25.040Z',monotonicNs:'10040000000'};
const bootId='12345678-1234-1234-1234-123456789abc',clockProbe=`${bootId}\n123.45 98.76\n${bootId}\n`;
test('bounded clock probe requires matching boot identity around uptime',()=>{
  assert.equal(boundedGuestClockAnchor(before,after,clockProbe).bootId,bootId);
  assert.throws(()=>boundedGuestClockAnchor(before,after,clockProbe.replaceAll(bootId,'bad')),/boot/);
  assert.throws(()=>boundedGuestClockAnchor(before,after,`${bootId}\n123.45 98.76\n87654321-1234-1234-1234-123456789abc`),/boot/);
});
test('clock anchor bounds the whole round trip plus guest quantization; no midpoint proof',()=>{
  const anchor=boundedUptimeAnchor(before,after,'5.00 3.20\n');
  assert.equal(anchor.hostMinusGuestLoNs,'4990000000');assert.equal(anchor.hostMinusGuestHiNs,'5040000000');assert.equal(anchor.usablePointAnchor,true);assert.equal(anchor.interpolationOrDriftBoundProven,false);assert.equal(anchor.hostGuestCausalAlignmentProven,false);
});
test('slow or wall-stepped anchors stay recorded and unusable',()=>{
  assert.equal(boundedUptimeAnchor(before,{...after,atUtc:'2026-10-15T19:48:26.000Z',monotonicNs:'11000000000'},'5.00 3.20').usablePointAnchor,false);
  assert.equal(boundedUptimeAnchor(before,{...after,atUtc:'2026-10-15T19:48:28.000Z'},'5.00 3.20').usablePointAnchor,false);
});
for(const raw of ['','5.0 3.20','5.000 3.20','garbage','5.00 3.20\nextra'])test('reject malformed uptime '+JSON.stringify(raw),()=>assert.throws(()=>boundedUptimeAnchor(before,after,raw)));
test('reject backwards host monotonic stamp',()=>assert.throws(()=>boundedUptimeAnchor(after,before,'5.00 3.20'),/regressed/));
for(const status of [0,1,null])test('ADB response retains actual exit/stdout/stderr without retry '+status,()=>temporary(path=>{
  let calls=0;const expected={status,stdout:'original stdout\n',stderr:'original stderr\n',error:status===null?new Error('spawn failed'):undefined};
  const journal=createTelemetry(path),args=['-s','emulator-5554','shell','input','keyevent','123'],options={encoding:'utf8'};
  const actual=journal.observedSpawnSync((command,gotArgs,gotOptions)=>{calls++;assert.equal(command,'synthetic-adb');assert.equal(gotArgs,args);assert.equal(gotOptions,options);return expected;},'synthetic-adb',args,options);
  assert.equal(actual,expected);assert.equal(calls,1);
  const rows=readFileSync(join(path,'commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,2);assert.equal(rows[1].data.requestSequence,rows[0].sequence);assert.equal(rows[1].data.status,status);assert.equal(rows[1].data.uiReadinessProven,false);assert.equal(readFileSync(join(path,rows[1].data.stdout.path),'utf8'),expected.stdout);
}));
test('command evidence cap fails before command rather than hiding dropped receipts',()=>temporary(path=>{
  let called=false;assert.throws(()=>createTelemetry(path,{cap:1}).observedSpawnSync(()=>{called=true;},'synthetic',[],{}),/cap/);assert.equal(called,false);
}));

test('instrumented actual driver executes unchanged ADB and correlated CDP responses',()=>temporary(async path=>{
  const original=readFileSync(new URL('../scripts/qa/android-native-isolated/driver.mjs',import.meta.url),'utf8');
  const source=instrumentDriver(original,'synthetic-telemetry').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const journal=createTelemetry(path);let calls=0;
  class Socket{listeners=new Map();constructor(){queueMicrotask(()=>this.listeners.get('open')?.({}));}addEventListener(name,fn){this.listeners.set(name,fn);}send(raw){const request=JSON.parse(raw);queueMicrotask(()=>this.listeners.get('message')({data:JSON.stringify({id:request.id,result:{result:{value:'synthetic ACK'}}})}));}close(){}}
  const api=new Function('spawnSync','process','record','observedSpawnSync','WebSocket','setTimeout','clearTimeout',source+';return {adb,Cdp};')(
    ()=>{calls++;return{status:0,stdout:'sogrim_ci_synthetic\n',stderr:''};},{env:{ANDROID_QA_DEVICE:'emulator-5554',ANDROID_QA_AVD:'sogrim_ci_synthetic',ADB_PATH:'synthetic-adb'}},journal.record,journal.observedSpawnSync,Socket,setTimeout,clearTimeout);
  api.adb(['shell','synthetic']);assert.equal(calls,2);
  const one=new api.Cdp('ws://synthetic-one'),two=new api.Cdp('ws://synthetic-two');assert.equal(await one.evaluate('synthetic-expression'),'synthetic ACK');assert.equal(await two.evaluate('second-expression'),'synthetic ACK');
  const rows=readFileSync(join(path,'commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse),sends=rows.filter(r=>r.kind==='cdp-send'),acks=rows.filter(r=>r.kind==='cdp-ack');
  assert.equal(sends.length,2);assert.equal(acks.length,2);assert.notEqual(sends[0].data.connection,sends[1].data.connection);
  for(const sent of sends)assert.equal(acks.filter(ack=>ack.data.connection===sent.data.connection&&ack.data.id===sent.data.id).length,1);
}));
test('instrumentation rejects changed or ambiguous frozen-source anchors',()=>{
  const driver=readFileSync(new URL('../scripts/qa/android-native-isolated/driver.mjs',import.meta.url),'utf8');assert.throws(()=>instrumentDriver(driver.replace('const result = spawnSync(adbPath,','const result = other(adbPath,'),'x'),/anchor/);
  assert.throws(()=>instrumentDriver(driver+driver,'x'),/anchor/);
  const pages=readFileSync(new URL('../scripts/qa/android-native-isolated/pages.mjs',import.meta.url),'utf8'),instrumented=instrumentPages(pages,'x','y');
  assert.ok(instrumented.includes('samples.length!==24||checks.some(check=>!check.ok)'));assert.ok(instrumented.includes('break pagesReplay'));assert.throws(()=>instrumentPages(pages.replace('[1,1.5,2]','[1,2]'),'x','y'),/anchor/);
});

for(const arm of ['A','B'])test('target '+arm+' stops at actual original foreground boundary before rotation',()=>temporary(async path=>{
  const previous={...process.env};process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');process.env.ANDROID_RESTART_TARGET_OUTPUT=path;
  try{
    const commands=[],sleeps=[],scale=armScale(arm),page={evaluate:async expression=>expression.includes('getCapabilities')?{fontScale:scale}:{width:411,height:866,orientation:'portrait',native:true,platform:'android'}};
    const adb=args=>{commands.push(args);if(args.includes('/proc/uptime'))return clockProbe;if(args.includes('displays'))return '  Display: mDisplayId=0\n    mCurrentFocus=Window{owned u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity}\n    mRotation=ROTATION_0\n    cur=1080x2400\n';if(args.includes('user-rotation'))return 'lock 0';if(args.includes('get'))return args.at(-1)==='accelerometer_rotation'?'0':'0';return '';};
    const report=await runTarget({adb,launch:async()=>page,waitFor:async fn=>{const value=await fn();assert.ok(value);return value;},sleep:async ms=>sleeps.push(ms),launchForOwnedOrientation},arm);
    assert.equal(report.foregroundBeforeRotationReached,true);assert.equal(report.rotationRequested,false);assert.equal(report.orientationReceipt.commandApplications,0);assert.equal(report.requestedScaleVerified,true);assert.equal(report.nativeAcceptance,false);assert.equal(report.error,undefined);assert.deepEqual(sleeps,[750]);
    assert.equal(report.clockAnchorsComplete,true);assert.equal(report.clockAnchors[0].bootId,report.clockAnchors[1].bootId);
    assert.equal(targetDiagnosticComplete(report),true);
    assert.ok(commands.some(c=>JSON.stringify(c)===JSON.stringify(['shell','settings','put','system','font_scale',String(scale)])));assert.equal(commands.filter(c=>c.includes('lock')).length,0);
  }finally{for(const key of ['ANDROID_RESTART_COMMAND_EVIDENCE','ANDROID_RESTART_TARGET_OUTPUT'])if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
}));
test('after-target anchor failure cannot pass closure with valid foreground and capabilities',()=>temporary(async path=>{
  const previous={...process.env};process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');process.env.ANDROID_RESTART_TARGET_OUTPUT=path;
  try{
    let clockReads=0;
    const adb=args=>{if(args.includes('/proc/uptime')){if(++clockReads===2)throw new Error('synthetic after-target anchor read failure');return clockProbe;}return '';};
    const orientation=async({onPage,adb})=>{onPage({evaluate:async()=>({fontScale:2})});try{adb(['shell','wm','user-rotation','lock','0']);}catch(error){error.rotationReceipt={commandApplications:0,observations:[{phase:'foreground-before-request'}]};throw error;}};
    const report=await runTarget({adb,launch:async()=>{},waitFor:async()=>{},sleep:async()=>{},launchForOwnedOrientation:orientation},'A');
    assert.equal(report.foregroundBeforeRotationReached,true);assert.equal(report.requestedScaleVerified,true);assert.equal(report.capabilityError,undefined);assert.equal(report.error,undefined);assert.equal(report.clockAnchors.length,1);assert.match(report.clockAnchorError,/after-target anchor read failure/);assert.equal(targetDiagnosticComplete(report),false);
    const outcome=diagnosticOutcome({errors:[],trace:{captureComplete:true},anr:{diagnosticsComplete:true,anrHistoryReady:true,targetAppAnrLines:[]},prelude:{matrixPassed:true,pagesPassed:true},target:report});
    assert.equal(outcome.exitCode,1,JSON.stringify({target:report,outcome}));assert.equal(outcome.diagnosticComplete,false);
  }finally{for(const key of ['ANDROID_RESTART_COMMAND_EVIDENCE','ANDROID_RESTART_TARGET_OUTPUT'])if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
}));
test('closure rejects each error and missing anchor, while wide valid anchors remain complete',()=>{
  const target={foregroundBeforeRotationReached:true,requestedScaleVerified:true,rotationRequested:false,clockAnchorsComplete:true,clockAnchors:[{label:'before-font-setting',bootId,usablePointAnchor:false},{label:'after-target-observation',bootId,usablePointAnchor:false}]};
  assert.equal(targetDiagnosticComplete(target),true);
  for(const field of ['error','clockAnchorError','capabilityError'])assert.equal(targetDiagnosticComplete({...target,[field]:'synthetic failure'}),false);
  assert.equal(targetDiagnosticComplete({...target,clockAnchors:[target.clockAnchors[0]]}),false);
  assert.equal(targetDiagnosticComplete({...target,clockAnchors:[...target.clockAnchors].reverse()}),false);
  assert.equal(targetDiagnosticComplete({...target,clockAnchors:[target.clockAnchors[0],{...target.clockAnchors[1],bootId:'other'}]}),false);
  const baseline={errors:[],trace:{captureComplete:true},anr:{diagnosticsComplete:true,anrHistoryReady:true,targetAppAnrLines:[]},prelude:{matrixPassed:true,pagesPassed:true},target};
  assert.equal(diagnosticOutcome(baseline).exitCode,0);assert.equal(diagnosticOutcome(baseline).nativeAcceptance,false);
  assert.equal(diagnosticOutcome({...baseline,anr:{...baseline.anr,anrHistoryReady:false}}).exitCode,1);
  assert.equal(diagnosticOutcome({...baseline,anr:{...baseline.anr,targetAppAnrLines:['synthetic target ANR']}}).exitCode,1);
  assert.equal(diagnosticOutcome({...baseline,errors:['synthetic observer failure']}).exitCode,1);
});
test('target foreground timeout remains a failed diagnostic with original receipt',()=>temporary(async path=>{
  const previous=process.env.ANDROID_RESTART_TARGET_OUTPUT,previousCommands=process.env.ANDROID_RESTART_COMMAND_EVIDENCE;process.env.ANDROID_RESTART_TARGET_OUTPUT=path;process.env.ANDROID_RESTART_COMMAND_EVIDENCE=join(path,'commands');
  try{
    const report=await runTarget({adb:args=>args.includes('/proc/uptime')?clockProbe:'',sleep:async()=>{},launch:async()=>({}),waitFor:async()=>{throw new Error('synthetic foreground timeout');},launchForOwnedOrientation},'A');
    assert.equal(report.foregroundBeforeRotationReached,false);assert.match(report.error,/foreground timeout/);assert.equal(report.orientationReceipt.commandApplications,0);assert.equal(report.nativeAcceptance,false);
  }finally{if(previous===undefined)delete process.env.ANDROID_RESTART_TARGET_OUTPUT;else process.env.ANDROID_RESTART_TARGET_OUTPUT=previous;if(previousCommands===undefined)delete process.env.ANDROID_RESTART_COMMAND_EVIDENCE;else process.env.ANDROID_RESTART_COMMAND_EVIDENCE=previousCommands;}
}));
test('exact original 37-file harness materializes; generated code parses and only two files differ',()=>temporary(path=>{
  const root=process.cwd(),git=args=>args[0]==='rev-parse'?Buffer.from(args[1]==='HEAD'?SOURCE:TREE):args[0]==='diff'?Buffer.from(''):execFileSync('git',['-C',root,...args]);
  // HEAD metadata is synthetic so this normal-suite test also runs on the later
  // tooling commit. All 37 input payloads remain the actual immutable c14 blobs.
  const harness=materializeHarness({root,output:path},git);assert.equal(readdirSync(harness).length,37);
  const bindings=JSON.parse(readFileSync(join(path,'harness-bindings.json'),'utf8'));assert.equal(bindings.bindings.filter(b=>b.instrumented).length,2);
  for(const item of bindings.bindings)if(!item.instrumented)assert.equal(item.originalSha256,item.generatedSha256);
  for(const name of ['driver.mjs','pages.mjs']){const checked=spawnSync(process.execPath,['--check',join(harness,name)],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);}
  assert.throws(()=>materializeHarness({root,output:join(path,'wrong-head')},args=>args[0]==='rev-parse'?Buffer.from('f'.repeat(40)):git(args)),/HEAD\/tree/);
  assert.throws(()=>materializeHarness({root,output:join(path,'dirty')},args=>args[0]==='diff'?Buffer.from('src/app.mjs\n'):git(args)),/unexpected changes/);
}));
test('prelude refuses missing holds, wrong order and false original checks',()=>{
  const matrix={results:[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>({scale,orientation,nativeHolds:[{}],checks:Array.from({length:36},()=>({ok:true}))})))},pages={samples:[1,1.5].flatMap(scale=>['portrait','landscape'].flatMap(orientation=>['home','event','notes','profile'].map(screen=>({scale,orientation,screen})))),checks:Array.from({length:203},()=>({ok:true}))};
  assert.equal(validatePrelude(matrix,pages).matrixPassed,true);assert.equal(validatePrelude(matrix,pages).pagesPassed,true);assert.equal(validatePrelude(matrix,pages).nativeAcceptance,false);
  for(const mutate of [m=>m.results[0].nativeHolds.pop(),m=>m.results[0].checks[0].ok=false,m=>m.results.pop()]){const copy=structuredClone(matrix);mutate(copy);assert.equal(validatePrelude(copy,pages).matrixPassed,false);}
  for(const mutate of [p=>p.samples.reverse(),p=>p.checks[0].ok=false,p=>p.samples.pop(),p=>p.checks.pop()]){const copy=structuredClone(pages);mutate(copy);assert.equal(validatePrelude(matrix,copy).pagesPassed,false);}
});
test('diagnostic configuration defaults to refusal without explicit reviewed invocation',()=>{
  const base={ANDROID_PAGES_RESTART_RUN:'reviewed-diagnostic-only',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',ANDROID_RESTART_SOURCE_ROOT:process.cwd(),ANDROID_RESTART_ARM:'A',ANDROID_QA_SOURCE:SOURCE,ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_synthetic',ADB_PATH:'synthetic-adb',ANDROID_HOME:'synthetic-sdk'};
  assert.equal(requireConfiguration(base,'linux').arm,'A');
  for(const [key,value]of [['ANDROID_PAGES_RESTART_RUN',''],['SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD',''],['ANDROID_QA_SOURCE','f'.repeat(40)],['ANDROID_RESTART_ARM','C'],['ANDROID_QA_DEVICE','physical-device'],['ANDROID_QA_AVD','user-avd']])assert.throws(()=>requireConfiguration({...base,[key]:value},'linux'));
  assert.throws(()=>requireConfiguration(base,'win32'),/Linux/);
});
