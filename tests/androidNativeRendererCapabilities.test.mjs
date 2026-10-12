import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
const {assertRendererCapabilities,readRendererSdk}=await import(process.env.ANDROID_QA_RENDERER_TEST_MODULE||'../scripts/qa/android-native-isolated/renderer-capabilities.mjs');
// Source-shaped runtime readbacks emitted by AOSP opengles.cpp; CLI requests
// and SDK defaults alone never establish the negotiated gfxstream feature state.
const direct='DEBUG        | gfxstreamFeature:GlDirectMem = 1';
const shared='DEBUG        | gfxstreamFeature:HasSharedSlotsHostMemoryAllocator = 1';

test('CLI enable requests cannot hide a renderer that still lacks DMA support',()=>{
  const requested="INFO | Feature 'GLDirectMem' (88) is overridden to 'enabled'\nINFO | Feature 'HasSharedSlotsHostMemoryAllocator' (110) is overridden to 'enabled'";
  assert.throws(()=>assertRendererCapabilities(requested+'\n'+direct.replace('= 1','= 0')+'\n'+shared),/acknowledge required DMA capabilities/);
  assert.throws(()=>assertRendererCapabilities(requested+'\n'+direct+'\n'+shared.replace('= 1','= 0')),/acknowledge required DMA capabilities/);
  assert.throws(()=>assertRendererCapabilities(requested),/acknowledge required DMA capabilities/);
});

test('both negotiated DMA prerequisites are required and an exact healthy readback passes',()=>{
  for(const log of ['',null,direct,shared,'INFO | gfxstreamFeature:GlDirectMem = 1\n'+shared,direct+'\nDEBUG | gfxstreamFeature:HasSharedSlotsHostMemoryAllocatorExtra = 1'])assert.throws(()=>assertRendererCapabilities(log));
  assert.deepEqual(assertRendererCapabilities(direct+'\r\n'+shared+'\nDEBUG | gfxstreamFeature:GlDma = 1'),{compatible:true,observations:{GlDirectMem:[1],HasSharedSlotsHostMemoryAllocator:[1]}});
});

test('a later enabled line never conceals an earlier unsupported or ambiguous renderer initialization',()=>{
  for(const extra of [direct,direct.replace('= 1','= 0'),shared.replace('= 1','= 0')])assert.throws(()=>assertRendererCapabilities(extra+'\n'+direct+'\n'+shared),/acknowledge required DMA capabilities/);
});

test('SDK receipt reads real package files and rejects a guest lacking the required protocol',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'sogrim-renderer-sdk-'));
  const files={'emulator/lib/advancedFeatures.ini':'GLDirectMem = off\nHasSharedSlotsHostMemoryAllocator = on\nGLDMA = on\nGLDMA2 = on\n','emulator/source.properties':'Pkg.Revision=37.2.12\n','system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini':'GLDirectMem = on\n','system-images/android-36.1/google_apis_playstore/x86_64/source.properties':'Pkg.Revision=9\n'};
  for(const [path,text] of Object.entries(files)){mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),text);}
  const receipt=readRendererSdk(root);assert.equal(receipt.files.hostFeatures.values.GLDirectMem,'off');assert.equal(receipt.files.hostVersion.revision,'37.2.12');assert.match(receipt.files.guestFeatures.sha256,/^[0-9a-f]{64}$/);
  const guest=resolve(root,'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini');writeFileSync(guest,'GLDirectMem = off\n');assert.throws(()=>readRendererSdk(root),/guest must support/);
  writeFileSync(guest,'GLDirectMem = on\nGLDirectMem = off\n');assert.throws(()=>readRendererSdk(root),/Ambiguous SDK setting/);
  writeFileSync(guest,'GLDirectMem = on\n');const host=resolve(root,'emulator/lib/advancedFeatures.ini');writeFileSync(host,readFileSync(host,'utf8').replace('HasSharedSlotsHostMemoryAllocator = on',''));assert.throws(()=>readRendererSdk(root),/does not declare supported feature/);
});
