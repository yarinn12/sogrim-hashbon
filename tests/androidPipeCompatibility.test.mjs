import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {SOURCE,TREE,TOOLS,BRANCH,CERT_SHA,CONFIG,PIPE,ORIGINAL_STAGES,OBSERVER_BLOBS,requireInvocation,verifyConfiguration,compareSdkBinaries,verifyCertificate,executePipe,runOriginalStages,readSdkReference,verifyObserverFiles,inspectCompatibility,summarizeCompatibility} from "../scripts/qa/android-pipe-compatibility/contract.mjs";
import {readOwner,guardedAdb,installAudit,cleanupOwned} from '../scripts/qa/android-pipe-compatibility/owned.mjs';
import {verifyTransport,verifySchema} from '../scripts/qa/android-pipe-compatibility/transport.mjs';
import {captureLoadedSdk} from '../scripts/qa/android-pipe-compatibility/loaded-sdk.mjs';
const workflow=readFileSync(new URL('../.github/workflows/android-pipe-compatibility-2d4.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
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
const context={pid:444,startTicks:'100',avd:'sogrim_ci_123_1_pipe',sdk:resolve('synthetic-sdk'),audit:'unused'};
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
  assert.equal(summarizeCompatibility(undefined).technicalExitCode,1);
});
test('all diagnostic Bash snippets parse without expansion or execution',()=>{
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
  const blocks=[...workflow.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)].map(m=>m[1].split('\n').map(x=>x.replace(/^          /,'')).join('\n'));
  assert.ok(blocks.length>=3);for(const body of blocks){const r=spawnSync(bash,['-n'],{input:body,encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(r.status,0,r.stderr);assert.ok(!r.error);}
});
test('Python original archive, APK, SDK and raw-source negative controls run in normal suite',()=>{
  const python=process.platform==='win32'?join(process.env.USERPROFILE||'C:/Users/A','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3';
  if(process.platform==='win32')assert.ok(existsSync(python));
  const r=spawnSync(python,['-m','unittest','discover','-s','tests','-p','android_pipe_compatibility_artifact_test.py','-v'],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});
  assert.equal(r.error,undefined);assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stderr,/Ran 14 tests/);
});

function binaries(){return {coverage:'emulator-elf-tree-v1',historicalBinaryComparison:false,files:['emulator/emulator','emulator/lib64/libsynthetic.so','emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'].map(path=>({path,resolvedPath:path,bytes:32,sha256:'a'.repeat(64)}))};}
test('SDK binary comparison rejects drift, missing coverage and redirected identities',()=>{
  assert.equal(compareSdkBinaries(binaries(),binaries()).verified,true);
  for(const change of [r=>{r.files[1].sha256='b'.repeat(64);},r=>{r.files.pop();},r=>{r.files[1].resolvedPath='foreign/lib.so';},r=>{r.historicalBinaryComparison=true;},r=>{r.files[1].path='emulator/../foreign.so';},r=>{r.files[1].bytes=33;}]){const r=binaries();change(r);assert.throws(()=>compareSdkBinaries(binaries(),r));}
});
function loadedFixture(){
  const context={pid:444,startTicks:'100',sdk:'/synthetic-sdk'},exe='/synthetic-sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless';
  const options={owner:()=>({pid:444,startTicks:'100'}),link:()=>exe,real:path=>path,read:()=>`1000-2000 r-xp 00000000 00:01 1 ${exe}\n2000-3000 r-xp 00000000 00:01 1 /synthetic-sdk/emulator/lib64/libsynthetic.so\n3000-4000 r-xp 00000000 00:01 1 /lib/system.so\n`,info:()=>({size:32n,ino:1n,mtimeNs:1n,ctimeNs:1n,isFile:()=>true}),elfHeader:()=>Buffer.from([0x7f,0x45,0x4c,0x46]),fileHash:async()=> 'a'.repeat(64)};
  return {context,options};
}
test('owned postboot exe/maps bind actual SDK ELF files to the A1 inventory',async()=>{
  const {context,options}=loadedFixture();let reads=0,snapshot;
  const r=await captureLoadedSdk(context,binaries(),binaries(),{...options,owner:()=>{reads++;return {pid:444,startTicks:'100'};},onSnapshot:s=>{snapshot=s;}});
  assert.equal(reads,3);assert.equal(r.verified,true);assert.equal(r.files.length,2);assert.equal(r.historicalBinaryComparison,false);assert.equal(r.lifetimeLoadedModuleCoverageProven,false);assert.ok(snapshot.rawMaps.includes('/lib/system.so'));
});
test('non-executable non-ELF guest image mappings are retained outside emulator binary coverage',async()=>{
  const {context,options}=loadedFixture(),image='/synthetic-sdk/system-images/android-36.1/google_apis_playstore/x86_64/system.img';
  const maps=options.read()+'4000-5000 rw-p 00000000 00:01 7 '+image+'\n';let hashes=0,snapshot;
  const r=await captureLoadedSdk(context,binaries(),binaries(),{...options,read:()=>maps,elfHeader:path=>path===image?Buffer.from('DATA'):options.elfHeader(path),fileHash:async path=>{assert.notEqual(path,image);hashes++;return options.fileHash(path);},onSnapshot:s=>{snapshot=s;}});
  assert.equal(r.verified,true);assert.equal(r.files.length,2);assert.equal(hashes,2);
  assert.deepEqual(r.nonEmulatorSdkDataMappings,[{path:image.slice(context.sdk.length+1),resolvedPath:image.slice(context.sdk.length+1),inode:'7',executableMapping:false,binaryIdentityCoverage:false}]);
  assert.equal(snapshot.rawMaps,maps);assert.equal(r.rawMaps,maps);
});
test('SDK ELF or executable mappings outside emulator coverage remain invalid',async()=>{
  const image='/synthetic-sdk/system-images/android-36.1/google_apis_playstore/x86_64/system.img';
  for(const [permissions,isElf] of [['r--p',true],['r-xp',false],['r-xp',true]]){
    const {context,options}=loadedFixture(),maps=options.read()+`4000-5000 ${permissions} 00000000 00:01 7 ${image}\n`;let hashes=0,snapshot;
    await assert.rejects(captureLoadedSdk(context,binaries(),binaries(),{...options,read:()=>maps,elfHeader:path=>path===image&&!isElf?Buffer.from('DATA'):options.elfHeader(path),fileHash:async path=>{hashes++;return options.fileHash(path);},onSnapshot:s=>{snapshot=s;}}),/outside emulator/);
    assert.equal(hashes,0);assert.equal(snapshot.rawMaps,maps);
  }
});
test('loaded SDK identity rejects absent maps/exe, missing ELF coverage and redirected paths',async()=>{
  for(const change of [o=>{o.read=()=>'';},o=>{o.link=()=>'/foreign/emulator';},o=>{o.real=p=>p.includes('libsynthetic')?'/foreign/library.so':p;},o=>{o.fileHash=async()=> 'b'.repeat(64);},o=>{o.info=()=>({size:32n,ino:2n,isFile:()=>true});},o=>{o.read=()=>{throw Error('maps unavailable');};}]){
    const {context,options}=loadedFixture();change(options);await assert.rejects(captureLoadedSdk(context,binaries(),binaries(),options));
  }
  const {context,options}=loadedFixture(),partial=binaries();partial.files[1]={...partial.files[1],path:'emulator/lib64/another.so',resolvedPath:'emulator/lib64/another.so'};
  await assert.rejects(captureLoadedSdk(context,partial,partial,options),/absent from fingerprint/);
});
test('PID reuse during proc snapshot is rejected before SDK file hashing',async()=>{
  const {context,options}=loadedFixture();let guards=0,hashes=0;
  await assert.rejects(captureLoadedSdk(context,binaries(),binaries(),{...options,owner:()=>{if(++guards===2)throw Error('reused PID');return context;},fileHash:async()=>{hashes++;return 'a'.repeat(64);}}),/reused PID/);
  assert.equal(hashes,0);
});

function cleanEvidence(){
  const provenance={sourceCommit:SOURCE,sourceTree:TREE};
  return {integrity:true,selection:{verified:true,transport:'pipe'},diagnostics:{source:SOURCE,ownershipVerified:true,diagnosticsComplete:true,continuousLogCaptured:true,anrHistoryReady:true,targetAppAnrLines:[]},
    matrix:{provenance,results:[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>({scale,orientation,checks:Array.from({length:36},()=>({ok:true}))})))},
    pages:{provenance,samples:Array.from({length:24},()=>({})),checks:Array.from({length:325},()=>({ok:true}))},journey:{provenance,checks:Array.from({length:8},()=>({ok:true})),exceptions:[]},acceptance:{provenance,ready:true},
    font:{provenance,ready:true,actualGuardResults:{root:false,rem:false,brand:false}},geometry:{provenance,ready:true,checks:Array.from({length:4},()=>({ok:true}))},healthBefore:{source:SOURCE,healthy:true},healthAfter:{source:SOURCE,healthy:true},stageCodes:ORIGINAL_STAGES.map(label=>({label,exitCode:0,executed:true}))};
}
test('the single Pipe attempt executes directly without any ASG baseline or reproduction',async()=>{
  const calls=[],result=await executePipe(async arm=>{calls.push(arm);return {...inspectCompatibility(cleanEvidence()),...arm};});
  assert.deepEqual(calls,[{id:'PIPE',transport:'pipe'}]);assert.equal(result.compatible,true);assert.equal(summarizeCompatibility(result).compatibilityOutcome,'PIPE_COMPATIBILITY_OBSERVED');
  assert.equal(summarizeCompatibility(result).asgArmExecuted,false);assert.equal(summarizeCompatibility(result).causalTransportComparisonPerformed,false);
});
test('Pipe execution never retries, falls back or converts an exception into success',async()=>{
  let calls=0;const result=await executePipe(async()=>{calls++;throw Error('Actual Pipe capability missing');});
  assert.equal(calls,1);assert.equal(result.valid,false);assert.equal(result.targetAnr,null);assert.equal(result.targetAnrHistoryAvailable,false);assert.match(result.error,/Pipe capability missing/);assert.equal(summarizeCompatibility(result).technicalExitCode,1);
});
test('all original workload stages run once even after a real font or acceptance exit failure',async()=>{
  for(const failed of ['font-regression','acceptance']){
    const called=[],results=await runOriginalStages(async label=>{called.push(label);return {label,executed:true,exitCode:label===failed?1:0};});
    assert.deepEqual(called,['font-regression','acceptance','geometry-regression','health-after']);assert.equal(results.find(r=>r.label===failed).exitCode,1);assert.equal(results.length,4);
  }
});
test('lost ownership or unexecuted workload stops without another command',async()=>{
  for(const failure of [{ownershipLost:true,executed:true},{executed:false}]){
    const called=[];await assert.rejects(runOriginalStages(async label=>{called.push(label);return {label,exitCode:1,...failure};}),/Owned workload scope lost/);assert.deepEqual(called,['font-regression']);
  }
});
test('complete original matrix holds,24pages325checks,journey8,negative controls and health are mandatory',()=>{
  assert.equal(inspectCompatibility(cleanEvidence()).compatible,true);
  const mutations=[e=>{e.matrix.results[2].checks.pop();},e=>{e.matrix.results[2].error='Real cold-hold foreground timeout';},e=>{e.matrix.results[2].orientation='landscape';},e=>{e.pages.samples.pop();},e=>{e.pages.checks.pop();},e=>{e.pages.checks[0].ok=false;},e=>{e.journey.checks.pop();},e=>{e.journey.exceptions.push('real failure');},e=>{e.font.actualGuardResults.rem=true;},e=>{e.font.ready=false;},e=>{e.geometry.checks.pop();},e=>{e.geometry.checks[0].ok=false;},e=>{e.healthBefore.healthy=false;},e=>{e.healthAfter.source='f'.repeat(40);},e=>{e.acceptance.ready=false;},e=>{e.stageCodes.pop();},e=>{e.stageCodes.push({...e.stageCodes[0]});}];
  for(const mutate of mutations){const e=cleanEvidence();mutate(e);assert.equal(inspectCompatibility(e).compatible,false,mutate.toString());assert.equal(summarizeCompatibility(inspectCompatibility(e)).technicalExitCode,1);}
});
test('ANR history and command failures stay failed after later functional recovery',()=>{
  for(const mutate of [e=>{e.diagnostics.targetAppAnrLines=['actual ANR'];},e=>{e.diagnostics.anrHistoryReady=false;},e=>{e.stageCodes[1].exitCode=1;},e=>{e.stageCodes[1].signal='SIGTERM';},e=>{e.stageCodes[1].error='real error';},e=>{e.stageCodes[1].executed=false;}]){
    const e=cleanEvidence();mutate(e);const result=inspectCompatibility(e);assert.equal(result.compatible,false);assert.equal(summarizeCompatibility(result).technicalExitCode,1);
  }
});
test('missing source,ownership,continuous capture or SDK-integrity invalidates compatibility',()=>{
  for(const mutate of [e=>{e.integrity=false;},e=>{e.selection.transport='asg';},e=>{e.selection.verified=false;},e=>{e.diagnostics.source='0'.repeat(40);},e=>{e.diagnostics.ownershipVerified=false;},e=>{e.diagnostics.continuousLogCaptured=false;},e=>{delete e.diagnostics.targetAppAnrLines;},e=>{e.matrix.provenance={sourceCommit:SOURCE,sourceTree:'0'.repeat(40)};}]){
    const e=cleanEvidence();mutate(e);assert.equal(inspectCompatibility(e).valid,false);assert.equal(summarizeCompatibility(inspectCompatibility(e)).compatibilityOutcome,'INVALID_PIPE_ENVIRONMENT');
  }
});
test('a green diagnostic cannot grant Native/source/release or causal acceptance',()=>{
  const result=inspectCompatibility(cleanEvidence()),summary=summarizeCompatibility(result);
  assert.equal(summary.technicalExitCode,0);assert.equal(summary.nativeAcceptance,false);assert.equal(summary.releaseAcceptance,false);assert.equal(summary.originalSourceGate,'FAILED');assert.equal(summary.applicationExonerated,false);assert.equal(summary.hostDeadlockProven,false);
  for(const delta of [{targetAnr:true},{commandFailure:true},{fullWorkload:false},{workloadComplete:false},{transport:'asg'},{id:'A1'},{source:'0'.repeat(40)}])assert.equal(summarizeCompatibility({...result,...delta}).technicalExitCode,1);
});
test('Pipe config retains original image,renderer dimensions,memory,cores and transport buffers',()=>{
  const config={...CONFIG,'image.sysdir.1':'system-images/android-36.1/google_apis_playstore/x86_64/'};assert.equal(verifyConfiguration(config).verified,true);
  for(const delta of [{'hw.gltransport':'asg'},{'hw.ramSize':'8192'},{'hw.cpu.ncore':'4'},{'image.sysdir.1':'system-images/android-36/google_apis/x86_64/'},{'hw.gltransport.asg.dataRingSize':'65536'},{'hw.lcd.density':'160'}])assert.throws(()=>verifyConfiguration({...config,...delta}));
  assert.throws(()=>readOwner({...context,avd:'sogrim_ci_123_1_a1'},{read:proc()}),'consumed arm identities cannot be adopted as this Pipe run');
});
test('actual recorded SDK reference and reviewed observer files are immutable prerequisites',()=>{
  const bytes=readFileSync(new URL('../scripts/qa/android-pipe-compatibility/reference-sdk-binaries.json',import.meta.url)),reference=readSdkReference(bytes);
  assert.equal(reference.files.length,127);assert.equal(reference.referenceRun,42266716697);assert.equal(reference.historical2d4BinaryComparisonProven,false);assert.throws(()=>readSdkReference(Buffer.concat([bytes,Buffer.from(' ')])));
  const files=Object.fromEntries(Object.keys(OBSERVER_BLOBS).map(path=>[path,readFileSync(new URL('../'+path,import.meta.url))]));assert.equal(verifyObserverFiles(files).verified,true);
  for(const path of Object.keys(files))assert.throws(()=>verifyObserverFiles({...files,[path]:Buffer.concat([files[path],Buffer.from(' ')])}));
  const changed=structuredClone(reference);changed.files[0].sha256='0'.repeat(64);assert.throws(()=>compareSdkBinaries(reference,changed));
});
test('first creation on exact new branch is the only entry; updates,reruns and foreign events fail closed',()=>{
  const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_SHA:'a'.repeat(40)};
  const event={created:true,deleted:false,forced:false,before:'0'.repeat(40),after:env.GITHUB_SHA,ref:env.GITHUB_REF,repository:{full_name:env.GITHUB_REPOSITORY}};requireInvocation(env,event);
  for(const delta of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_RUN_NUMBER:'2'},{GITHUB_REF:'refs/heads/main'}])assert.throws(()=>requireInvocation({...env,...delta},event));
  for(const delta of [{created:false},{forced:true},{deleted:true},{before:'b'.repeat(40)},{after:'b'.repeat(40)},{ref:'refs/heads/main'},{repository:{full_name:'foreign/repo'}}])assert.throws(()=>requireInvocation(env,{...event,...delta}));
  const expression=/^    if: \$\{\{ (.+) \}\}$/m.exec(workflow)?.[1];assert.ok(expression);
  const github={repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,run_attempt:1,run_number:1,event};assert.equal(runInNewContext(expression,{github}),true);
  for(const delta of [{run_attempt:2},{run_number:2},{ref:'refs/heads/main'},{event:{...event,created:false}},{event:{...event,forced:true}}])assert.equal(runInNewContext(expression,{github:{...github,...delta}}),false);
});
test('workflow and controller pin original2d4 APK/tools, one standard45min Pipe and isolated observer',()=>{
  for(const value of [SOURCE,TOOLS,'13534285250','ubuntu-24.04','timeout-minutes: 45','persist-credentials: false','if: always()','androidPipeCompatibility.test.mjs'])assert.ok(workflow.includes(value),value);
  assert.ok(workflow.includes('branches: ['+BRANCH+']'));assert.ok(!/workflow_dispatch:|workflow_call:|continue-on-error|--retry|secrets\.|assembleDebug|npm ci|cap copy|environment:|strategy:/.test(workflow));
  const controller=readFileSync(new URL('../scripts/qa/android-pipe-compatibility/runner.mjs',import.meta.url),'utf8');
  assert.ok(controller.includes('executePipe(async arm=>'));assert.ok(!/executeControlledArms|matchesOriginal|INCONCLUSIVE_NO_BASELINE|original-conditional-skips/.test(controller));
  assert.ok(controller.includes("name==='trace-diagnostics'?control:app"));assert.ok(controller.includes('runOriginalStages('));assert.ok(controller.includes("verifyTransport(readFileSync(join(native,'emulator.log'),'utf8'),guest,'pipe')"));
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));assert.equal(vercel.git.deploymentEnabled[BRANCH],false);
});
