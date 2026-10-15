import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertHostOwner} from './trace-diagnostics.mjs';
import {readRendererSdk,assertRendererCapabilities,assertRendererSelection} from './renderer-capabilities.mjs';

export const ASG_BUFFERS=Object.freeze({
  'hw.gltransport.asg.writeBufferSize':'1048576','hw.gltransport.asg.writeStepSize':'4096',
  'hw.gltransport.asg.dataRingSize':'32768','hw.gltransport.drawFlushInterval':'800',
});
export const ASG_PROPERTIES=Object.freeze(['ro.boot.hardware.gltransport','ro.boot.qemu.gltransport.name','ro.boot.qemu.gltransport','ro.hardware.egl','ro.hardware.gralloc']);
function setting(text,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const values=[...text.matchAll(new RegExp('(?:^|\\|)\\s*'+escaped+'\\s*=\\s*"?([^"\\s]+)"?\\s*$','gm'))].map(r=>r[1]);
  assert.ok(values.length&&new Set(values).size===1,'Missing/conflicting effective transport setting: '+key);return values[0];
}
export function assertAsgSchema(bytes){
  const blocks=bytes.toString('utf8').split(/\r?\n\s*\r?\n/),definitions=new Map();
  for(const block of blocks){const names=[...block.matchAll(/^name\s*=\s*(\S+)\s*$/gm)];assert.ok(names.length<=1,'Ambiguous transport schema block');const name=names[0]?.[1];if(name){assert.ok(!definitions.has(name),'Duplicate transport schema property');definitions.set(name,block);}}
  const transport=definitions.get('hw.gltransport');assert.ok(transport,'Missing SDK transport schema');
  assert.match(transport,/^type\s*=\s*string\s*$/m);
  const enums=[...transport.matchAll(/^enum\s*=\s*(.+)$/gm)];assert.equal(enums.length,1,'Missing/ambiguous SDK transport enum');
  const modes=enums[0][1].split(',').map(s=>s.trim());assert.ok(modes.includes('asg')&&new Set(modes).size===modes.length,'SDK schema does not support unambiguous ASG');
  for(const [key,value] of Object.entries(ASG_BUFFERS)){const defaults=[...(definitions.get(key)||'').matchAll(/^default\s*=\s*(\S+)\s*$/gm)];assert.equal(defaults.length,1,'Missing/ambiguous SDK buffer default');assert.equal(defaults[0][1],value,'SDK buffer default changed: '+key);}
  return {sha256:createHash('sha256').update(bytes).digest('hex'),asgSupported:true,buffers:ASG_BUFFERS};
}
export function assertAsgSelection(log,guest){
  for(const key of ['hw.gltransport','androidboot.hardware.gltransport','androidboot.qemu.gltransport.name'])assert.equal(setting(log,key),'asg','ASG not applied or fallback: '+key);
  for(const key of ASG_PROPERTIES.slice(0,2))assert.equal(guest[key],'asg','Guest ASG not applied: '+key);
  assert.ok(guest['ro.boot.qemu.gltransport']===''||guest['ro.boot.qemu.gltransport']==='asg','Conflicting legacy guest transport');
  assert.equal(guest['ro.hardware.egl'],'emulation');assert.equal(guest['ro.hardware.gralloc'],'ranchu');
  for(const [key,value] of Object.entries(ASG_BUFFERS))assert.equal(setting(log,key),value,'Effective ASG buffer changed: '+key);
  assert.equal(setting(log,'androidboot.debug.hwui.renderer'),'skiagl','HWUI renderer changed');
  for(const key of ['Minigbm','VirtioGpuNext'])assert.equal(setting(log,'gfxstreamFeature:'+key),'0','Unexpected host graphics path');
  assert.doesNotMatch(log,/Failed to create .*AddressSpace|Trying to create ASG stream in unsupported|gltransport.*fallback/i);
  return {transport:'asg',verified:true,guest,buffers:ASG_BUFFERS,renderer:assertRendererSelection(log),capabilities:assertRendererCapabilities(log),streamExecutionProven:false};
}
export function readAsgSdk(sdkHome){
  return {renderer:readRendererSdk(sdkHome),schema:assertAsgSchema(readFileSync(join(sdkHome,'emulator/lib/hardware-properties.ini')))};
}
export function verifyOwnedAsg(options,{run=spawnSync,owner=assertHostOwner,onRecord=()=>{}}={}){
  assert.match(options.source||'',/^[a-f0-9]{40}$/);assert.equal(options.device,'emulator-5582');assert.match(options.avd||'',/^sogrim_ci_[a-z0-9_]+$/);
  assert.equal(options.adbPath,join(options.sdkHome,'platform-tools/adb'),'Require exact SDK ADB path');
  assert.ok(Number.isSafeInteger(options.emulatorPid)&&options.emulatorPid>1,'Require explicit owned emulator PID');
  const initial=owner(options),guest={};
  const check=()=>{const current=owner(options,{expectedStartTicks:initial.startTicks});assert.equal(current.pid,initial.pid);assert.equal(current.startTicks,initial.startTicks);};
  for(const key of ASG_PROPERTIES){
    check();const result=run(options.adbPath,['-s',options.device,'shell','getprop',key],{encoding:'utf8',timeout:20000,windowsHide:true});
    const readback={key,status:result.status,stdout:String(result.stdout??''),stderr:String(result.stderr??''),error:result.error?.message??null,signal:result.signal??null,ownershipVerifiedAfter:false};
    try{check();readback.ownershipVerifiedAfter=true;}finally{onRecord(readback);}
    assert.equal(result.status,0,'ASG guest read failed: '+key);assert.ok(!result.error&&!result.signal&&!result.stderr?.trim(),'ASG guest read unavailable: '+key);guest[key]=String(result.stdout??'').trim();
  }
  return {...assertAsgSelection(options.log,guest),owner:initial};
}
function main(){
  const phase=process.argv[2],out=resolve('artifacts/android-native-isolated'),sdkHome=resolve(process.env.ANDROID_HOME||'');
  assert.ok(['snapshot','verify'].includes(phase));assert.ok(process.env.ANDROID_HOME,'Require Android SDK');
  const report={source:process.env.ANDROID_QA_SOURCE,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,requestedTransport:'asg',verified:false};
  mkdirSync(out,{recursive:true});
  try{
    report.sdk=readAsgSdk(sdkHome);
    if(phase==='snapshot')report.prepared=true;
    else{
      const prior=JSON.parse(readFileSync(join(out,'transport-sdk.json'),'utf8'));
      for(const key of ['source','device','avd','requestedTransport'])assert.equal(prior[key],report[key],'Transport preparation identity changed');
      assert.equal(prior.prepared,true);assert.deepEqual(prior.sdk,report.sdk,'Transport SDK/schema changed after preparation');
      const pid=Number(process.env.ANDROID_QA_EMULATOR_PID);assert.equal(pid,Number(readFileSync(join(out,'emulator.pid'),'utf8')));
      report.readbacks=[];
      Object.assign(report,verifyOwnedAsg({...report,emulatorPid:pid,sdkHome,adbPath:process.env.ADB_PATH,log:readFileSync(join(out,'emulator.log'),'utf8')},{onRecord:r=>report.readbacks.push(r)}));
    }
  }catch(error){report.error=error.stack;process.exitCode=1;}
  finally{writeFileSync(join(out,phase==='snapshot'?'transport-sdk.json':'effective-transport.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
