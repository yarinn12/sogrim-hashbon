import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const wrapper=readFileSync(new URL('../scripts/qa/android-native-isolated/pages-restart-arm.sh',import.meta.url),'utf8').replaceAll('\r\n','\n');
const begin=wrapper.indexOf('cleanup() {'),end=wrapper.indexOf('\ntrap cleanup EXIT',begin);
assert.ok(begin>=0&&end>begin);
const cleanup=wrapper.slice(begin,end);
function run(t,scenario,initialExit=0){
 const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'pages-restart-cleanup-'));
 t.after(()=>{assert.equal(dirname(resolve(root)),parent);assert.ok(basename(root).startsWith('pages-restart-cleanup-'));rmSync(root,{recursive:true,force:true});});
 const out=join(root,'raw'),archive=join(root,'archive');mkdirSync(out);
 writeFileSync(join(out,'capture.log'),'original synthetic capture\n');
 if(scenario==='wait-failure'){writeFileSync(join(out,'emulator.pid'),'1234\n');writeFileSync(join(out,'emulator-owner.json'),'{}');}
 const prefix="#!/usr/bin/env bash\nset -euo pipefail\nexport PATH=\"/usr/bin:$PATH\"\nscenario=\"$1\"\nout=\"$PWD/raw\"; destination=\"$PWD/archive\"\narm=A; index=1; ANDROID_QA_AVD=sogrim_ci_synthetic; ANDROID_QA_DEVICE=emulator-5582; ADB_PATH=synthetic-adb; tools=unused\nowner_valid(){ return 0; }\ntimeout(){ if [[ \"$*\" = *'avd name'* ]]; then printf '%s\\n' \"$ANDROID_QA_AVD\"; fi; return 0; }\nkill(){ return 1; }\nwait(){ printf '7\\n' > \"$out/synthetic-wait-exit.txt\"; return 7; }\npython3(){\n cat >/dev/null\n if [[ \"$scenario\" = manifest-failure ]]; then printf 'synthetic manifest failure\\n' >&2; return 9; fi\n printf '{\"synthetic\":true}\\n' > \"$out/wrapper-final-manifest.json\"\n}\nif [[ \"$scenario\" = wait-failure ]]; then emulator_pid=1234; fi\n";
 const script=join(root,'cleanup.sh');writeFileSync(script,prefix+'\n'+cleanup+'\ntrap cleanup EXIT\nexit '+initialExit+'\n');
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 const result=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.error,undefined,String(result.error));
 return {result,out,archive,receipt(){return JSON.parse(readFileSync(join(archive,'wrapper-exit.json'),'utf8'));}};
}
test('manifest failure retains the raw arm in the uploaded archive and fails closure',t=>{
 const f=run(t,'manifest-failure');
 assert.equal(existsSync(join(f.archive,'capture.log')),true,'manifest failure must not strand raw evidence outside uploaded artifacts');
 assert.equal(readFileSync(join(f.archive,'capture.log'),'utf8'),'original synthetic capture\n');
 assert.equal(f.result.status,1);
 const r=f.receipt();assert.equal(r.manifestExitCode,9);assert.equal(r.cleanupExitCode,1);assert.equal(r.nativeAcceptance,false);
 assert.match(readFileSync(join(f.archive,'wrapper-manifest.stderr.log'),'utf8'),/synthetic manifest failure/);
});
test('nonzero owned child wait is recorded and cannot report successful cleanup',t=>{
 const f=run(t,'wait-failure');
 assert.equal(readFileSync(join(f.archive,'synthetic-wait-exit.txt'),'utf8').trim(),'7');
 assert.equal(f.result.status,1,'wait failure must not be swallowed');
 const r=f.receipt();assert.equal(r.emulatorWaitExitCode,7);assert.equal(r.cleanupExitCode,1);assert.equal(r.nativeAcceptance,false);
});
test('successful capture archival keeps success and the exact raw bytes',t=>{
 const f=run(t,'success');assert.equal(f.result.status,0,f.result.stderr);
 assert.equal(readFileSync(join(f.archive,'capture.log'),'utf8'),'original synthetic capture\n');
 assert.equal(existsSync(f.out),false);const r=f.receipt();assert.equal(r.cleanupExitCode,0);
});
test('successful wrapper cleanup preserves an earlier failed diagnostic result',t=>{
 const f=run(t,'success',6);assert.equal(f.result.status,6);assert.equal(f.receipt().exitCode,6);assert.equal(f.receipt().cleanupExitCode,0);
});
