import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {assertAsgSchema,assertAsgSelection,verifyOwnedAsg,ASG_BUFFERS,ASG_PROPERTIES} from '../scripts/qa/android-native-isolated/gltransport.mjs';

// Verbatim selected host lines from original artifact11967613256, run38724147635.
// ZIP SHA256 4e7361e0c8ddd8cf7a0bc6e2301b5ae663a69b7bdca6946acae2bdc3ba880268.
const log=readFileSync(new URL('./fixtures/android-native-asg-host-38724147635.txt',import.meta.url),'utf8');
const guest={'ro.boot.hardware.gltransport':'asg','ro.boot.qemu.gltransport.name':'asg','ro.boot.qemu.gltransport':'','ro.hardware.egl':'emulation','ro.hardware.gralloc':'ranchu'};
const schema=()=>Buffer.from('name = hw.gltransport\ntype = string\ndefault = pipe\nenum = tcp, pipe, virtio-gpu, asg\n\n'+Object.entries(ASG_BUFFERS).map(([name,value])=>`name = ${name}\ntype = integer\ndefault = ${value}\n`).join('\n'));

test('actual ASG host lines and guest properties bind the original renderer and buffers',()=>{
  const result=assertAsgSelection(log,guest);assert.equal(result.verified,true);assert.equal(result.transport,'asg');
  assert.equal(result.renderer.glesMode,'swiftshader');assert.equal(result.streamExecutionProven,false);
  assert.deepEqual(result.buffers,ASG_BUFFERS);
});
test('SDK schema must support ASG with unchanged unambiguous buffer defaults',()=>{
  assert.equal(assertAsgSchema(schema()).asgSupported,true);
  for(const value of [schema().toString().replace(', asg',''),schema().toString().replace('1048576','2097152'),schema().toString()+'\nname = hw.gltransport\ntype = string\n',schema().toString().replace('default = 4096','default = 4096\ndefault = 8192')])assert.throws(()=>assertAsgSchema(Buffer.from(value)));
});
test('host or guest PIPE fallback is terminal even when SwiftShader remains correct',()=>{
  assert.throws(()=>assertAsgSelection(log.replaceAll('=asg','=pipe').replace('hw.gltransport = asg','hw.gltransport = pipe'),guest),/fallback|not applied/);
  assert.throws(()=>assertAsgSelection(log,{...guest,'ro.boot.hardware.gltransport':'pipe'}),/Guest ASG/);
  assert.throws(()=>assertAsgSelection(log,{...guest,'ro.boot.qemu.gltransport':'pipe'}),/Conflicting legacy/);
});
for(const [before,after] of [['writeBufferSize = 1048576','writeBufferSize = 2097152'],['gfxstreamFeature:Vulkan = 0','gfxstreamFeature:Vulkan = 1'],['gfxstreamFeature:Minigbm = 0','gfxstreamFeature:Minigbm = 1'],['gles_mode_selected:swiftshader','gles_mode_selected:swangle']])test('ASG cannot hide another changed control: '+before,()=>assert.throws(()=>assertAsgSelection(log.replace(before,after),guest)));
test('missing or conflicting host transport evidence cannot borrow a good guest value',()=>{
  assert.throws(()=>assertAsgSelection(log.split('\n').filter(l=>!l.includes('androidboot.qemu.gltransport.name=')).join('\n'),guest));
  assert.throws(()=>assertAsgSelection(log+'\nINFO | hw.gltransport = pipe',guest));
});

function boundary(){
  const options={source:'a'.repeat(40),device:'emulator-5582',avd:'sogrim_ci_asg_fixture',emulatorPid:3441,sdkHome:'/sdk',adbPath:join('/sdk','platform-tools/adb'),log},calls=[],receipts=[];
  const owner=()=>({pid:3441,startTicks:'12345'}),run=(binary,args,settings)=>{calls.push({binary,args,settings});return{status:0,stdout:guest[args.at(-1)]+'\n',stderr:''};};
  return {options,calls,receipts,deps:{owner,run,onRecord:r=>receipts.push(r)}};
}
test('owned transport readback uses only exact SDK serial and bounded read-only commands',()=>{
  const f=boundary(),result=verifyOwnedAsg(f.options,f.deps);assert.equal(result.verified,true);
  assert.deepEqual(f.calls.map(c=>c.args.at(-1)),ASG_PROPERTIES);
  assert.ok(f.calls.every(c=>c.binary===f.options.adbPath&&c.settings.timeout===20000&&c.args.slice(0,4).join(' ')==='-s emulator-5582 shell getprop'));
  assert.ok(f.receipts.every(r=>r.ownershipVerifiedAfter));
});
test('owner reuse during read prevents acceptance and retains the untrusted readback',()=>{
  const f=boundary();let checks=0;f.deps.owner=()=>({pid:3441,startTicks:++checks===3?'99999':'12345'});
  assert.throws(()=>verifyOwnedAsg(f.options,f.deps));assert.equal(f.calls.length,1);assert.equal(f.receipts[0].ownershipVerifiedAfter,false);
});
test('missing failed timed-out or noisy guest readback never triggers a retry',()=>{
  for(const value of [{status:1,stdout:'',stderr:'device offline'},{status:0,stdout:'asg',stderr:'warning'}, {status:null,error:new Error('timed out')}, {status:0,stdout:'',stderr:''}]){
    const f=boundary();f.deps.run=(...args)=>{f.calls.push(args);return value;};assert.throws(()=>verifyOwnedAsg(f.options,f.deps));
    assert.ok(f.calls.length<=ASG_PROPERTIES.length);assert.equal(f.calls.filter(c=>c[1].at(-1)==='ro.boot.hardware.gltransport').length,1);
  }
});
test('foreign serial ADB path or missing PID is rejected before any SDK read',()=>{
  for(const change of [{device:'emulator-5584'},{adbPath:'/other/adb'},{emulatorPid:0}]){
    const f=boundary();assert.throws(()=>verifyOwnedAsg({...f.options,...change},f.deps));assert.equal(f.calls.length,0);
  }
});
test('workflow selects ASG once and verifies transport before the unchanged measurement stages',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  assert.match(workflow,/'hw\.gltransport':'asg'/);
  assert.ok(workflow.indexOf('gltransport.mjs snapshot')<workflow.indexOf('Boot only the owned AVD'));
  assert.ok(workflow.indexOf('gltransport.mjs verify')<workflow.indexOf('trace-diagnostics.mjs start'));
  assert.ok(workflow.indexOf('gltransport.mjs verify')<workflow.indexOf('font-regression.mjs'));
  assert.match(workflow,/-gpu swiftshader -feature GLDirectMem,HasSharedSlotsHostMemoryAllocator/);
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.git.deploymentEnabled['codex/android-asg-qa-coverage-20261015'],false);
});
