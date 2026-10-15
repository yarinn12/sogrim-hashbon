import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {actualFile,validateActualSdk,requireAppCheckout,requireStableProof,bindWorkflowInputs,requireOneShot,verifyOriginalHelpers} from '../scripts/qa/android-native-isolated/warm-content/workflow-proof.mjs';

const wrapper=readFileSync(new URL('../scripts/qa/android-native-isolated/warm-content/arm.sh',import.meta.url),'utf8').replaceAll('\r\n','\n');
const workflow=readFileSync(new URL('../.github/workflows/android-warm-content-abba-20261016.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
const begin=wrapper.indexOf('cleanup() {'),end=wrapper.indexOf('\ntrap cleanup EXIT',begin);assert.ok(begin>=0&&end>begin);const cleanup=wrapper.slice(begin,end);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
function temporary(t){const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'sogrim-warm-wrapper-'));t.after(()=>{assert.equal(dirname(resolve(root)),parent);assert.ok(basename(root).startsWith('sogrim-warm-wrapper-'));rmSync(root,{recursive:true,force:true});});return root;}
function runCleanup(t,scenario,initialExit=0){
  const root=temporary(t),out=join(root,'raw'),archive=join(root,'archive');mkdirSync(out);mkdirSync(join(root,'artifacts/android-warm-content'),{recursive:true});writeFileSync(join(out,'capture.log'),'original synthetic capture\n');
  const prefix=[
    '#!/usr/bin/env bash','set -euo pipefail','export PATH="/usr/bin:$PATH"','scenario="$1"',
    'out="$PWD/raw"; destination="$PWD/archive"; build="$PWD"; root="$PWD/source"; calls="$PWD/calls"',
    'arm=A; index=1; ANDROID_QA_AVD=sogrim_ci_synthetic; ANDROID_QA_DEVICE=emulator-5582; ADB_PATH=synthetic-adb; tools=unused',
    'export ANDROID_WARM_RAW_OUTPUT="$out"',
    'owner_valid(){ [[ "$scenario" != foreign-live && "$scenario" != early-exit ]]; }',
    'timeout(){ printf "adb %s\\n" "$*" >> "$calls"; if [[ "$*" = *"avd name"* ]]; then printf "%s\\n" "$ANDROID_QA_AVD"; fi; return 0; }',
    'kill(){ printf "signal %s\\n" "$*" >> "$calls"; [[ "$scenario" = foreign-live || "$scenario" = still-live ]]; }',
    'wait(){ printf "wait %s\\n" "$*" >> "$calls"; if [[ "$scenario" = wait-failure || "$scenario" = early-exit ]]; then return 7; fi; return 0; }',
    'sleep(){ :; }',
    'node(){ printf "proof %s\\n" "$*" >> "$calls"; if [[ "$scenario" = input-failure ]]; then return 5; fi; printf "{\\"ready\\":true}\\n" > "$3"; }',
    'python3(){ if [[ "$scenario" = manifest-failure ]]; then cat >/dev/null; printf "synthetic manifest failure\\n" >&2; return 9; fi; "$SOGRIM_TEST_PYTHON" "$@"; }',
    'if [[ "$scenario" = wait-failure || "$scenario" = early-exit || "$scenario" = foreign-live || "$scenario" = still-live ]]; then emulator_pid=1234; printf "1234\\n" > "$out/emulator.pid"; printf "{}\\n" > "$out/emulator-owner.json"; fi'
  ].join('\n');
  const script=join(root,'exercise.sh');writeFileSync(script,prefix+'\n'+cleanup+'\ntrap cleanup EXIT\nexit '+initialExit+'\n');
  const r=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:root,env:process.env,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined,String(r.error));
  return {root,out,archive,r,receipt(){return JSON.parse(readFileSync(join(archive,'wrapper-exit.json'),'utf8'));},calls(){return existsSync(join(root,'calls'))?readFileSync(join(root,'calls'),'utf8'):'';}};
}

test('warm cleanup uses actual manifest generator and retains exact raw inventory',t=>{
  const f=runCleanup(t,'success');assert.equal(f.r.status,0,f.r.stderr);assert.equal(existsSync(f.out),false);assert.equal(f.receipt().cleanupExitCode,0);
  const manifest=JSON.parse(readFileSync(join(f.archive,'wrapper-final-manifest.json'),'utf8'));
  assert.deepEqual(new Set(manifest.files.map(r=>r.path)),new Set(readdirSync(f.archive).filter(n=>!manifest.excludes.includes(n))));
  for(const r of manifest.files){const b=readFileSync(join(f.archive,r.path));assert.equal(b.length,r.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);}
});
test('warm manifest failure preserves capture, raw error and original exit',t=>{
  const f=runCleanup(t,'manifest-failure',6);assert.equal(f.r.status,1);assert.equal(readFileSync(join(f.archive,'capture.log'),'utf8'),'original synthetic capture\n');assert.equal(f.receipt().exitCode,6);assert.equal(f.receipt().manifestExitCode,9);assert.equal(f.receipt().cleanupExitCode,1);
});
test('warm post-arm input change cannot turn an otherwise passing arm into success',t=>{
  const f=runCleanup(t,'input-failure');assert.equal(f.r.status,1);assert.equal(f.receipt().inputProofExitCode,5);assert.equal(f.receipt().cleanupExitCode,1);assert.equal(existsSync(join(f.archive,'capture.log')),true);
});
test('complete positive-failure arm remains failing while valid later sessions remain allowed',t=>{
  const f=runCleanup(t,'success',1);assert.equal(f.r.status,1);assert.equal(f.receipt().exitCode,1);assert.equal(f.receipt().cleanupExitCode,0);assert.equal(f.receipt().safeToContinue,1);assert.equal(f.receipt().nativeAcceptance,false);
});
test('nonzero owned wait is retained and fails warm cleanup without hiding evidence',t=>{
  const f=runCleanup(t,'wait-failure');assert.equal(f.r.status,1);assert.equal(f.receipt().emulatorWaitExitCode,7);assert.equal(f.receipt().cleanupExitCode,1);assert.equal(f.receipt().safeToContinue,1);assert.match(f.calls(),/wait 1234/);
});
test('an already exited child can be reaped without guessed signals and remains a failed prefix',t=>{
  const f=runCleanup(t,'early-exit',124);assert.equal(f.r.status,1);assert.equal(f.receipt().exitCode,124);assert.equal(f.receipt().emulatorWaitExitCode,7);assert.equal(f.receipt().safeToContinue,1);assert.doesNotMatch(f.calls(),/adb |signal -TERM/);
});
test('lost live owner forbids signals/device kill and blocks subsequent unsafe sessions',t=>{
  const f=runCleanup(t,'foreign-live',1);assert.equal(f.r.status,1);assert.equal(f.receipt().safeToContinue,0);assert.equal(existsSync(join(f.root,'artifacts/android-warm-content/unsafe-session.json')),true);assert.doesNotMatch(f.calls(),/adb |signal -TERM|wait /);
});
test('owned emulator that does not close cannot silently permit the next AVD',t=>{
  const f=runCleanup(t,'still-live');assert.equal(f.r.status,1);assert.equal(f.receipt().safeToContinue,0);assert.equal(existsSync(join(f.root,'artifacts/android-warm-content/unsafe-session.json')),true);
});

function actualLoop(){
  const section=workflow.slice(workflow.indexOf('      - name: Run four fresh owned AVD sessions in declared ABBA order'));
  const from=section.indexOf('        run: |\n')+'        run: |\n'.length,to=section.indexOf('\n      - name:',from);
  return section.slice(from,to).split('\n').map(s=>s.startsWith('          ')?s.slice(10):s).join('\n');
}
for(const scenario of ['success','first-anr','final-input-change'])test('actual workflow loop preserves ABBA/no retry and aggregate status '+scenario,t=>{
  const root=temporary(t),script=join(root,'loop.sh');mkdirSync(join(root,'artifacts/android-native-isolated/warm-content-apks'),{recursive:true});
  const prefix=['#!/usr/bin/env bash','set -euo pipefail','scenario="$1"','export GITHUB_WORKSPACE="$PWD/tools" ANDROID_WARM_BUILD_ROOT="$PWD"','test(){ if [[ "$*" = "-c /dev/kvm" ]]; then return 0; fi; builtin test "$@"; }','bash(){ printf "%s %s\\n" "$2" "$3" >> "$PWD/calls"; if [[ "$scenario" = first-anr && "$2" = 1 ]]; then return 1; fi; return 0; }','node(){ if [[ "$scenario" = final-input-change ]]; then return 8; fi; return 0; }'].join('\n');
  writeFileSync(script,prefix+'\n'+actualLoop());const r=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:root,env:process.env,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined,String(r.error));
  assert.deepEqual(readFileSync(join(root,'calls'),'utf8').trim().split('\n'),['1 A','2 B','3 B','4 A']);assert.equal(r.status,scenario==='success'?0:1,r.stderr);
  const exits=readFileSync(join(root,'artifacts/android-warm-content/arm-exits.txt'),'utf8').trim().split('\n');assert.deepEqual(exits,scenario==='first-anr'?['1 A 1','2 B 0','3 B 0','4 A 0']:['1 A 0','2 B 0','3 B 0','4 A 0']);
});
test('new workflow has one-shot read-only namespace, two builds and proof before any ADB preflight',()=>{
  assert.match(workflow,/branches: \[codex\/android-warm-content-abba-20261016\]/);assert.match(workflow,/github\.run_number == 1 && github\.run_attempt == 1/);assert.match(workflow,/contents: read/);assert.match(workflow,/runs-on: ubuntu-24\.04/);
  assert.equal((workflow.match(/assembleDebug --no-daemon/g)||[]).length,2);assert.equal((workflow.match(/npm run native:prepare/g)||[]).length,1);assert.ok(workflow.indexOf('workflow-proof.mjs" master')<workflow.indexOf('run: node scripts/qa/android-native-isolated/adb-key-preflight.mjs'));
  const before=wrapper.indexOf('input-proof-before.json');assert.ok(wrapper.indexOf('trap cleanup EXIT')<wrapper.indexOf('workflow-proof.mjs" arm-before'));assert.ok(before>=0&&before<wrapper.indexOf('prepare_owned_kvm\n'));assert.doesNotMatch(wrapper,/pm.*clear|pages-restart-diagnostic\.mjs/);assert.match(workflow,/if: always\(\)/);
});

for(const scenario of ['success','entry-proof-denied','arm-proof-denied'])test('actual source setup calls both pre-device proof guards '+scenario,t=>{
  const root=temporary(t),build=join(root,'build'),out=join(root,'raw'),source=join(root,'source');mkdirSync(out);mkdirSync(join(build,'artifacts/android-native-isolated'),{recursive:true});mkdirSync(join(build,'android/app/build/outputs/apk/debug'),{recursive:true});
  for(const name of ['fixture-provenance.json','apk-assets.json','adb-key-preflight.json'])writeFileSync(join(build,'artifacts/android-native-isolated',name),'synthetic fixture\n');writeFileSync(join(build,'android/app/build/outputs/apk/debug/app-debug.apk'),'synthetic APK bytes');
  const first=wrapper.indexOf('trap cleanup EXIT'),last=wrapper.indexOf('\nsdk_bin=',first),boundary=wrapper.slice(first,last);assert.ok(first>=0&&last>first);
  const prefix=['#!/usr/bin/env bash','set -euo pipefail','scenario="$1"','out="$PWD/../raw"; build="$PWD"; root="$PWD/../source"; tools=synthetic-tools; arm=A; index=1; ANDROID_HOME=synthetic-sdk; ANDROID_QA_SOURCE=synthetic-source; GITHUB_RUN_ID=1; GITHUB_RUN_ATTEMPT=1','cleanup(){ :; }','git(){ mkdir -p "$root"; }','ln(){ mkdir -p "$2"; }','node(){ if [[ "$1" = --input-type=module ]]; then cat >/dev/null; return 0; fi; printf "%s\\n" "$3" >> "$build/proof-calls"; if [[ "$scenario" = entry-proof-denied && "$3" = *input-proof-entry.json ]]; then return 7; fi; if [[ "$scenario" = arm-proof-denied && "$3" = *input-proof-before.json ]]; then return 8; fi; printf "{\\"synthetic\\":true}\\n" > "$3"; }'].join('\n');
  const script=join(build,'exercise.sh');writeFileSync(script,prefix+'\n'+boundary+'\nprintf "ready\\n" > "$build/pre-device-ready"\n');
  const r=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:build,env:process.env,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined,String(r.error));
  const calls=readFileSync(join(build,'proof-calls'),'utf8').trim().split('\n');assert.equal(calls.length,scenario==='entry-proof-denied'?1:2);assert.match(calls[0],/input-proof-entry.json$/);if(calls.length===2)assert.match(calls[1],/input-proof-before.json$/);
  assert.equal(existsSync(join(build,'pre-device-ready')),scenario==='success');assert.equal(r.status,scenario==='success'?0:scenario==='entry-proof-denied'?7:8,r.stderr);assert.equal(existsSync(source),scenario!=='entry-proof-denied');
});

test('actual file proof rejects nonexistent, empty, relative and escaped inputs',t=>{
  const root=temporary(t),inside=join(root,'inside');mkdirSync(inside);writeFileSync(join(inside,'real.bin'),'actual synthetic bytes');writeFileSync(join(root,'outside.bin'),'outside');writeFileSync(join(inside,'empty.bin'),'');
  assert.equal(actualFile(join(inside,'real.bin'),{inside}).bytes,22);
  for(const file of ['relative.bin',join(inside,'missing.bin'),join(inside,'empty.bin'),join(root,'outside.bin')])assert.throws(()=>actualFile(file,{inside}));
});

test('actual shallow tools checkout verifies helpers from the separate canonical Git repository',t=>{
  const root=temporary(t),backing=join(root,'backing'),canonical=join(root,'canonical'),tools=join(root,'tools');mkdirSync(backing);
  const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined,String(r.error));assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  git(backing,'init','--initial-branch=main');git(backing,'config','user.name','Synthetic regression');git(backing,'config','user.email','synthetic@example.invalid');git(backing,'config','core.autocrlf','false');
  const prefix='scripts/qa/android-native-isolated/';mkdirSync(join(backing,prefix),{recursive:true});
  for(let n=0;n<37;n++)writeFileSync(join(backing,prefix,'helper-'+n+'.mjs'),'export const synthetic='+n+';\n');
  git(backing,'add','.');git(backing,'commit','-m','synthetic canonical source');const source=git(backing,'rev-parse','HEAD');git(backing,'worktree','add','--detach',canonical,source);
  writeFileSync(join(backing,'tools-only.txt'),'synthetic tools tip\n');git(backing,'add','.');git(backing,'commit','-m','synthetic tools source');
  git(root,'clone','--depth','1',pathToFileURL(backing).href,tools);git(tools,'config','user.name','Synthetic regression');git(tools,'config','user.email','synthetic@example.invalid');git(tools,'config','core.autocrlf','false');
  assert.equal(git(tools,'rev-parse','--is-shallow-repository'),'true');
  const missing=spawnSync('git',['-C',tools,'cat-file','-e',source+'^{commit}'],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(missing.error,undefined);assert.notEqual(missing.status,0,'Canonical history must really be absent from tools');
  assert.doesNotThrow(()=>assert.equal(verifyOriginalHelpers(tools,canonical).length,37));
  writeFileSync(join(tools,prefix,'helper-0.mjs'),'export const synthetic="changed";\n');git(tools,'add','.');git(tools,'commit','-m','synthetic helper mismatch');
  assert.throws(()=>verifyOriginalHelpers(tools,canonical),/helper changed/);
});
test('actual SDK guard rejects placeholder executables before accepting any ready JSON',t=>{
  const root=temporary(t);let calls=0;
  assert.throws(()=>validateActualSdk(join(root,'missing'),{run:()=>{calls++;return{status:0,stdout:'ready'};}}));
  for(const p of ['platform-tools/adb','emulator/emulator','build-tools/36.1.0/aapt','build-tools/36.1.0/apksigner','build-tools/36.1.0/lib/apksigner.jar']){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fake SDK placeholder');}
  assert.throws(()=>validateActualSdk(root,{run:()=>{calls++;return{status:0,stdout:'ready'};}}),/ELF/);assert.equal(calls,0);
});
test('SDK/APK/source proofs are compared by actual immutable observations',()=>{
  const proof={source:'c14',tree:'tree',toolsSource:'tools',toolsTree:'tools-tree',inputFiles:{A:{sha256:'a'},B:{sha256:'b'}},sdk:{files:{emulator:{sha256:'sdk'}},versions:{emulator:'37.2.12'}},pairHashes:{A:'a',B:'b'},signerSha256:'signer',canonicalA:{ready:true}};
  assert.equal(requireStableProof(structuredClone(proof),proof),true);
  for(const key of Object.keys(proof)){const changed=structuredClone(proof);changed[key]={unexpected:'changed'};assert.throws(()=>requireStableProof(changed,proof),/changed/);}
});
test('actual source and CLI guards cannot accept a fake checkout or unsupported host',t=>{
  const root=temporary(t);assert.throws(()=>requireAppCheckout(root));assert.throws(()=>requireAppCheckout(process.cwd()),/c14/);
  assert.throws(()=>bindWorkflowInputs({ANDROID_WARM_CONTENT_RUN:'reviewed-diagnostic-only'},{platform:'win32'}),/Linux/);assert.throws(()=>bindWorkflowInputs({}, {platform:'linux'}),/guarded/);
});
test('actual proof entry refuses a different repository/ref/run/attempt before SDK work',()=>{
  const env={GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/codex/android-warm-content-abba-20261016',GITHUB_WORKFLOW_REF:'yarinn12/sogrim-hashbon/.github/workflows/android-warm-content-abba-20261016.yml@refs/heads/codex/android-warm-content-abba-20261016',GITHUB_RUN_NUMBER:'1',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'12345',GITHUB_SHA:'a'.repeat(40)};
  assert.equal(requireOneShot(env),true);
  for(const key of Object.keys(env))assert.throws(()=>requireOneShot({...env,[key]:'wrong'}),/one-shot/);
});
test('canonical APK auditor rejects forged ready metadata without actual c14 source',t=>{
  const root=temporary(t),python=process.env.SOGRIM_TEST_PYTHON||'python3';writeFileSync(join(root,'A.apk'),'fake APK');writeFileSync(join(root,'audit.json'),JSON.stringify({ready:true,sourceCommit:'c14'}));writeFileSync(join(root,'fixture.json'),'{}');
  const script=fileURLToPath(new URL('../scripts/qa/android-native-isolated/warm-content/canonical-apk.py',import.meta.url));const r=spawnSync(python,[script,root,join(root,'A.apk'),join(root,'audit.json'),join(root,'fixture.json')],{encoding:'utf8',timeout:10000});assert.equal(r.error,undefined,String(r.error));assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/"ready":true/);
});
