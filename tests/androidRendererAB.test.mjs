import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PIN,ARMS,PHASES,assertContext,assertArtifactIdentity,assertSdk,assertRenderer,executePair,pairVerdict} from '../scripts/qa/android-renderer-ab/policy.mjs';
import {assertNoTargetAppAnr} from '../scripts/qa/android-native-isolated/anr-diagnostics.mjs';

const identity={source:PIN.source,tree:PIN.tree,tools:PIN.tools,zipSha256:PIN.zipSha,zipBytes:PIN.zipBytes,
  apkSha256:PIN.apkSha,apkBytes:PIN.apkBytes,assets:214,fonts:13,privateEnvDisabled:true,syntheticBootstrap:true};
const head='a'.repeat(40);
const context={platform:'linux',toolingHead:head,source:{commit:PIN.source,tree:PIN.tree,clean:true},tools:{commit:PIN.tools,tree:PIN.tree,clean:true}};
const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_NUMBER:'1',GITHUB_WORKFLOW_REF:PIN.repository+'/.github/workflows/android-renderer-ab-c053-once.yml@refs/heads/'+PIN.branch,GITHUB_REPOSITORY:PIN.repository,GITHUB_REF:'refs/heads/'+PIN.branch,GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'123',GITHUB_SHA:head,ANDROID_AB_REVIEWED_SHA:head,ANDROID_AB_REVIEW_TOKEN:PIN.reviewToken,ANDROID_AB_REQUESTED_SOURCE:PIN.source};
const capabilities={compatible:true,observations:{GlDirectMem:[1],HasSharedSlotsHostMemoryAllocator:[1]}};
const originalRenderer=readFileSync(new URL('./fixtures/android-renderer-ab-original-renderer.txt',import.meta.url),'utf8');
// Candidate B is a synthetic policy fixture, not an observed Native result.
const candidateRenderer=originalRenderer.replace('vulkan_mode_selected:lavapipe gles_mode_selected:swangle','vulkan_mode_selected:swiftshader gles_mode_selected:swiftshader')
  .replace('setCurrentRenderer: swangle lavapipe gles:Angle Indirect vulkan:Lavapipe','setCurrentRenderer: swiftshader swiftshader gles:Swiftshader vulkan:Swiftshader');
const targetAnr='10-14 18:14:00.833   691   825 I WindowManager: ANR in Window{185c0bc u0 com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity}. Reason:Input dispatching timed out (Waited 5001ms for FocusEvent(hasFocus=true)).';
const recovery='10-14 18:14:03.031   691   825 I InputDispatcher: 185c0bc com.sogrimhashbon.app.debug/com.sogrimhashbon.app.MainActivity spent 7201ms processing FocusEvent(hasFocus=true)';
function adapter({fail,unsafeClosure=false}={}) {
  const calls=[];
  return {calls,async phase(arm,name) {
    calls.push(arm.id+':'+name);
    if(name==='prepare')arm.sdkDigest='same-recorded-sdk';
    if(name==='renderer')arm.renderer=assertRenderer(arm.id==='A'?originalRenderer:candidateRenderer,arm.gpu,capabilities);
    if(fail?.(arm,name))throw new Error('Original phase failure');
    if(name==='cleanup')arm.closed=!unsafeClosure;
    if(name==='retain-evidence')arm.evidenceRetained=true;
    return {source:PIN.source};
  }};
}
test('original ZIP/APK/source identity and private bootstrap guards reject drift',()=>{
  assertArtifactIdentity(identity);
  for(const [key,value] of Object.entries({source:'0'.repeat(40),tree:'0'.repeat(40),tools:'0'.repeat(40),apkSha256:'0'.repeat(64),zipSha256:'0'.repeat(64),apkBytes:identity.apkBytes-1,fonts:12,assets:213,privateEnvDisabled:false,syntheticBootstrap:false}))
    assert.throws(()=>assertArtifactIdentity({...identity,[key]:value}));
});
test('exact reviewed one-shot push is required; wrong source/tools/branch/duplicate/rerun reject',()=>{
  assertContext(env,context);
  for(const [key,value] of Object.entries({ANDROID_AB_REVIEWED_SHA:'b'.repeat(40),GITHUB_SHA:'b'.repeat(40),GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_NUMBER:'2',GITHUB_WORKFLOW_REF:PIN.repository+'/.github/workflows/qa.yml@refs/heads/'+PIN.branch,GITHUB_RUN_ATTEMPT:'2',GITHUB_REPOSITORY:'someone/else'}))
    assert.throws(()=>assertContext({...env,[key]:value},context));
  assert.throws(()=>assertContext(env,{...context,source:{...context.source,commit:'0'.repeat(40)}}));
  assert.throws(()=>assertContext(env,{...context,tools:{...context.tools,clean:false}}));
});
test('SDK36.1 image and emulator37.2.12 are separate pins; binary help cannot substitute deprecated alias',()=>{
  const sdk={files:{
    hostFeatures:{sha256:'0f4532724ad5d666139607ab64bfb3eb42af140343ffb69c97afe72cb686d5f8'},
    hostVersion:{revision:'37.2.12',sha256:'ba13085f647fb8389a4d06a1de0e4104ac4e841733e50f67223ac230e1ce685a'},
    guestFeatures:{sha256:'6fc0aa05761982d23c9084b78fda14f4f6b49dfd176e3782686bba750c806316'},
    guestVersion:{revision:'4',sha256:'fb476989442a827bf45fe141abe7fa8a002efeab6e7f15f6bed78f0484a211aa'},
  }};
  const version='Android emulator version 37.2.12.0 (build_id 16428233) (CL:N/A)';
  assertSdk(sdk,version,'auto host software swiftshader swangle lavapipe');
  assert.throws(()=>assertSdk(sdk,version,'software swiftshader_indirect'));
  assert.throws(()=>assertSdk(sdk,version.replace('37.2.12','37.2.13'),'software swiftshader'));
  assert.throws(()=>assertSdk({...sdk,files:{...sdk.files,guestVersion:{...sdk.files.guestVersion,revision:'5'}}},version,'software swiftshader'));
});
test('actual baseline renderer and distinct candidate are required; fallback, ambiguity and capability drift reject',()=>{
  assert.equal(assertRenderer(originalRenderer,'software',capabilities).glesMode,'swangle');
  assert.equal(assertRenderer(candidateRenderer,'swiftshader',capabilities).glesMode,'swiftshader');
  assert.throws(()=>assertRenderer(originalRenderer,'swiftshader',capabilities),/distinct GLES renderer/);
  assert.throws(()=>assertRenderer(candidateRenderer.replace('gfxstreamFeature:Vulkan = 0','gfxstreamFeature:Vulkan = 1'),'swiftshader',capabilities),/activation drift/);
  assert.throws(()=>assertRenderer(originalRenderer+'\nINFO | emuglConfig_init: vulkan_mode_selected:lavapipe gles_mode_selected:swangle\n','software',capabilities),/ambiguous/);
  assert.throws(()=>assertRenderer(originalRenderer,'software',{...capabilities,compatible:false}));
});
test('same orchestration runs A then B once, with all original controls and no release acceptance',async()=>{
  const a=adapter(),records=[];
  const result=await executePair(a,{onRecord:arms=>records.push(structuredClone(arms))});
  assert.equal(result.controlsPassed,true);
  assert.equal(result.nativeAcceptance,false);assert.equal(result.releaseAcceptance,false);
  assert.deepEqual(a.calls,ARMS.flatMap(arm=>PHASES.map(name=>arm.id+':'+name)));
  assert.ok(records[0].every(arm=>arm.phases.length===PHASES.length));
  assert.ok(records.every(arms=>arms.every(arm=>arm.phases.every(p=>p.source===PIN.source&&p.apkSha256===PIN.apkSha))));
});
test('actual target ANR remains terminal despite captured recovery and a passing B arm',async()=>{
  const a=adapter(),run=a.phase.bind(a);
  a.phase=async(arm,name)=>{if(arm.id==='A'&&name==='anr-history')assertNoTargetAppAnr(targetAnr+'\n'+recovery);return run(arm,name);};
  const result=await executePair(a);
  assert.equal(result.controlsPassed,false);
  assert.equal(result.arms[0].phases.find(p=>p.name==='anr-history').state,'failed');
  assert.match(result.arms[0].phases.find(p=>p.name==='anr-history').error,/later recovery cannot accept/);
  assert.equal(result.arms[1].phases.every(p=>p.state==='passed'),true);
  assert.equal(a.calls.filter(c=>c==='A:geometry').length,1);
  assert.ok(a.calls.includes('A:cleanup')&&a.calls.includes('B:geometry'));
});
test('trace failure cannot skip ANR, cleanup or evidence; failed phase remains preserved',async()=>{
  const a=adapter({fail:(arm,name)=>arm.id==='A'&&name==='trace-finish'});
  const result=await executePair(a);
  assert.equal(result.controlsPassed,false);
  assert.ok(a.calls.includes('A:anr-history')&&a.calls.includes('A:retain-evidence'));
  assert.equal(result.arms[0].phases.find(p=>p.name==='trace-finish').state,'failed');
});
test('failed measurement is not retried, subsequent A measures stay unrun, fresh B still runs',async()=>{
  const a=adapter({fail:(arm,name)=>arm.id==='A'&&name==='acceptance'});
  const result=await executePair(a);
  assert.equal(result.controlsPassed,false);
  assert.equal(a.calls.filter(c=>c==='A:acceptance').length,1);
  assert.equal(a.calls.includes('A:geometry'),false);
  assert.equal(result.arms[0].phases.find(p=>p.name==='geometry').state,'not-run-after-failure');
  assert.ok(a.calls.includes('A:trace-finish')&&a.calls.includes('A:anr-history')&&a.calls.includes('B:acceptance'));
});
test('missing/duplicated phases or arms reject; unverified A closure prevents B launch',async()=>{
  const a=adapter({unsafeClosure:true}),result=await executePair(a);
  assert.equal(result.controlsPassed,false);assert.equal(a.calls.some(c=>c.startsWith('B:')),false);
  assert.equal(result.arms[1].state,'planned');assert.equal(result.arms[1].phases.length,PHASES.length);
  const passed=await executePair(adapter());
  assert.throws(()=>pairVerdict([passed.arms[0]]),/Missing arm/);
  const duplicate=structuredClone(passed.arms);duplicate[1].phases.push(duplicate[1].phases[0]);
  assert.throws(()=>pairVerdict(duplicate),/Missing, duplicated or reordered phase/);
});
test('controlled failed-arm guard mutation accepts A failure incorrectly; final rejects the same records',async t=>{
  const result=await executePair(adapter({fail:(arm,name)=>arm.id==='A'&&name==='anr-history'}));
  assert.equal(pairVerdict(result.arms).controlsPassed,false);
  const dir=mkdtempSync(join(tmpdir(),'android-renderer-ab-tests-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+'/')||resolve(dir).startsWith(resolve(tmpdir())+'\\'));rmSync(dir,{recursive:true,force:true});});
  const original=readFileSync(new URL('../scripts/qa/android-renderer-ab/policy.mjs',import.meta.url),'utf8');
  const bad=original.replace('const passed = arms.every(arm =>','const passed = arms.some(arm =>');
  assert.notEqual(bad,original);
  const file=join(dir,'controlled-missing-guard.mjs');writeFileSync(file,bad);
  const mutation=await import(pathToFileURL(file));
  assert.equal(mutation.pairVerdict(result.arms).controlsPassed,true,'Controlled OLD guard must exhibit the covered incorrect acceptance');
});
test('workflow is one-shot, read-only, no rebuild/deploy/secrets, and retains evidence on every failure',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/android-renderer-ab-c053-once.yml',import.meta.url),'utf8');
  assert.match(yaml,/push:\n    branches:\n      - codex\/android-renderer-ab-root-reviewed-20261014/);assert.doesNotMatch(yaml,/workflow_call:|workflow_dispatch:|pull_request:/);
  assert.match(yaml,/github\.run_number == 1 && github\.run_attempt == 1/);
  assert.match(yaml,/github\.repository == 'yarinn12\/sogrim-hashbon'/);
  assert.match(yaml,/github\.event_name == 'push'/);
  assert.match(yaml,/github\.ref == 'refs\/heads\/codex\/android-renderer-ab-root-reviewed-20261014'/);
  assert.match(yaml,/retention-days: 7/);
  assert.match(yaml,/contents: read\n  actions: read/);
  assert.doesNotMatch(yaml,/secrets\.|assembleDebug|gradlew|native:prepare|npm ci|vercel deploy|continue-on-error|pull_request_target/);
  assert.match(yaml,/artifact_id = 11918988498/);assert.match(yaml,new RegExp(PIN.zipSha));
  assert.match(yaml,/retries: 0/);assert.match(yaml,/if: always\(\)[\s\S]*--finalize/);
  assert.match(yaml,/if: always\(\)[\s\S]*--summarize/);assert.match(yaml,/actions\/upload-artifact@v6/);
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.git.deploymentEnabled[PIN.branch],false);
});
test('local CLI execution fails before any Native launch',()=>{
  const run=spawnSync(process.execPath,['scripts/qa/android-renderer-ab/executor.mjs','--run'],{cwd:resolve('.'),encoding:'utf8',timeout:5000,
    env:{...process.env,ANDROID_AB_SOURCE_ROOT:resolve('.'),ANDROID_AB_TOOLS_ROOT:resolve('.')}});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/reviewed Linux CI host|GITHUB_ACTIONS|AssertionError/);
});


test('controlled OLD missing activation counter permits duplicate; FINAL rejects it', async t=>{
  const duplicate={...env,GITHUB_RUN_NUMBER:'2'};
  assert.throws(()=>assertContext(duplicate,context),/Only the first registered activation/);
  const dir=mkdtempSync(join(tmpdir(),'android-ab-counter-control-'));
  t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())));rmSync(dir,{recursive:true,force:true});});
  const original=readFileSync(new URL('../scripts/qa/android-renderer-ab/policy.mjs',import.meta.url),'utf8');
  const old=original.replace("  assert.equal(env.GITHUB_RUN_NUMBER, '1', 'Only the first registered activation may execute');",'');
  assert.notEqual(old,original);
  const file=join(dir,'old-counter-removed.mjs');writeFileSync(file,old);
  const controlled=await import(pathToFileURL(file));
  assert.doesNotThrow(()=>controlled.assertContext(duplicate,context));
});
