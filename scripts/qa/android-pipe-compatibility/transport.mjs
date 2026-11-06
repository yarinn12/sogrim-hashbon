import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertAsgSchema,assertAsgSelection,ASG_BUFFERS} from '../android-native-isolated/gltransport.mjs';
import {assertRendererSelection,assertRendererCapabilities} from '../android-native-isolated/renderer-capabilities.mjs';
import {SCHEMA_SHA} from './contract.mjs';
export function verifySchema(bytes){
  assert.equal(createHash('sha256').update(bytes).digest('hex'),SCHEMA_SHA,'Installed transport schema differs');
  const checked=assertAsgSchema(bytes),block=bytes.toString('utf8').split(/\r?\n\s*\r?\n/).find(b=>/^name\s*=\s*hw\.gltransport\s*$/m.test(b));
  assert.ok(block?.match(/^enum\s*=\s*(.+)$/m)?.[1].split(',').map(x=>x.trim()).includes('pipe'),'Exact SDK does not declare pipe');return checked;
}
function effective(log,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const values=[...log.matchAll(new RegExp('(?:^|\\|)\\s*'+escaped+'\\s*=\\s*"?([^"\\s]+)"?\\s*$','gm'))].map(x=>x[1]);
  assert.ok(values.length&&new Set(values).size===1,'Absent/conflicting effective setting: '+key);return values[0];
}
export function verifyTransport(log,guest,mode){
  assert.ok(['asg','pipe'].includes(mode),'Unapproved transport');
  if(mode==='asg')return assertAsgSelection(log,guest);
  for(const key of ['hw.gltransport','androidboot.hardware.gltransport','androidboot.qemu.gltransport.name'])assert.equal(effective(log,key),mode,'Transport not applied: '+key);
  for(const key of ['ro.boot.hardware.gltransport','ro.boot.qemu.gltransport.name'])assert.equal(guest[key],mode,'Guest transport differs: '+key);
  assert.ok(guest['ro.boot.qemu.gltransport']===''||guest['ro.boot.qemu.gltransport']===mode,'Conflicting legacy transport');
  assert.equal(guest['ro.hardware.egl'],'emulation');assert.equal(guest['ro.hardware.gralloc'],'ranchu');
  for(const [key,value] of Object.entries(ASG_BUFFERS))assert.equal(effective(log,key),value,'Buffer changed: '+key);
  assert.equal(effective(log,'androidboot.debug.hwui.renderer'),'skiagl');
  for(const key of ['Minigbm','VirtioGpuNext'])assert.equal(effective(log,'gfxstreamFeature:'+key),'0');
  assert.doesNotMatch(log,/Failed to create .*AddressSpace|Trying to create ASG stream in unsupported|gltransport.*fallback/i);
  return {transport:mode,verified:true,guest,buffers:ASG_BUFFERS,renderer:assertRendererSelection(log),capabilities:assertRendererCapabilities(log),streamExecutionProven:false};
}
