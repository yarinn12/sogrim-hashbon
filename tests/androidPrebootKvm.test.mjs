import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareOwnedKvm} from '../scripts/qa/android-renderer-ab/preboot-kvm.mjs';
const uid=1001,proof='KVM (version 12) is installed and usable.';
function environment(change={}){
 let accessible=false,grants=0;
 const device={path:'/dev/kvm',canonicalPath:'/dev/kvm',character:true,dev:6,ino:137,rdev:2688,acl:'user::rw-\nuser:1001:---\n',...change};
 return {device,get grants(){return grants;},options:{uid,
   observe:async()=>({...device,accessible}),grant:async actual=>{assert.equal(actual,uid);grants++;accessible=true;},
   checkAcceleration:async()=>{assert.equal(accessible,true);return proof;}}};
}
test('each arm restores and proves the original KVM launch precondition; OLD one-time grant fails the second inaccessible arm',async t=>{
 const a=environment(),records=[];
 const first=await prepareOwnedKvm({...a.options,onRecord:r=>records.push(r)});
 assert.equal(first.ready,true);assert.equal(a.grants,1);assert.equal(records[0].before.accessible,false);
 const b=environment();const second=await prepareOwnedKvm({...b.options,priorDevice:first.after});
 assert.equal(second.ready,true);assert.equal(b.grants,1);assert.equal(second.uid,first.uid);
 const directory=mkdtempSync(join(tmpdir(),'kvm-preboot-control-')),file=join(directory,'old-one-time-grant.mjs');
 t.after(()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));unlinkSync(file);rmdirSync(directory);});
 const source=readFileSync(new URL('../scripts/qa/android-renderer-ab/preboot-kvm.mjs',import.meta.url),'utf8');
 const old=source.replace('  await grant(uid);','  // Controlled OLD: setup was performed only before arm A.');
 assert.notEqual(source,old);writeFileSync(file,old);
 const baseline=await import(pathToFileURL(file));
 await assert.rejects(()=>baseline.prepareOwnedKvm({...environment().options,priorDevice:first.after}),/read\/write access remains unavailable/);
});
test('redirected, non-character or changed KVM devices cannot receive or retain a launch grant',async()=>{
 for(const change of [{canonicalPath:'/other/device'},{character:false},{ino:undefined}]){
  const e=environment(change);await assert.rejects(prepareOwnedKvm(e.options));assert.equal(e.grants,0);
 }
 const e=environment();let reads=0;
 await assert.rejects(prepareOwnedKvm({...e.options,observe:async()=>({...e.device,accessible:true,ino:++reads===1?137:138})}),/changed during access setup/);
 await assert.rejects(prepareOwnedKvm({...environment().options,priorDevice:{...e.device,ino:999}}),/changed between arms/);
});
test('unknown uid, failed grants and unavailable hardware acceleration remain terminal',async()=>{
 for(const uid of [0,-1,NaN,'1001'])await assert.rejects(prepareOwnedKvm({...environment().options,uid}),/current non-root CI uid/);
 await assert.rejects(prepareOwnedKvm({...environment().options,grant:async()=>{throw Error('setfacl failed');}}),/setfacl failed/);
 await assert.rejects(prepareOwnedKvm({...environment().options,checkAcceleration:async()=>'KVM DISABLED'}),/same actual KVM accelerator/);
 await assert.rejects(prepareOwnedKvm({...environment().options,checkAcceleration:async()=>{throw Error('accel-check exit1');}}),/accel-check exit1/);
});
