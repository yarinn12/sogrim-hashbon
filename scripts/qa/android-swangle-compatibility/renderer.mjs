import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readRendererSdk,assertRendererCapabilities} from '../android-native-isolated/renderer-capabilities.mjs';
import {SOURCE,readSdkReference} from './contract.mjs';
import {readOwner} from './owned.mjs';
export const ANGLE_LIBRARIES=Object.freeze(['emulator/lib64/gles_angle/libEGL.so','emulator/lib64/gles_angle/libGLESv2.so']);
export const SWIFTSHADER_LIBRARIES=Object.freeze(['emulator/lib64/gles_angle/libvk_swiftshader.so','emulator/lib64/vulkan/libvk_swiftshader.so']);
function one(log,pattern,label){const rows=[...log.matchAll(pattern)];assert.equal(rows.length,1,'Missing/ambiguous actual SwANGLE evidence: '+label);return rows[0].slice(1);}
function sameOwner(actual,expected){assert.ok(actual?.pid===expected?.pid&&actual?.startTicks===expected?.startTicks,'Loaded renderer snapshot belongs to another/reused process');}
export function assertSwangleLibraries(loaded,reference,owner){
  assert.equal(loaded?.verified,true,'Require verified actual owned SDK mappings');assert.ok(Number.isSafeInteger(owner?.pid)&&owner.pid>1&&/^[1-9]\d*$/.test(owner.startTicks),'Require owned renderer PID/birth');
  sameOwner(loaded.ownerBefore,owner);sameOwner(loaded.ownerAfter,owner);assert.equal(reference?.files?.length,127,'Require original127-file SDK reference');
  const expected=new Map(reference.files.map(f=>[f.path,f]));assert.equal(expected.size,127,'Ambiguous SDK reference');assert.ok(Array.isArray(loaded.files),'Missing observed SDK mappings');
  assert.ok(!loaded.files.some(f=>f.executableMapping&&f.path?.startsWith('emulator/lib64/gles_swiftshader/')),'Legacy GLES library mapped: ambiguous fallback');
  const observed=SWIFTSHADER_LIBRARIES.filter(path=>loaded.files.some(f=>f.path===path&&f.executableMapping));assert.ok(observed.length>0,'No observed SwiftShader Vulkan implementation');
  const files=[...ANGLE_LIBRARIES,...observed].map(path=>{
    const rows=loaded.files.filter(f=>f.path===path);assert.equal(rows.length,1,'Missing/ambiguous observed renderer library: '+path);const row=rows[0],pin=expected.get(path);
    assert.ok(pin&&row.executableMapping===true&&/^[1-9]\d*$/.test(row.inode||''),'Renderer library is not a bound executable mapping');assert.equal(row.bytes,pin.bytes,'Renderer bytes differ from original SDK');assert.equal(row.sha256,pin.sha256,'Renderer hash differs from original SDK');
    return {path,bytes:row.bytes,sha256:row.sha256,inode:row.inode,executableMapping:true};
  });
  return {verified:true,files,owner:{pid:owner.pid,startTicks:owner.startTicks},snapshotOnly:true,lifetimeModuleCoverageProven:false};
}
export function assertSwangleRenderer(log,loaded,reference,owner){
  assert.equal(typeof log,'string','Require actual verbose renderer log');
  const [backend]=one(log,/^INFO\s*\|\s*Graphics backend:\s*(\S+)\s*$/gm,'backend');
  const [vulkanMode,glesMode]=one(log,/^INFO\s*\|\s*emuglConfig_init: vulkan_mode_selected:(\S+) gles_mode_selected:(\S+)\s*$/gm,'selected modes');
  const [renderer]=one(log,/^DEBUG\s*\|\s*setCurrentRenderer:\s*(.+?)\s*$/gm,'current renderer');
  const [vulkanActive]=one(log,/^DEBUG\s*\|\s*gfxstreamFeature:Vulkan = ([01])\s*$/gm,'Vulkan activation');
  const [adapter]=one(log,/^INFO\s*\|\s*Graphics Adapter (?!Vendor)(.+?)\s*$/gm,'adapter');
  const [api]=one(log,/^INFO\s*\|\s*Graphics API Version (.+?)\s*$/gm,'API');
  assert.ok(backend==='gfxstream'&&vulkanMode==='swiftshader'&&glesMode==='swangle'&&renderer==='swangle swiftshader gles:Angle Indirect vulkan:Swiftshader Indirect'&&vulkanActive==='0','Actual selection is not the required SwANGLE path');
  assert.ok(/SwiftShader/i.test(adapter)&&/OpenGL ES 3\.[012](?:\D|$).*(?:ANGLE|SwiftShader)/i.test(api),'Actual adapter/API does not identify the software GLES3 stack');
  assert.match(log,/Performing composition using CompositorGl\./,'Original GL composition path changed');assert.doesNotMatch(log,/(?:GPU|GLES|renderer|graphics)[^\r\n]*(?:fallback|falling back)|(?:fallback|falling back)[^\r\n]*(?:GPU|GLES|renderer|graphics)|GPU emulation (?:disabled|is disabled)/i,'Renderer fallback is not accepted');
  const capabilities=assertRendererCapabilities(log),libraries=assertSwangleLibraries(loaded,reference,owner);
  return {verified:true,gpu:'swangle',rendererRoute:'ANGLE+SwiftShader',backend,vulkanMode,glesMode,renderer,vulkanActive:Number(vulkanActive),adapter,api,capabilities,libraries,loadedLibrariesVerified:true,lifetimeModuleCoverageProven:false,exclusiveProviderExecutionProven:false};
}
export function selectionRecord(selected,error){return error?{...selected,verified:false,error}:selected??{verified:false,error:'Selection unavailable'};}
export function runRendererPhase(phase,env=process.env){
  assert.ok(['snapshot','verify','verify-after'].includes(phase),'Require SwANGLE snapshot/verification phase');
  const out=resolve('artifacts/android-native-isolated');mkdirSync(out,{recursive:true});
  const report={source:env.ANDROID_QA_SOURCE,device:env.ANDROID_QA_DEVICE,avd:env.ANDROID_QA_AVD,phase,requestedGpu:'swangle',compatible:false,startedAtUtc:new Date().toISOString()};let selected;
  try{
    assert.equal(report.source,SOURCE);assert.equal(report.device,'emulator-5582');assert.match(report.avd||'',/^sogrim_ci_\d+_1_swangle$/);report.sdk=readRendererSdk(env.ANDROID_HOME);
    if(phase==='snapshot')report.prepared=true;
    else{
      const prior=JSON.parse(readFileSync(join(out,'renderer-sdk.json'),'utf8'));assert.equal(prior.prepared,true);for(const k of ['source','device','avd','requestedGpu'])assert.equal(prior[k],report[k]);assert.deepEqual(prior.sdk,report.sdk,'Renderer SDK changed');
      const owner=JSON.parse(readFileSync(join(out,'diagnostic-owner.json'),'utf8'));assert.equal(Number(env.ANDROID_QA_EMULATOR_PID),owner.pid);assert.equal(Number(readFileSync(join(out,'emulator.pid'),'utf8')),owner.pid);assert.equal(owner.avd,report.avd);assert.equal(owner.sdk,resolve(env.ANDROID_HOME));const before=readOwner(owner);
      const loaded=JSON.parse(readFileSync(join(out,phase==='verify'?'loaded-sdk-identity.json':'loaded-sdk-after-identity.json'),'utf8'));const reference=readSdkReference(readFileSync(new URL('./reference-sdk-binaries.json',import.meta.url)));
      selected=assertSwangleRenderer(readFileSync(join(out,'emulator.log'),'utf8'),loaded,reference,before);readOwner(owner);report.compatible=true;report.renderer=selected;
    }
  }catch(error){report.error=error.stack;process.exitCode=1;}
  report.completedAtUtc=new Date().toISOString();writeFileSync(join(out,phase==='snapshot'?'renderer-sdk.json':phase==='verify'?'renderer-capabilities.json':'renderer-after.json'),JSON.stringify(report,null,2)+'\n');
  if(phase!=='snapshot')writeFileSync(join(out,phase==='verify'?'effective-renderer.json':'effective-renderer-after.json'),JSON.stringify(selectionRecord(selected,report.error),null,2)+'\n');console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{runRendererPhase(process.argv[2]);}catch(error){console.error(error.stack);process.exitCode=1;}
