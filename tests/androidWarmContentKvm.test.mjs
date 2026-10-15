import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const wrapper=readFileSync(new URL('../scripts/qa/android-native-isolated/warm-content/arm.sh',import.meta.url),'utf8').replaceAll('\r\n','\n');
const begin=wrapper.indexOf('prepare_owned_kvm() {'),end=wrapper.indexOf('\nowner_valid() {',begin);
assert.ok(begin>=0&&end>begin,'Actual warm-content arm must provide its per-session KVM preflight');
const preflight=wrapper.slice(begin,end);
// Execute the actual caller and SDK launch, not a handwritten call to the helper.
const launchBegin=wrapper.indexOf('node scripts/qa/android-native-isolated/renderer-capabilities.mjs snapshot\n',end);
const launchEnd=wrapper.indexOf('\nemulator_pid=$!',launchBegin);
assert.ok(launchBegin>end&&launchEnd>launchBegin,'Actual warm-content arm launch boundary must remain observable');
const launchBoundary=wrapper.slice(launchBegin,launchEnd);

function run(t,scenario){
 const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'warm-kvm-preflight-'));
 t.after(()=>{assert.equal(dirname(resolve(root)),parent);assert.ok(basename(root).startsWith('warm-kvm-preflight-'));rmSync(root,{recursive:true,force:true});});
 const prefix="#!/usr/bin/env bash\nset -euo pipefail\nexport PATH=\"/usr/bin:$PATH\"\nscenario=\"$1\"\nout=\"$PWD/raw\"; mkdir -p \"$out\" \"$PWD/sdk/emulator\"\nexport ANDROID_HOME=\"$PWD/sdk\"\nexport ANDROID_QA_AVD=synthetic_owned_avd\nnode(){ :; }\nexport KVM_TEST_STATE=\"$PWD/state\" KVM_TEST_CALLS=\"$PWD/calls\" KVM_TEST_SCENARIO=\"$scenario\"\nprintf '1\\n' > \"$KVM_TEST_STATE\"\ntest(){ if [[ \"$*\" = '-c /dev/kvm' ]]; then [[ \"$scenario\" != missing-device ]]; else builtin test \"$@\"; fi; }\nid(){ printf 'uid=1001 synthetic-fixture\\n'; }\nstat(){ printf '10:232:1001:993:660\\n'; }\ngetfacl(){ printf 'synthetic effective-access='; cat \"$KVM_TEST_STATE\"; }\nsudo(){\n printf 'grant\\n' >> \"$KVM_TEST_CALLS\"\n if [[ \"$scenario\" = grant-denied ]]; then return 13; fi\n [[ \"$*\" = \"setfacl -m u:$USER:rw /dev/kvm\" ]] || return 14\n printf '1\\n' > \"$KVM_TEST_STATE\"\n}\ncat > \"$ANDROID_HOME/emulator/emulator\" <<'SDK'\n#!/usr/bin/env bash\nprintf 'sdk %s\\n' \"$*\" >> \"$KVM_TEST_CALLS\"\nif [[ \"$(cat \"$KVM_TEST_STATE\")\" != 1 || \"$KVM_TEST_SCENARIO\" = unavailable ]]; then\n printf 'synthetic KVM access unavailable\\n' >&2; exit 77\nfi\nprintf 'synthetic KVM installed and usable\\n'\nSDK\nchmod +x \"$ANDROID_HOME/emulator/emulator\"\n";
 const script=join(root,'exercise.sh');writeFileSync(script,prefix+'\n'+preflight+'\n'+launchBoundary+'\nfirst_pid=$!; wait \"$first_pid\"\nprintf \"0\\n\" > \"$KVM_TEST_STATE\"\n'+launchBoundary+'\nsecond_pid=$!; wait \"$second_pid\"\nprintf \"ready\\n\" > \"$out/launch-ready\"\n');
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 const r=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:root,env:{...process.env,USER:process.env.USER||'synthetic_kvm_fixture'},encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(r.error,undefined,String(r.error));
 const calls=existsSync(join(root,'calls'))?readFileSync(join(root,'calls'),'utf8').trim().split('\n'):[];
 return {r,root,out:join(root,'raw'),calls};
}
test('each fresh arm restores effective KVM access before the SDK probe even after a prior reset',t=>{
 const f=run(t,'reset-between-arms');assert.equal(f.r.status,0,f.r.stderr);
 const launch='sdk -avd synthetic_owned_avd -port 5582 -no-window -no-snapshot -no-audio -no-boot-anim -gpu swiftshader -feature GLDirectMem,HasSharedSlotsHostMemoryAllocator -verbose -memory 4096 -cores 2';
 assert.deepEqual(f.calls,['grant','sdk -accel-check',launch,'grant','sdk -accel-check',launch]);
 assert.match(readFileSync(join(f.out,'kvm-before.acl'),'utf8'),/access=0/);
 assert.match(readFileSync(join(f.out,'kvm-after.acl'),'utf8'),/access=1/);
 assert.equal(existsSync(join(f.out,'launch-ready')),true);
});
test('denied KVM grant aborts before the SDK probe while preserving before-state evidence',t=>{
 const f=run(t,'grant-denied');assert.equal(f.r.status,13);assert.deepEqual(f.calls,['grant']);
 assert.equal(existsSync(join(f.out,'kvm-before.acl')),true);assert.equal(existsSync(join(f.out,'launch-ready')),false);
});
test('an unusable SDK acceleration result remains failing after a successful permission grant',t=>{
 const f=run(t,'unavailable');assert.equal(f.r.status,77);assert.deepEqual(f.calls,['grant','sdk -accel-check']);
 assert.match(readFileSync(join(f.out,'kvm-accel-check.log'),'utf8'),/unavailable/);assert.equal(existsSync(join(f.out,'launch-ready')),false);
});
test('missing KVM character device cannot trigger a grant or claim launch readiness',t=>{
 const f=run(t,'missing-device');assert.equal(f.r.status,1);assert.deepEqual(f.calls,[]);assert.equal(existsSync(join(f.out,'launch-ready')),false);
});
