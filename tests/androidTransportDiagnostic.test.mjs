import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {SOURCE,TOOLS,BRANCH,CERT_SHA,ARMS,requireInvocation,compareConfiguration,inspectArm,summarizeArms,verifyCertificate,executeControlledArms} from '../scripts/qa/android-transport-diagnostic/contract.mjs';
import {readOwner,guardedAdb,installAudit,cleanupOwned} from '../scripts/qa/android-transport-diagnostic/owned.mjs';
import {verifyTransport,verifySchema} from '../scripts/qa/android-transport-diagnostic/transport.mjs';
const workflow=readFileSync(new URL('../.github/workflows/android-transport-diagnostic-7d6.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
const asg=readFileSync(new URL('./fixtures/android-native-asg-host-38724147635.txt',import.meta.url),'utf8');
// Explicitly synthetic pipe selection: it tests the gate, not SDK compatibility.
const pipe=asg.replaceAll('=asg','=pipe').replaceAll('="asg"','="pipe"').replaceAll('hw.gltransport = asg','hw.gltransport = pipe');
const guest=mode=>({'ro.boot.hardware.gltransport':mode,'ro.boot.qemu.gltransport.name':mode,'ro.boot.qemu.gltransport':'','ro.hardware.egl':'emulation','ro.hardware.gralloc':'ranchu'});
test('actual ASG evidence and synthetic pipe evidence require the exact intended path and same capabilities',()=>{
  assert.equal(verifyTransport(asg,guest('asg'),'asg').verified,true);
  assert.equal(verifyTransport(pipe,guest('pipe'),'pipe').transport,'pipe');
  for(const [log,props,mode] of [[asg,guest('asg'),'pipe'],[pipe,guest('pipe'),'asg'],[pipe,guest('asg'),'pipe'],[asg,guest('asg'),'auto']])assert.throws(()=>verifyTransport(log,props,mode));
  for(const log of [pipe.replace('GlDirectMem = 1','GlDirectMem = 0'),pipe.replace('HasSharedSlotsHostMemoryAllocator = 1','HasSharedSlotsHostMemoryAllocator = 0'),pipe.replace('1048576','2097152'),pipe+'\nINFO | hw.gltransport = asg',pipe+'\ngltransport fallback',pipe.replace('gles_mode_selected:swiftshader','gles_mode_selected:host')])assert.throws(()=>verifyTransport(log,guest('pipe'),'pipe'));
  assert.throws(()=>verifySchema(Buffer.from('unsupported SDK schema')),/schema differs/);
});
test('single original Debug signer is pinned, including rejection of a second signer',()=>{
  const cert='Signer #1 certificate SHA-256 digest: '+CERT_SHA+'\n';assert.equal(verifyCertificate(cert).verified,true);
  for(const text of ['',cert.replace(CERT_SHA,'0'.repeat(64)),cert+cert.replace('#1','#2')])assert.throws(()=>verifyCertificate(text));
});
test('only transport and explicit AVD identity fields can differ',()=>{
  const base={AvdId:'owned-a','avd.ini.displayname':'owned-a','hw.gltransport':'asg','hw.ramSize':'4096','image.sysdir.1':'same'};
  assert.equal(compareConfiguration(base,{...base,AvdId:'owned-b','avd.ini.displayname':'owned-b','hw.gltransport':'pipe'},'pipe').verified,true);
  for(const delta of [{'hw.ramSize':'8192'},{'image.sysdir.1':'new'},{extra:'hidden'},{'hw.gltransport':'asg'}])assert.throws(()=>compareConfiguration(base,{...base,'hw.gltransport':'pipe',...delta},'pipe'));
});
const context={pid:444,startTicks:'100',avd:'sogrim_ci_123_1_a1',sdk:resolve('synthetic-sdk'),audit:'unused'};
const cmd=[join(context.sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'),'-avd',context.avd,'-port','5582','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory','4096','-cores','2'];
function stat(ticks='100'){const rest=Array(40).fill('0');rest[18]=ticks;return '444 (qemu-system-x86) S '+rest.join(' ');}
function proc(args=cmd,ticks='100'){return path=>String(path).endsWith('cmdline')?args.join('\0')+'\0':stat(ticks);}
test('actual PID/startTicks and full owned command are verified before touching a process',()=>{
  assert.equal(readOwner(context,{read:proc()}).pid,444);
  for(const args of [[...cmd.slice(0,-1),'4'],cmd.map(x=>x===context.avd?'sogrim_ci_999_1_a1':x),cmd.map(x=>x==='5582'?'5584':x),['/foreign/qemu-system-x86_64-headless',...cmd.slice(1)],cmd.concat('-avd',context.avd)])assert.throws(()=>readOwner(context,{read:proc(args)}));
  assert.throws(()=>readOwner(context,{read:proc(cmd,'101')}),/reused PID/);
  let reads=0;assert.throws(()=>readOwner(context,{read:path=>String(path).endsWith('cmdline')?cmd.join('\0'):stat(++reads===1?'100':'101')}),/reused PID/);
});
test('foreign PID, serial and global server commands are denied before execution and audited',()=>{
  for(const args of [['-s','emulator-5584','shell','input','tap','1','1'],['kill-server'],['-s','emulator-5582','kill-server']]){
    const rows=[];let calls=0;assert.throws(()=>guardedAdb(context,args,{},()=>{calls++;},{owner:()=>context,record:r=>rows.push(r)}));assert.equal(calls,0);assert.equal(rows[0].executed,false);
  }
  const rows=[];let calls=0;assert.throws(()=>guardedAdb(context,['-s','emulator-5582','emu','kill'],{},()=>{calls++;},{owner:()=>{throw Error('reused PID');},record:r=>rows.push(r)}));assert.equal(calls,0);assert.match(rows[0].guardError,/reused PID/);
});
test('original command result and binary stdout survive audit; ownership loss after execution stays failure',()=>{
  const result={status:7,stdout:Buffer.from([0,255]),stderr:'original failure',signal:null},rows=[];
  assert.equal(guardedAdb(context,['-s','emulator-5582','exec-out','screencap','-p'],{encoding:null},()=>result,{owner:()=>context,record:r=>rows.push(r)}),result);
  assert.equal(rows[0].exitCode,7);assert.equal(rows[0].executed,true);assert.ok(rows[0].after);
  let checks=0;assert.throws(()=>guardedAdb(context,['-s','emulator-5582','shell','getprop'],{},()=>result,{owner:()=>{if(++checks===2)throw Error('PID changed');return context;},record:r=>rows.push(r)}),/PID changed/);assert.equal(rows.at(-1).exitCode,7);
});
test('child-process instrumentation audits actual delegates and leaves unrelated commands unchanged',()=>{
  const rows=[],result={status:0,stdout:'original'},child=new EventEmitter();child.pid=900;
  const fake={spawnSync:()=>result,spawn:()=>child},original=fake.spawnSync;
  const undo=installAudit(fake,context,{owner:()=>context,record:r=>rows.push(r)});
  assert.equal(fake.spawnSync(join(context.sdk,'platform-tools/adb'),['-s','emulator-5582','shell','getprop'],{}),result);
  assert.equal(rows.length,1);assert.equal(fake.spawnSync('git',['status'],{}),result);assert.equal(rows.length,1);
  assert.equal(fake.spawn(join(context.sdk,'platform-tools/adb'),['-s','emulator-5582','logcat'],{}),child);child.emit('close',1,null);assert.equal(rows.at(-1).exitCode,1);
  undo();assert.equal(fake.spawnSync,original);
});
test('actual cleanup stops only verified logcat and emulator, with original results and bounded wait',async()=>{
  let exited=false,now=0;const rows=[],signals=[];
  const child={exitCode:null,signalCode:null,kill(signal){signals.push(signal);this.signalCode=signal;return true;}};
  const identity={pid:900,startTicks:'200',command:['synthetic-adb','-s','emulator-5582','logcat']};
  const read=path=>{if(String(path).endsWith(join('900','stat')))return stat('200').replace(/^444 /,'900 ');if(String(path).endsWith('cmdline'))return identity.command.join('\0');if(exited)throw Object.assign(Error('gone'),{code:'ENOENT'});return stat();};
  const result=await cleanupOwned(context,{logcat:child,logcatIdentity:identity,owner:()=>context,read,record:r=>rows.push(r),clock:()=>now,wait:async ms=>{now+=ms;},run:(file,args,options)=>{assert.equal(file,join(context.sdk,'platform-tools/adb'));assert.deepEqual(args,['-s','emulator-5582','emu','kill']);assert.ok(options.timeout>0&&options.timeout<=15000);exited=true;return{status:0,stdout:'original stop',stderr:'',signal:null};}});
  assert.equal(result.complete,true);assert.equal(result.foreignProcessesSignalled,false);assert.deepEqual(signals,['SIGTERM']);assert.equal(rows.find(r=>r.action==='stop-owned-emulator').stdout,'original stop');
});
test('actual cleanup denies foreign/reused ownership before any signal or command',async()=>{
  for(const changed of ['emulator','logcat']){
    let signals=0,commands=0;const rows=[];
    await assert.rejects(cleanupOwned(context,{logcat:{exitCode:null,signalCode:null,kill(){signals++;return true;}},logcatIdentity:{pid:900,startTicks:'200',command:[]},owner:()=>{if(changed==='emulator')throw Error('reused PID');return context;},read:()=>stat('201').replace(/^444 /,'900 '),run:()=>{commands++;},record:r=>rows.push(r)}),/reused/);
    assert.equal(signals,0);assert.equal(commands,0);assert.equal(rows.at(-1).action,'cleanup-failed');
  }
});
test('actual cleanup preserves a failed stop and refuses an emulator that remains live',async()=>{
  const rows=[];await assert.rejects(cleanupOwned(context,{owner:()=>context,run:()=>({status:7,stdout:'failure',stderr:'refused'}),record:r=>rows.push(r)}),/stop failed/);assert.equal(rows.find(r=>r.action==='stop-owned-emulator').exitCode,7);
  let now=0;await assert.rejects(cleanupOwned(context,{owner:()=>context,read:()=>stat(),run:()=>({status:0}),record:()=>{},clock:()=>now,wait:async ms=>{now+=ms;}}),/remained live/);assert.equal(now,15000);
  assert.equal(summarizeArms([]).technicalExitCode,1);
});
function evidence(){return {id:'A1',transport:'asg',diagnostics:{source:SOURCE,ownershipVerified:true,diagnosticsComplete:true,continuousLogCaptured:true,anrHistoryReady:false,targetAppAnrLines:['Input dispatching timed out FocusEvent(hasFocus=true)']},matrix:{results:[{scale:1.5,orientation:'portrait',error:'Actual owned QA Activity foreground before rotation timed out',state:{screen:'home',fontScale:'1.5'},rotationReceipt:{commandApplications:0}}]},stacks:'DrawFrameTask::drawFrame WebViewFunctor::drawGl AddressSpaceStream::readFully rcCreateSyncKHR_enc',stageCodes:[{exitCode:1}],integrity:true};}
test('matching baseline requires the original failure phase and real graphics/ANR evidence',()=>{
  assert.equal(inspectArm(evidence()).matchesOriginal,true);
  for(const change of [e=>{e.matrix.results[0].state.screen='event';},e=>{e.matrix.results[0].rotationReceipt.commandApplications=1;},e=>{e.stacks='application busy';},e=>{e.diagnostics.targetAppAnrLines=[];}]){const e=evidence();change(e);assert.equal(inspectArm(e).matchesOriginal,false);}
  const e=evidence();e.integrity=false;assert.equal(inspectArm(e).valid,false);
});
test('inconclusive clean baseline is technical exit0 with no acceptance, and stops the sequence contract',()=>{
  const clean={...inspectArm(evidence()),targetAnr:false,matchesOriginal:false,commandFailure:false,clean:true};
  const r=summarizeArms([clean]);assert.equal(r.diagnosticOutcome,'INCONCLUSIVE_NO_BASELINE');assert.equal(r.technicalExitCode,0);assert.equal(r.nativeAcceptance,false);assert.equal(r.originalSourceGate,'FAILED');
});
test('actual sequence executes A1 only without baseline and preserves exceptions without running B',async()=>{
  for(const value of [{valid:true,matchesOriginal:false},{valid:false,matchesOriginal:true}]){
    const called=[];const results=await executeControlledArms(async arm=>{called.push(arm.id);return {...arm,...value};});assert.deepEqual(called,['A1']);assert.equal(results.length,1);
  }
  const called=[],progress=[];const results=await executeControlledArms(async arm=>{called.push(arm.id);if(arm.id==='B1')throw Error('lost ownership');return {...arm,valid:true,matchesOriginal:true};},rows=>progress.push(rows.length));
  assert.deepEqual(called,['A1','B1']);assert.deepEqual(progress,[1,2]);assert.match(results[1].error,/lost ownership/);assert.equal(results[1].valid,false);
});
test('actual sequence runs exactly one A1 B1 A2 and does not repeat an original ANR',async()=>{
  const called=[],a=inspectArm(evidence());const results=await executeControlledArms(async arm=>{called.push(arm.id);return {...a,...arm,...(arm.id==='B1'?{matchesOriginal:false,clean:true,targetAnr:false,commandFailure:false}:{})};});
  assert.deepEqual(called,['A1','B1','A2']);assert.equal(results.length,3);assert.equal(summarizeArms(results).technicalExitCode,1);
});
test('A1 B1 A2 association preserves baseline failures and never proves host deadlock',()=>{
  const a=inspectArm(evidence()),b={...a,id:'B1',transport:'pipe',matchesOriginal:false,targetAnr:false,commandFailure:false,clean:true};
  const r=summarizeArms([a,b,{...a,id:'A2'}]);assert.equal(r.diagnosticOutcome,'TRANSPORT_SENSITIVITY_OBSERVED');assert.equal(r.technicalExitCode,1);assert.equal(r.hostDeadlockProven,false);assert.equal(r.applicationExonerated,false);assert.equal(r.releaseAcceptance,false);
  assert.equal(summarizeArms([a,{...b,targetAnr:true,graphicsFocusAnr:true,clean:false,commandFailure:true},{...a,id:'A2'}]).diagnosticOutcome,'EXCLUSIVE_ASG_HYPOTHESIS_WEAKENED');
  assert.equal(summarizeArms([a,{...b,valid:false}]).diagnosticOutcome,'INVALID_ARM');
  assert.deepEqual(ARMS.map(a=>a.transport),['asg','pipe','asg']);
});
test('one reviewed first push on exact branch is the only workflow entry point',()=>{
  const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40)};
  requireInvocation(env);
  for(const delta of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_RUN_NUMBER:'2'},{GITHUB_RUN_NUMBER:undefined},{GITHUB_REPOSITORY:'foreign/repo'}])assert.throws(()=>requireInvocation({...env,...delta}));
  const expression=/^    if: \$\{\{ (.+) \}\}$/m.exec(workflow)?.[1];assert.ok(expression);
  const github={repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,run_attempt:1,run_number:1};assert.equal(runInNewContext(expression,{github}),true);
  for(const delta of [{repository:'foreign/repo'},{ref:'refs/heads/main'},{run_attempt:2},{run_number:2},{run_number:undefined}])assert.equal(runInNewContext(expression,{github:{...github,...delta}}),false);
  assert.ok(workflow.includes('branches: ['+BRANCH+']'));assert.ok(!/workflow_dispatch:|workflow_call:|continue-on-error|--retry|secrets\./.test(workflow));
});
test('workflow pins original APK/tools/SDK and standard runner, with no build or release path',()=>{
  for(const s of [SOURCE,TOOLS,'13501922018','ubuntu-24.04','timeout-minutes: 45','persist-credentials: false','if: always()'])assert.ok(workflow.includes(s),s);
  for(const s of ['assembleDebug','native:prepare','npm ci','cap copy','environment:','runs-on: macos','strategy:'])assert.ok(!workflow.includes(s),s);
  assert.ok(workflow.indexOf('apksigner" verify')<workflow.indexOf('runner.mjs'));
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));assert.equal(vercel.git.deploymentEnabled[BRANCH],false);
});
test('all diagnostic Bash snippets parse without expansion or execution',()=>{
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
  const blocks=[...workflow.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)].map(m=>m[1].split('\n').map(x=>x.replace(/^          /,'')).join('\n'));
  assert.ok(blocks.length>=3);for(const body of blocks){const r=spawnSync(bash,['-n'],{input:body,encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(r.status,0,r.stderr);assert.ok(!r.error);}
});
test('Python original archive, APK, SDK and raw-source negative controls run in normal suite',()=>{
  const python=process.platform==='win32'?join(process.env.USERPROFILE||'C:/Users/A','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3';
  if(process.platform==='win32')assert.ok(existsSync(python));
  const r=spawnSync(python,['-m','unittest','discover','-s','tests','-p','android_transport_artifact_test.py','-v'],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stderr,/Ran 11 tests/);
});
