import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const workflow=readFileSync(new URL('../.github/workflows/android-warm-runtime-abba-20261016.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
const helper=readFileSync(new URL('../scripts/qa/android-native-isolated/warm-content/prepare-runtime-deps.sh',import.meta.url),'utf8').replaceAll('\r\n','\n');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const dependency='bash "$GITHUB_WORKSPACE/scripts/qa/android-native-isolated/warm-content/prepare-runtime-deps.sh"';
function actualCommands(text){
  const at=text.indexOf('          ANDROID_WARM_BUILD_ROOT="$PWD" \\\n');
  assert.ok(at>=0,'Actual original master proof invocation must remain observable');
  const end=text.indexOf('\n      - name:',at),proof=text.slice(at,end).split('\n').map(s=>s.startsWith('          ')?s.slice(10):s).join('\n');
  assert.match(proof,/workflow-proof\.mjs" master/);
  const commands=[{at,command:proof}],dep=text.indexOf('        run: '+dependency);
  if(dep>=0)commands.push({at:dep,command:dependency});
  return commands.sort((a,b)=>a.at-b.at).map(r=>r.command).join('\n');
}
function run(t,scenario='success',text=workflow){
  const parent=resolve(tmpdir()),root=mkdtempSync(join(parent,'warm-runtime-deps-'));
  t.after(()=>{assert.equal(dirname(resolve(root)),parent);assert.ok(basename(root).startsWith('warm-runtime-deps-'));rmSync(root,{recursive:true,force:true});});
  const helperPath=join(root,'tools/scripts/qa/android-native-isolated/warm-content/prepare-runtime-deps.sh');mkdirSync(dirname(helperPath),{recursive:true});writeFileSync(helperPath,helper);
  const sdk=join(root,'sdk/emulator');mkdirSync(join(sdk,'qemu/linux-x86_64'),{recursive:true});
  for(const name of ['qemu-system-x86_64','qemu-system-x86_64-headless'])writeFileSync(join(sdk,'qemu/linux-x86_64',name),'#!/usr/bin/env bash\n# Synthetic executable; ldd is mocked, no real qemu runs.\nexit 0\n');
  writeFileSync(join(sdk,'emulator'),'#!/usr/bin/env bash\n[[ "$*" = -version ]] || exit 96\nif [[ "$(cat "$WARM_DEP_STATE")" != 1 ]]; then printf "qemu-system-x86_64: error while loading shared libraries: libpulse.so.0: cannot open shared object file\\n" >&2; exit 127; fi\nprintf "Android emulator version 37.2.12.0 (synthetic fixture)\\n"\n');
  const prefix=String.raw`#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:$PATH"
scenario="$1"; fixture_root="$PWD"
original_ld=""; if [[ -v LD_LIBRARY_PATH ]]; then original_ld="$LD_LIBRARY_PATH"; fi
export GITHUB_WORKSPACE="$PWD/tools" ANDROID_HOME="$PWD/sdk" ANDROID_WARM_CONTENT_RUN=reviewed-diagnostic-only
export WARM_DEP_STATE="$PWD/state"
pair="$PWD/pair"; mkdir -p "$pair"; printf '0\n' > "$WARM_DEP_STATE"
chmod +x "$ANDROID_HOME/emulator/emulator" "$ANDROID_HOME/emulator/qemu/linux-x86_64/"*
uname(){ printf 'Linux\n'; }
dpkg(){ printf 'amd64\n'; }
cat(){ if [[ "$*" = /etc/os-release ]]; then printf 'ID=ubuntu\nVERSION_ID="24.04"\n'; else command cat "$@"; fi; }
sudo(){
 printf 'sudo %s\n' "$*" >> "$fixture_root/calls"
 if [[ "$*" = 'apt-get update' ]]; then [[ "$scenario" != update-failure ]] || return 100; return 0; fi
 [[ "$*" = 'apt-get install --no-install-recommends -y libpulse0' ]] || return 97
 [[ "$scenario" != install-failure ]] || return 100
 printf '1\n' > "$WARM_DEP_STATE"; printf 'synthetic library\n' > "$fixture_root/libpulse.so.0"
}
dpkg-query(){
 if [[ "$1" = -W ]]; then
   if [[ "$scenario" = package-proof-failure ]]; then printf 'deinstall ok config-files\t1:16.1\tamd64\n'; else printf 'install ok installed\t1:16.1\tamd64\n'; fi
 elif [[ "$1" = -L ]]; then printf '%s/libpulse.so.0\n' "$fixture_root"; else return 98; fi
}
ldd(){
 if [[ "$1" = --version ]]; then printf 'synthetic ldd\n'; return 0; fi
 printf 'ldd %s %s\n' "$(command cat "$WARM_DEP_STATE")" "$1" >> "$fixture_root/calls"
 if [[ "$(command cat "$WARM_DEP_STATE")" != 1 || "$scenario/$1" = "unresolved-after/$ANDROID_HOME/emulator/qemu/linux-x86_64/qemu-system-x86_64" || "$scenario/$1" = "headless-unresolved/$ANDROID_HOME/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless" ]]; then printf 'libpulse.so.0 => not found\n'; else printf 'libpulse.so.0 => %s/libpulse.so.0 (0x1)\nlibc.so.6 => /synthetic/libc.so.6 (0x2)\n' "$fixture_root"; fi
}
# Source the exact actual helper so these labeled synthetic commands are visible.
bash(){ source "$1"; }
node(){
 [[ "$1" = *workflow-proof.mjs && "$2" = master ]] || return 99
 local current_ld=""; if [[ -v LD_LIBRARY_PATH ]]; then current_ld="$LD_LIBRARY_PATH"; fi
 [[ "$current_ld" = "$original_ld" ]] || return 95
 printf 'version\n' >> "$fixture_root/calls"
 "$ANDROID_HOME/emulator/emulator" -version
 printf 'input-proof\n' >> "$fixture_root/calls"
 printf '{"synthetic":true}\n' > "$3"
}
`;
  const script=join(root,'exercise.sh');writeFileSync(script,prefix+'\n'+actualCommands(text)+'\n');
  const r=spawnSync(bash,['--noprofile','--norc',script,scenario],{cwd:root,env:process.env,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined,String(r.error));
  return{r,root,out:join(root,'artifacts/android-native-isolated/sdk-runtime-dependencies'),calls:existsSync(join(root,'calls'))?readFileSync(join(root,'calls'),'utf8').trim().split('\n'):[],proof:existsSync(join(root,'pair/master-proof.json'))};
}
test('actual workflow installs and proves libpulse runtime before original SDK version and input proof',t=>{
  const f=run(t);assert.equal(f.r.status,0,f.r.stderr);assert.equal(f.proof,true);
  const install=f.calls.indexOf('sudo apt-get install --no-install-recommends -y libpulse0'),version=f.calls.indexOf('version');
  assert.ok(install>=0&&version>install);assert.equal(f.calls.at(-1),'input-proof');assert.equal(f.calls.slice(install+1,version).filter(s=>s.startsWith('ldd 1 ')).length,3);
  assert.match(readFileSync(join(f.out,'qemu-before.ldd.txt'),'utf8'),/not found/);assert.doesNotMatch(readFileSync(join(f.out,'qemu-after.ldd.txt'),'utf8'),/not found/);assert.equal(existsSync(join(f.out,'runtime-dependencies-ready.txt')),true);
});
for(const [scenario,status]of [['update-failure',100],['install-failure',100],['package-proof-failure',1],['unresolved-after',1],['headless-unresolved',1]])test('runtime preparation fails closed before SDK/input proof: '+scenario,t=>{
  const f=run(t,scenario);assert.equal(f.r.status,status,f.r.stderr);assert.equal(f.proof,false);assert.equal(f.calls.includes('version'),false);assert.equal(existsSync(join(f.out,'qemu-before.ldd.txt')),true);assert.equal(existsSync(join(f.out,'runtime-dependencies-ready.txt')),false);
});
test('removing actual workflow dependency caller reproduces original loader exit127 before proof',t=>{
  const text=workflow.replace('        run: '+dependency,'        run: echo controlled-old-missing-dependency-step');assert.notEqual(text,workflow);
  const f=run(t,'success',text);assert.equal(f.r.status,127);assert.equal(f.proof,false);assert.match(f.r.stderr,/error while loading shared libraries: libpulse\.so\.0/);assert.deepEqual(f.calls,['version']);
});
test('moving the actual dependency caller after master proof cannot hide missing runtime libraries',t=>{
  const text=workflow.replace('        run: '+dependency,'        run: echo controlled-old-late-dependency-step')+'\n      - name: Controlled late dependency step\n        run: '+dependency+'\n';assert.notEqual(text,workflow);
  const f=run(t,'success',text);assert.equal(f.r.status,127);assert.equal(f.proof,false);assert.match(f.r.stderr,/libpulse\.so\.0/);assert.deepEqual(f.calls,['version']);
});
