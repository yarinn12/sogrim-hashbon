import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runNativePhase,readNativeSwangleOwner,requireSourceIdentity,requireRendererPair} from '../scripts/qa/android-native-isolated/swangle-native.mjs';
import {readSdkReference} from '../scripts/qa/android-swangle-compatibility/contract.mjs';
import {ASG_PROPERTIES,ASG_BUFFERS} from '../scripts/qa/android-native-isolated/gltransport.mjs';
import {assertRendererSelection} from '../scripts/qa/android-native-isolated/renderer-capabilities.mjs';

const appSource='b'.repeat(40),toolsSource='c'.repeat(40),pid=4321;
const reference=readSdkReference(readFileSync(new URL('../scripts/qa/android-swangle-compatibility/reference-sdk-binaries.json',import.meta.url)));
const required=['emulator/lib64/gles_angle/libEGL.so','emulator/lib64/gles_angle/libGLESv2.so','emulator/lib64/gles_angle/libvk_swiftshader.so'];
// Verbatim selection lines from run42324443218 artifact13555365529, archive SHA256
// 1e09f023b81c1d7f5fa53ea69fd6f47f9bf2db82c48d8fc9c3f7579b3875fab4.
// Process/SDK boundaries below remain synthetic; the actual archive is reviewed separately.
const selected=readFileSync(new URL('./fixtures/android-native-renderer-swangle-42324443218.txt',import.meta.url),'utf8');
const guest=Object.fromEntries(ASG_PROPERTIES.map((k,i)=>[k,i<2?'asg':i===2?'':i===3?'emulation':'ranchu']));
const settings=Object.entries({'hw.gltransport':'asg','androidboot.hardware.gltransport':'asg','androidboot.qemu.gltransport.name':'asg',...ASG_BUFFERS,'androidboot.debug.hwui.renderer':'skiagl','gfxstreamFeature:Minigbm':'0','gfxstreamFeature:VirtioGpuNext':'0'}).map(([k,v])=>'DEBUG | '+k+' = '+v+'\n').join('');
function model(){
  const root=mkdtempSync(join(tmpdir(),'sogrim-native-swangle-')),out=join(root,'artifacts/android-native-isolated'),sdk=join(root,'sdk');mkdirSync(out,{recursive:true});
  const env={PATH:process.env.PATH,GITHUB_SHA:toolsSource,GITHUB_WORKSPACE:join(root,'tools'),ANDROID_QA_SOURCE:appSource,ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_123_1',ANDROID_HOME:sdk,ADB_PATH:join(sdk,'platform-tools/adb'),RUNNER_TEMP:join(root,'temp'),ANDROID_QA_EMULATOR_PID:String(pid)};
  const home=join(env.RUNNER_TEMP,'android-native-home');Object.assign(env,{ANDROID_USER_HOME:home,ANDROID_EMULATOR_HOME:home,ADB_VENDOR_KEYS:join(home,'adbkey'),ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037'});
  writeFileSync(join(out,'qa-tools-source.txt'),toolsSource+'\n');writeFileSync(join(out,'emulator.pid'),String(pid)+'\n');writeFileSync(join(out,'emulator.log'),selected+settings);
  const m={root,out,env,birth:'777',fingerprintCalls:0,captureCalls:0,corruptSdk:false,log:selected+settings};
  m.command=[join(sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless'),'-avd',env.ANDROID_QA_AVD,'-port','5582','-gpu','swangle','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory','4096','-cores','2'];
  m.read=path=>{assert.ok(path.startsWith('/proc/'+pid+'/'));if(path.endsWith('cmdline'))return m.command.join('\0')+'\0';const fields=Array(40).fill('0');fields[18]=m.birth;return `${pid} (owned) S ${fields.join(' ')}\n`;};
  m.owner=context=>readNativeSwangleOwner(context,{read:m.read});
  const deps={cwd:root,getHead:path=>path===root?appSource:toolsSource,getRendererSdk:()=>({version:'pinned'}),getAsgSdk:()=>({transport:'asg'}),getReference:()=>structuredClone(reference),getFingerprint:()=>{m.fingerprintCalls++;const r=structuredClone(reference);if(m.corruptSdk)r.files[0].sha256='0'.repeat(64);return r;},getOwner:m.owner,capture:async context=>{m.captureCalls++;const owner=m.owner(context);return {verified:true,ownerBefore:owner,ownerAfter:owner,files:required.map((path,i)=>({...reference.files.find(f=>f.path===path),inode:String(i+10),executableMapping:true}))};},getGuest:()=>guest};
  m.next=phase=>runNativePhase(phase,env,deps);m.close=()=>rmSync(root,{recursive:true,force:true});m.json=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
  return m;
}
async function prepare(m){assert.equal((await m.next('snapshot')).error,undefined);assert.equal((await m.next('pin-owner')).ownerPinned,true);}

test('Native identity uses actual app and tools commits rather than a historical application constant',()=>{
  const m=model();try{const id=requireSourceIdentity(m.env,appSource,toolsSource,toolsSource);assert.equal(id.source,appSource);assert.notEqual(id.source,'2d4a973a197a2228fcd134f01d6763f500fd63bb');
    for(const values of [[appSource,'d'.repeat(40),toolsSource],[appSource,toolsSource,'d'.repeat(40)],['d'.repeat(40),toolsSource,toolsSource]])assert.throws(()=>requireSourceIdentity(m.env,...values));
  }finally{m.close();}
});
test('Native owner checks pin the real PID birth and reject legacy, duplicate or foreign commands',()=>{
  const m=model(),context={pid,startTicks:'777',sdk:m.env.ANDROID_HOME,avd:m.env.ANDROID_QA_AVD};try{
    assert.equal(m.owner(context).startTicks,'777');const good=[...m.command];
    for(const command of [[...good,'-gpu','swangle'],good.map(v=>v==='swangle'?'swiftshader':v),['/foreign/emulator',...good.slice(1)],good.map(v=>v==='4096'?'8192':v)]){m.command=command;assert.throws(()=>m.owner(context));}
    m.command=good;m.birth='778';assert.throws(()=>m.owner(context),/reused/);
  }finally{m.close();}
});
test('Native before/after flow persists exact source, owned mappings and final transport proof',async()=>{
  const m=model();try{await prepare(m);assert.equal((await m.next('verify')).verified,true);assert.equal((await m.next('verify-after')).verified,true);
    for(const name of ['effective-renderer.json','effective-renderer-after.json','effective-transport.json','effective-transport-after.json']){const r=m.json(name);assert.equal(r.source,appSource);assert.equal(r.toolsSource,toolsSource);assert.equal(r.verified,true);}
    assert.equal(m.json('native-swangle-state.json').after.gpu,'swangle');assert.equal(m.captureCalls,2);assert.equal(m.fingerprintCalls,2);
  }finally{m.close();}
});
for(const [name,file] of [['old Lavapipe armA','android-native-renderer-a-38635442540.txt'],['old legacy SwiftShader armB','android-native-renderer-b-38635442540.txt']])test('Native output rejects '+name+' without borrowing adapter text',async()=>{
  const m=model();try{await prepare(m);writeFileSync(join(m.out,'emulator.log'),readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8')+settings);
    assert.ok((await m.next('verify')).error);assert.equal(m.json('effective-renderer.json').verified,false);assert.equal(m.json('effective-transport.json').verified,false);
  }finally{m.close();}
});
test('legacy selector remains unchanged while the explicit new policy accepts the new route',()=>{
  assert.throws(()=>assertRendererSelection(selected));assert.equal(assertRendererSelection(readFileSync(new URL('./fixtures/android-native-renderer-b-38635442540.txt',import.meta.url),'utf8')).glesMode,'swiftshader');
});
test('SDK drift after work cannot serialize an earlier renderer selection as current success',async()=>{
  const m=model();try{await prepare(m);assert.equal((await m.next('verify')).verified,true);m.corruptSdk=true;
    assert.ok((await m.next('verify-after')).error);assert.equal(m.json('effective-renderer-after.json').verified,false);assert.equal(m.json('effective-transport-after.json').verified,false);assert.equal(m.json('native-swangle-state.json').failed,true);assert.equal(m.captureCalls,1);
  }finally{m.close();}
});
test('PID reuse is rejected before another library capture or guest read',async()=>{
  const m=model();try{await prepare(m);assert.equal((await m.next('verify')).verified,true);m.birth='778';assert.ok((await m.next('verify-after')).error);assert.equal(m.captureCalls,1);assert.equal(m.json('effective-renderer-after.json').verified,false);
  }finally{m.close();}
});
test('a new source cannot reuse earlier preparation and repeated phases fail closed',async()=>{
  const m=model();try{await prepare(m);assert.equal((await m.next('verify')).verified,true);assert.ok((await m.next('verify')).error);assert.equal(m.json('effective-renderer.json').verified,false);assert.equal(m.json('native-swangle-state.json').failed,true);
  }finally{m.close();}
  const other=model();try{await prepare(other);other.env.ANDROID_QA_SOURCE='d'.repeat(40);assert.ok((await other.next('verify')).error);assert.equal(other.captureCalls,0);}finally{other.close();}
});
test('renderer pair requires one process identity and no missing actual-library proof',()=>{
  const before={verified:true,gpu:'swangle',loadedLibrariesVerified:true,libraries:{owner:{pid,startTicks:'777'}}};assert.equal(requireRendererPair(before,structuredClone(before)),true);
  assert.throws(()=>requireRendererPair(before,{...before,libraries:{owner:{pid,startTicks:'778'}}}));assert.throws(()=>requireRendererPair(before,{...before,loadedLibrariesVerified:false}));
});
test('CI keeps the original workloads, one boot, first identity pin and before/after proofs',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  assert.equal([...workflow.matchAll(/ -gpu swangle /g)].length,1);assert.match(workflow,/timeout-minutes: 45/);assert.match(workflow,/-memory 4096 -cores 2/);assert.match(workflow,/hw\.gltransport':'asg'/);
  const phases=['swangle-native.mjs snapshot','swangle-native.mjs pin-owner','swangle-native.mjs verify','font-regression.mjs','acceptance.mjs','geometry-regression.mjs','swangle-native.mjs verify-after'];let position=-1;for(const phase of phases){const at=workflow.indexOf(phase,position+1);assert.ok(at>position,phase);position=at;}
  assert.match(workflow,/anr-diagnostics\.mjs/);assert.match(workflow,/if: always\(\)/);assert.doesNotMatch(workflow,/-gpu host| -gpu swiftshader /);
});
