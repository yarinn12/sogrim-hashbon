import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ASG_PROPERTIES,ASG_BUFFERS,assertAsgSchema} from '../android-native-isolated/gltransport.mjs';
import {assertSwangleRenderer} from './renderer.mjs';
import {SCHEMA_SHA} from './contract.mjs';
export {ASG_PROPERTIES};
export function verifySchema(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),SCHEMA_SHA,'Original ASG schema changed');return assertAsgSchema(bytes);}
function setting(text,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const rows=[...text.matchAll(new RegExp('(?:^|\\|)\\s*'+escaped+'\\s*=\\s*"?([^"\\s]+)"?\\s*$','gm'))].map(r=>r[1]);assert.ok(rows.length&&new Set(rows).size===1,'Missing/conflicting original ASG setting: '+key);return rows[0];
}
export function verifyTransport(log,guest,loaded,reference,owner){
  for(const key of ['hw.gltransport','androidboot.hardware.gltransport','androidboot.qemu.gltransport.name'])assert.equal(setting(log,key),'asg','ASG not applied');
  for(const key of ASG_PROPERTIES.slice(0,2))assert.equal(guest[key],'asg','Guest ASG not applied');
  assert.ok(guest['ro.boot.qemu.gltransport']===''||guest['ro.boot.qemu.gltransport']==='asg','Conflicting legacy transport');assert.equal(guest['ro.hardware.egl'],'emulation');assert.equal(guest['ro.hardware.gralloc'],'ranchu');
  for(const [key,value] of Object.entries(ASG_BUFFERS))assert.equal(setting(log,key),value,'Original buffer changed');assert.equal(setting(log,'androidboot.debug.hwui.renderer'),'skiagl');
  for(const key of ['Minigbm','VirtioGpuNext'])assert.equal(setting(log,'gfxstreamFeature:'+key),'0','Original host graphics path changed');
  assert.doesNotMatch(log,/Failed to create .*AddressSpace|Trying to create ASG stream in unsupported|gltransport.*fallback/i);
  return {transport:'asg',verified:true,guest,buffers:ASG_BUFFERS,renderer:assertSwangleRenderer(log,loaded,reference,owner),streamExecutionProven:false};
}
