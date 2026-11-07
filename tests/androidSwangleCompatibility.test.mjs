import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {assertSwangleRenderer,selectionRecord} from '../scripts/qa/android-swangle-compatibility/renderer.mjs';
import {SOURCE,TREE,CONFIG,BRANCH,runOnce,runOriginalStages,inspectWorkload,summarizeCompatibility,emulatorArguments,requireInvocation} from '../scripts/qa/android-swangle-compatibility/contract.mjs';
import {CONFIG as pinnedConfig} from '../scripts/qa/android-host-profile/contract.mjs';
import {verifyTransport,ASG_PROPERTIES} from '../scripts/qa/android-swangle-compatibility/transport.mjs';
import {readOwner,guardedAdb,cleanupOwned} from '../scripts/qa/android-swangle-compatibility/owned.mjs';
import {ASG_BUFFERS} from '../scripts/qa/android-native-isolated/gltransport.mjs';
import {assertRendererSelection} from '../scripts/qa/android-native-isolated/renderer-capabilities.mjs';
const reference=JSON.parse(readFileSync(new URL('../scripts/qa/android-swangle-compatibility/reference-sdk-binaries.json',import.meta.url)));
const owner={pid:4321,startTicks:'777'},paths=['emulator/lib64/gles_angle/libEGL.so','emulator/lib64/gles_angle/libGLESv2.so','emulator/lib64/gles_angle/libvk_swiftshader.so'];
const loaded=()=>({verified:true,ownerBefore:{...owner},ownerAfter:{...owner},files:paths.map((path,i)=>({...reference.files.find(f=>f.path===path),inode:String(100+i),executableMapping:true}))});
const swangleLog=`INFO | Graphics backend: gfxstream
INFO | emuglConfig_init: vulkan_mode_selected:swiftshader gles_mode_selected:swangle
DEBUG | setCurrentRenderer: swangle swiftshader gles:Angle Indirect vulkan:Swiftshader Indirect
DEBUG | gfxstreamFeature:Vulkan = 0
DEBUG | gfxstreamFeature:GlDirectMem = 1
DEBUG | gfxstreamFeature:HasSharedSlotsHostMemoryAllocator = 1
INFO | Graphics Adapter Vendor Google
INFO | Graphics Adapter Android Emulator OpenGL ES Translator (Google SwiftShader)
INFO | Graphics API Version OpenGL ES 3.1 (SwiftShader 5.0.0)
DEBUG | Performing composition using CompositorGl.
`;
const legacyLog=swangleLog.replace('gles_mode_selected:swangle','gles_mode_selected:swiftshader').replace('swangle swiftshader gles:Angle Indirect','swiftshader swiftshader gles:Swiftshader Indirect').replace('OpenGL ES 3.1','OpenGL ES 3.0');

test('source-backed SwANGLE selection requires the actual bound ANGLE and SwiftShader libraries',()=>{
  const proof=assertSwangleRenderer(swangleLog,loaded(),reference,owner);assert.equal(proof.verified,true);assert.equal(proof.gpu,'swangle');assert.equal(proof.rendererRoute,'ANGLE+SwiftShader');
});
test('SwiftShader adapter text alone cannot accept fallback to legacy GLES',()=>{
  assert.throws(()=>assertSwangleRenderer(legacyLog,loaded(),reference,owner));
});
test('the original legacy renderer guard stays strict and unchanged',()=>{
  assert.equal(assertRendererSelection(legacyLog).glesMode,'swiftshader');assert.throws(()=>assertRendererSelection(swangleLog),/not SwiftShader/);
});
test('single compatibility contract executes exactly one ASG SwANGLE callback with original resources',async()=>{
  const calls=[];await runOnce(async arm=>{calls.push(arm);return {...arm,source:SOURCE};});assert.deepEqual(calls,[{id:'SWANGLE',transport:'asg',gpu:'swangle'}]);assert.equal(CONFIG['hw.cpu.ncore'],'2');assert.equal(CONFIG['hw.ramSize'],'4096');assert.equal(CONFIG['hw.gltransport'],'asg');
});

for(const [name,transform] of [
  ['host GLES',s=>s.replace('gles_mode_selected:swangle','gles_mode_selected:host')],
  ['lavapipe Vulkan',s=>s.replace('vulkan_mode_selected:swiftshader','vulkan_mode_selected:lavapipe')],
  ['host Vulkan',s=>s.replace('vulkan_mode_selected:swiftshader','vulkan_mode_selected:host')],
  ['legacy current renderer',s=>s.replace('swangle swiftshader gles:Angle Indirect','swiftshader swiftshader gles:Swiftshader Indirect')],
  ['active guest Vulkan',s=>s.replace('gfxstreamFeature:Vulkan = 0','gfxstreamFeature:Vulkan = 1')],
  ['missing DMA',s=>s.replace('gfxstreamFeature:GlDirectMem = 1','gfxstreamFeature:GlDirectMem = 0')],
  ['changed composition',s=>s.replace('CompositorGl.','CompositorVk.')],
  ['host adapter',s=>s.replace('Google SwiftShader','NVIDIA host GPU')],
  ['unidentified API',s=>s.replace('SwiftShader 5.0.0','Mesa host')],
  ['late renderer fallback',s=>s+'WARNING | Graphics renderer falling back to host\n'],
  ['ambiguous selection',s=>s+'INFO | emuglConfig_init: vulkan_mode_selected:swiftshader gles_mode_selected:swangle\n'],
  ['missing API',s=>s.split('\n').filter(l=>!l.includes('Graphics API Version')).join('\n')],
])test('SwANGLE rejects '+name,()=>assert.throws(()=>assertSwangleRenderer(transform(swangleLog),loaded(),reference,owner)));

test('actual rejected armA swangle+lavapipe and armB legacy remain negative fixtures',()=>{
  for(const name of ['a','b']){
    const log=readFileSync(new URL('./fixtures/android-native-renderer-'+name+'-38635442540.txt',import.meta.url),'utf8');assert.throws(()=>assertSwangleRenderer(log,loaded(),reference,owner));
  }
});
test('ANGLE version text is accepted only with the complete software-mode and bound-library evidence',()=>{
  const log=swangleLog.replace('SwiftShader 5.0.0','ANGLE 2.1.0 git:source-backed-fixture');assert.equal(assertSwangleRenderer(log,loaded(),reference,owner).verified,true);
});
for(const [name,mutate] of [
  ['missing EGL',s=>{s.files=s.files.filter(f=>!f.path.endsWith('/libEGL.so'));}],
  ['missing GLES',s=>{s.files=s.files.filter(f=>!f.path.endsWith('/libGLESv2.so'));}],
  ['missing SwiftShader Vulkan',s=>{s.files=s.files.filter(f=>!f.path.endsWith('/libvk_swiftshader.so'));}],
  ['nonexecutable library',s=>{s.files[0].executableMapping=false;}],
  ['changed hash',s=>{s.files[0].sha256='0'.repeat(64);} ],
  ['changed size',s=>{s.files[0].bytes++;}],
  ['missing inode',s=>{s.files[0].inode='';}],
  ['unverified mapping',s=>{s.verified=false;}],
  ['changed before birth',s=>{s.ownerBefore.startTicks='778';}],
  ['changed after PID',s=>{s.ownerAfter.pid++;}],
  ['ambiguous EGL',s=>{s.files.push({...s.files[0]});}],
  ['legacy GLES executable mapping',s=>{s.files.push({path:'emulator/lib64/gles_swiftshader/libGLESv2.so',executableMapping:true});}],
])test('actual-library guard rejects '+name,()=>{const s=loaded();mutate(s);assert.throws(()=>assertSwangleRenderer(swangleLog,s,reference,owner));});

test('the other pinned SwiftShader Vulkan library is allowed only as an actual executable mapping',()=>{
  const s=loaded(),path='emulator/lib64/vulkan/libvk_swiftshader.so';s.files[2]={...reference.files.find(f=>f.path===path),inode:'103',executableMapping:true};assert.equal(assertSwangleRenderer(swangleLog,s,reference,owner).verified,true);
});
const guest=Object.fromEntries(ASG_PROPERTIES.map((k,i)=>[k,i<2?'asg':i===2?'':i===3?'emulation':'ranchu']));
const transportLog=()=>swangleLog+Object.entries({'hw.gltransport':'asg','androidboot.hardware.gltransport':'asg','androidboot.qemu.gltransport.name':'asg',...ASG_BUFFERS,'androidboot.debug.hwui.renderer':'skiagl','gfxstreamFeature:Minigbm':'0','gfxstreamFeature:VirtioGpuNext':'0'}).map(([k,v])=>'DEBUG | '+k+' = '+v+'\n').join('');
test('SwANGLE retains every original ASG buffer, property and host-path condition',()=>{
  assert.equal(verifyTransport(transportLog(),guest,loaded(),reference,owner).verified,true);
  for(const [from,to] of [['hw.gltransport = asg','hw.gltransport = pipe'],['hw.gltransport.asg.dataRingSize = 32768','hw.gltransport.asg.dataRingSize = 65536'],['androidboot.debug.hwui.renderer = skiagl','androidboot.debug.hwui.renderer = skiavk'],['gfxstreamFeature:Minigbm = 0','gfxstreamFeature:Minigbm = 1']])assert.throws(()=>verifyTransport(transportLog().replace(from,to),guest,loaded(),reference,owner));
  assert.throws(()=>verifyTransport(transportLog(),{...guest,'ro.hardware.egl':'host'},loaded(),reference,owner));
});
test('only the GPU selector changes in the original launch settings',()=>{
  const avd='sogrim_ci_123_1_swangle';assert.deepEqual(CONFIG,pinnedConfig);
  assert.deepEqual(emulatorArguments(avd),['-avd',avd,'-port','5582','-no-window','-no-snapshot','-no-audio','-no-boot-anim','-gpu','swangle','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-verbose','-memory','4096','-cores','2']);assert.throws(()=>emulatorArguments('sogrim_ci_123_2_swangle'));
});
test('an ANR outcome never causes another trial or erases the original source gate',async()=>{
  let calls=0;const r=await runOnce(async arm=>{calls++;return {...arm,source:SOURCE,valid:true,clean:false,targetAnr:true};});assert.equal(calls,1);const v=summarizeCompatibility(r);assert.equal(v.technicalExitCode,1);assert.equal(v.diagnosticOutcome,'SWANGLE_WORKLOAD_FAILED_ANR');assert.equal(v.originalSourceGate,'FAILED');assert.equal(v.nativeAcceptance,false);assert.equal(v.releaseAcceptance,false);
});
test('all original workload stages run once after a check fails; ownership loss stops commands',async()=>{
  const calls=[];await runOriginalStages(async label=>{calls.push(label);return {label,exitCode:label==='acceptance'?1:0,executed:true};});assert.deepEqual(calls,['font-regression','acceptance','geometry-regression','health-after']);
  const lost=[];await assert.rejects(runOriginalStages(async label=>{lost.push(label);return {label,executed:false};}),/scope lost/);assert.deepEqual(lost,['font-regression']);
});
function workloadEvidence(anr=false){
  const provenance={sourceCommit:SOURCE,sourceTree:TREE},r={provenance},checks=n=>Array.from({length:n},()=>({ok:true})),proof=assertSwangleRenderer(swangleLog,loaded(),reference,owner);
  return {rendererProof:{before:proof,after:proof},integrity:true,selection:{transport:'asg',verified:true},diagnostics:{source:SOURCE,ownershipVerified:true,diagnosticsComplete:true,continuousLogCaptured:true,targetAppAnrLines:anr?['actual target ANR']:[],anrHistoryReady:!anr},matrix:{...r,results:[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>({scale,orientation,checks:checks(36)})))},pages:{...r,samples:Array(24).fill({}),checks:checks(325)},journey:{...r,checks:checks(8),exceptions:[]},acceptance:{...r,ready:true},font:{...r,ready:true,actualGuardResults:{root:false,rem:false,brand:false}},geometry:{...r,ready:true,checks:checks(4)},healthBefore:{source:SOURCE,healthy:true},healthAfter:{source:SOURCE,healthy:true},stageCodes:['font-regression','acceptance','geometry-regression','health-after','anr-diagnostics'].map(label=>({label,executed:true,exitCode:anr&&label==='anr-diagnostics'?1:0}))};
}
test('complete original workload plus before/after renderer proof is required, and success remains diagnostic only',()=>{
  const e=workloadEvidence(),r=inspectWorkload(e);assert.equal(r.fullWorkload,true);assert.equal(r.clean,true);const v=summarizeCompatibility(r);assert.equal(v.technicalExitCode,0);assert.equal(v.bpfExecuted,false);assert.equal(v.nativeAcceptance,false);assert.equal(v.releaseAcceptance,false);assert.equal(v.causalRendererComparisonPerformed,false);
  assert.equal(inspectWorkload({...e,rendererProof:{before:e.rendererProof.before,after:null}}).clean,false);
  const anr=inspectWorkload(workloadEvidence(true));assert.equal(anr.targetAnr,true);assert.equal(anr.clean,false);assert.equal(summarizeCompatibility(anr).technicalExitCode,1);
});
const statText=(pid,start)=>{const fields=Array(40).fill('0');fields[18]=start;return `${pid} (owned) S ${fields.join(' ')}\n`;};
function ownerModel({gpu='swangle',lastBirth='777'}={}){
  const context={...owner,avd:'sogrim_ci_123_1_swangle',sdk:'/sdk'},command=[join(context.sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'),...emulatorArguments(context.avd)];command[command.indexOf('-gpu')+1]=gpu;let reads=0;
  return {context,command,read:path=>path.endsWith('cmdline')?command.join('\0')+'\0':statText(owner.pid,++reads===1?'777':lastBirth)};
}
test('owned process guard binds exactly the new GPU command and original PID birth',()=>{
  const m=ownerModel();assert.equal(readOwner(m.context,{read:m.read}).pid,owner.pid);
  for(const input of [{gpu:'swiftshader'},{gpu:'host'},{lastBirth:'778'}]){const bad=ownerModel(input);assert.throws(()=>readOwner(bad.context,{read:bad.read}));}
});
test('global/foreign ADB commands are still rejected before execution',()=>{
  const m=ownerModel();let calls=0;const record=[];assert.throws(()=>guardedAdb(m.context,['-s','emulator-5582','kill-server'],{},()=>{calls++;},{owner:()=>readOwner(m.context,{read:m.read}),record:r=>record.push(r)}));assert.equal(calls,0);assert.equal(record[0].executed,false);
});
test('cleanup never signals or issues ADB commands after ownership is lost',async()=>{
  let commands=0,signals=0;await assert.rejects(cleanupOwned(owner,{owner:()=>{throw Error('Refuse reused owner');},logcat:{kill:()=>{signals++;}},run:()=>{commands++;},record:()=>{}}),/reused owner/);assert.equal(commands,0);assert.equal(signals,0);
});
test('only the exact first-created event can invoke the experiment',()=>{
  const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1'},event={created:true,deleted:false,forced:false,before:'0'.repeat(40),after:env.GITHUB_SHA,ref:env.GITHUB_REF,repository:{full_name:env.GITHUB_REPOSITORY}};requireInvocation(env,event);
  for(const changes of [{created:false},{forced:true},{before:'b'.repeat(40)}])assert.throws(()=>requireInvocation(env,{...event,...changes}));assert.throws(()=>requireInvocation({...env,GITHUB_RUN_ATTEMPT:'2'},event));
});
test('workflow is one read-only standard job, no BPF/dispatch/retry, and Vercel is disabled',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-swangle-compatibility-2d4.yml',import.meta.url),'utf8'),runner=readFileSync(new URL('../scripts/qa/android-swangle-compatibility/runner.mjs',import.meta.url),'utf8'),vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  assert.equal(vercel.git.deploymentEnabled[BRANCH],false);assert.match(workflow,/runs-on: ubuntu-24\.04/);assert.match(workflow,/timeout-minutes: 45/);assert.match(workflow,/github\.event\.created == true/);assert.match(workflow,/github\.run_attempt == 1/);assert.match(workflow,/github\.run_number == 1/);assert.doesNotMatch(workflow,/workflow_dispatch|workflow_call|bpftrace|apt-get|contents: write|actions: write/);
  assert.doesNotMatch(runner,/startProfile|runScopePreflight|inspectTool|root-control|profiler\.mjs|offline\.mjs/);assert.match(runner,/emulatorArguments\(avd\)/);assert.match(runner,/nativeQaEnvironment\(context\)/);assert.match(runner,/env:context\.childEnv/);assert.match(runner,/renderer-verify-after/);
});
test('new artifact helper is byte-identical to the reviewed base and its immutable-input controls all pass',()=>{
  assert.deepEqual(readFileSync(new URL('../scripts/qa/android-swangle-compatibility/artifact.py',import.meta.url)),readFileSync(new URL('../scripts/qa/android-host-profile/artifact.py',import.meta.url)));
  const file=new URL('./android_swangle_artifact_test.py',import.meta.url),candidates=[process.env.PYTHON,'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',process.platform==='win32'?'python':'python3'].filter(Boolean),python=candidates.find(p=>spawnSync(p,['--version'],{encoding:'utf8',windowsHide:true}).status===0);assert.ok(python,'Python required, no skipped artifact controls');
  const result=spawnSync(python,['-B',file.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
test('a late ownership error cannot serialize an earlier selection as verified',()=>{
  const proof=assertSwangleRenderer(swangleLog,loaded(),reference,owner),record=selectionRecord(proof,'Refuse reused owner after selection');assert.equal(record.verified,false);assert.match(record.error,/reused owner/);assert.equal(record.glesMode,'swangle');
});
test('before and after renderer proofs cannot belong to different emulator identities',()=>{
  const e=workloadEvidence();e.rendererProof.after=structuredClone(e.rendererProof.after);e.rendererProof.after.libraries.owner.startTicks='778';assert.equal(inspectWorkload(e).valid,false);
});
