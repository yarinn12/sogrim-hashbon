import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertRendererCapabilities,assertRendererSelection} from '../scripts/qa/android-native-isolated/renderer-capabilities.mjs';

// Verbatim renderer lines from verified run 38635442540 original.zip:
// arms/A/native/emulator.log SHA256 9c7aa6759b969f9db6298548afc791c5b383e312efc69da071c6d8ef007ad0b0
// arms/B/native/emulator.log SHA256 e83152456b1b9e545148a299522a6b79467d5f5c8a7541068bf1271c05b028e0
const armA=readFileSync(new URL('./fixtures/android-native-renderer-a-38635442540.txt',import.meta.url),'utf8');
const armB=readFileSync(new URL('./fixtures/android-native-renderer-b-38635442540.txt',import.meta.url),'utf8');

test('old DMA evidence admits both actual A and B, but selected GLES must reject A and accept B',()=>{
  assert.equal(assertRendererCapabilities(armA).compatible,true);
  assert.equal(assertRendererCapabilities(armB).compatible,true);
  assert.throws(()=>assertRendererSelection(armA),/GLES|swangle|swiftshader/i);
  assert.deepEqual(assertRendererSelection(armB),{
    backend:'gfxstream',vulkanMode:'swiftshader',glesMode:'swiftshader',vulkanActive:0,
    adapter:'Android Emulator OpenGL ES Translator (Google SwiftShader)',
    api:'OpenGL ES 3.0 (OpenGL ES 3.0 SwiftShader 4.0.0.1)'
  });
});

test('mixed or ambiguous selected renderer cannot borrow B adapter and API text',()=>{
  assert.throws(()=>assertRendererSelection(armB.replace('gles_mode_selected:swiftshader','gles_mode_selected:swangle')));
  assert.throws(()=>assertRendererSelection(armB.replace('setCurrentRenderer: swiftshader swiftshader gles:Swiftshader Indirect vulkan:Swiftshader Indirect',
    'setCurrentRenderer: swangle lavapipe gles:Angle Indirect vulkan:Lavapipe')));
  assert.throws(()=>assertRendererSelection(armB+armA.split('\n').find(line=>line.includes('emuglConfig_init: vulkan_mode_selected:'))+'\n'));
});

test('missing selected modes, Vulkan activation, or active Vulkan fail closed',()=>{
  const selected=armB.split('\n').find(line=>line.includes('emuglConfig_init: vulkan_mode_selected:'));
  const vulkan=armB.split('\n').find(line=>line.includes('gfxstreamFeature:Vulkan = 0'));
  assert.throws(()=>assertRendererSelection(armB.replace(selected,'')));
  assert.throws(()=>assertRendererSelection(armB.replace(vulkan,'')));
  assert.throws(()=>assertRendererSelection(armB.replace('gfxstreamFeature:Vulkan = 0','gfxstreamFeature:Vulkan = 1')));
});

test('verify writes selected-renderer provenance and fails closed on actual A',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'sogrim-selected-renderer-'));
  try{
    const sdk=resolve(root,'sdk'),artifact=resolve(root,'artifacts/android-native-isolated');
    mkdirSync(artifact,{recursive:true});
    const files={
      'emulator/lib/advancedFeatures.ini':'GLDirectMem = off\nHasSharedSlotsHostMemoryAllocator = on\n',
      'emulator/source.properties':'Pkg.Revision=37.2.12\n',
      'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini':'GLDirectMem = on\n',
      'system-images/android-36.1/google_apis_playstore/x86_64/source.properties':'Pkg.Revision=4\n'
    };
    for(const [path,contents] of Object.entries(files)){
      const target=resolve(sdk,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,contents);
    }
    const script=resolve('scripts/qa/android-native-isolated/renderer-capabilities.mjs');
    const env={...process.env,ANDROID_HOME:sdk,ANDROID_QA_SOURCE:'a'.repeat(40),
      ANDROID_QA_DEVICE:'emulator-5582',ANDROID_QA_AVD:'sogrim_ci_renderer_test',
      ANDROID_QA_EMULATOR_PID:String(process.pid)};
    const run=phase=>spawnSync(process.execPath,[script,phase],{cwd:root,env,encoding:'utf8'});
    assert.equal(run('snapshot').status,0);
    writeFileSync(resolve(artifact,'emulator.pid'),String(process.pid));
    writeFileSync(resolve(artifact,'emulator.log'),armB);
    assert.equal(run('verify').status,0);
    assert.deepEqual(JSON.parse(readFileSync(resolve(artifact,'effective-renderer.json'),'utf8')).glesMode,'swiftshader');
    assert.equal(JSON.parse(readFileSync(resolve(artifact,'effective-renderer.json'),'utf8')).verified,true);
    writeFileSync(resolve(artifact,'emulator.log'),armA);
    assert.equal(run('verify').status,1);
    assert.equal(JSON.parse(readFileSync(resolve(artifact,'effective-renderer.json'),'utf8')).verified,false);
    assert.equal(JSON.parse(readFileSync(resolve(artifact,'effective-renderer.json'),'utf8')).glesMode,'swangle');
  }finally{rmSync(root,{recursive:true,force:true});}
});
