#!/usr/bin/env bash
# Each process owns one new checkout and one new AVD. No arm is retried.
set -euo pipefail
index="${1:?index}"; arm="${2:?arm}"
case "$index/$arm" in 1/A|2/B|3/B|4/A) ;; *) echo "Refuse undeclared ABBA arm" >&2; exit 2;; esac
test "$ANDROID_QA_SOURCE" = c14a7665e8de361d8d33be183e7a88adec3ff7cb
test "$ANDROID_PAGES_RESTART_RUN" = reviewed-diagnostic-only
build="$PWD"
tools="$GITHUB_WORKSPACE/scripts/qa/android-native-isolated"
destination="$build/artifacts/android-pages-restart/arm-$index-$arm"
root="$RUNNER_TEMP/pages-restart-source-$index-$arm"
test ! -e "$destination"; test ! -e "$root"
git worktree add --detach "$root" "$ANDROID_QA_SOURCE"
cd "$root"
export ANDROID_RESTART_SOURCE_ROOT="$root" ANDROID_RESTART_ARM="$arm"
export ANDROID_QA_AVD="sogrim_ci_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}_${index}"
out="$root/artifacts/android-native-isolated"
mkdir -p "$out" android/app/build/outputs/apk/debug
for file in fixture-provenance.json apk-assets.json adb-key-preflight.json; do
  cp "$build/artifacts/android-native-isolated/$file" "$out/$file"
done
cp "$build/android/app/build/outputs/apk/debug/app-debug.apk" android/app/build/outputs/apk/debug/app-debug.apk
cmp "$build/android/app/build/outputs/apk/debug/app-debug.apk" android/app/build/outputs/apk/debug/app-debug.apk
node --input-type=module - <<'JS'
import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const git=(root,ref)=>execFileSync('git',['-C',root,'rev-parse',ref],{encoding:'utf8'}).trim();
const bytes=readFileSync('android/app/build/outputs/apk/debug/app-debug.apk');
const record={source:git(process.cwd(),'HEAD'),tree:git(process.cwd(),'HEAD^{tree}'),toolsSource:git(process.env.GITHUB_WORKSPACE,'HEAD'),toolsTree:git(process.env.GITHUB_WORKSPACE,'HEAD^{tree}'),arm:process.env.ANDROID_RESTART_ARM,avd:process.env.ANDROID_QA_AVD,device:process.env.ANDROID_QA_DEVICE,atUtc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),apk:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},nativeAcceptance:false};
if(record.source!==process.env.ANDROID_QA_SOURCE||record.tree!=='9bcf8cf40144d12507faa2cfea9ddadee42d819f'||record.toolsSource!==process.env.GITHUB_SHA)throw new Error('Mismatched actual source/tool checkout');
writeFileSync('artifacts/android-native-isolated/diagnostic-origin.json',JSON.stringify(record,null,2),{flag:'wx'});
JS
owner_valid() {
  ANDROID_QA_EMULATOR_PID="$(cat "$out/emulator.pid")" node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
const {assertHostOwner}=await import(process.env.GITHUB_WORKSPACE+'/scripts/qa/android-native-isolated/trace-diagnostics.mjs');
const prior=JSON.parse(readFileSync('artifacts/android-native-isolated/emulator-owner.json','utf8'));
if(prior.source!==process.env.ANDROID_QA_SOURCE||prior.toolsSource!==process.env.GITHUB_SHA||prior.owner.pid!==Number(process.env.ANDROID_QA_EMULATOR_PID))throw new Error('Foreign launch owner');
assertHostOwner({emulatorPid:prior.owner.pid,avd:process.env.ANDROID_QA_AVD,device:process.env.ANDROID_QA_DEVICE},{expectedStartTicks:prior.owner.startTicks});
JS
}
cleanup() {
  result=$?
  trap - EXIT
  cleanup_status=0
  emulator_wait_status=-1
  if [[ -s "$out/emulator.pid" && -s "$out/emulator-owner.json" ]]; then
    if owner_valid; then
      export ANDROID_QA_EMULATOR_PID="$(cat "$out/emulator.pid")"
      # Preserve a capture interrupted before the runner's normal finally.
      if [[ -s "$out/trace-diagnostics/trace-start.json" && ! -s "$out/trace-diagnostics/trace-diagnostics.json" ]]; then
        node "$tools/trace-diagnostics.mjs" finish > "$out/emergency-trace-finish.log" 2>&1 || cleanup_status=1
      fi
      guest_stop_ack=0
      name="$(timeout 15 "$ADB_PATH" -s "$ANDROID_QA_DEVICE" emu avd name | head -1 | tr -d '\r')" || cleanup_status=1
      if [[ "$name" = "$ANDROID_QA_AVD" ]]; then
        if timeout 15 "$ADB_PATH" -s "$ANDROID_QA_DEVICE" emu kill > "$out/emulator-stop.log" 2>&1; then guest_stop_ack=1; else cleanup_status=1; fi
      else
        cleanup_status=1
      fi
      # A boot failure may prevent a guest ADB reply. Signal only our reverified host child.
      if [[ "$guest_stop_ack" = 0 && -n "${emulator_pid:-}" ]] && kill -0 "$emulator_pid" 2>/dev/null; then
        owner_valid && kill -TERM "$emulator_pid" || cleanup_status=1
      fi
      # Reap only the exact emulator child this process launched.
      if [[ -n "${emulator_pid:-}" ]]; then
        for n in $(seq 1 30); do
          if ! kill -0 "$emulator_pid" 2>/dev/null; then break; fi
          sleep 1
        done
        if kill -0 "$emulator_pid" 2>/dev/null; then
          cleanup_status=1
        elif wait "$emulator_pid"; then
          emulator_wait_status=0
        else
          emulator_wait_status=$?
          cleanup_status=1
        fi
      fi
    else
      cleanup_status=1
    fi
  elif [[ -n "${emulator_pid:-}" ]]; then
    # No verified start-tick identity: preserve failure, never kill by a guessed PID.
    cleanup_status=1
  fi
  manifest_status=0
  python3 - <<'PY' 2> "$out/wrapper-manifest.stderr.log" || manifest_status=$?
import pathlib,hashlib,json
root=pathlib.Path('artifacts/android-native-isolated')
files=[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(root.rglob('*')) if p.is_file()]
(root/'wrapper-final-manifest.json').write_text(json.dumps({'files':files,'excludes':['wrapper-final-manifest.json','wrapper-exit.json'],'nativeAcceptance':False},indent=2))
PY
  if [[ "$manifest_status" != 0 ]]; then cleanup_status=1; fi
  printf '{"arm":"%s","index":%s,"exitCode":%s,"cleanupExitCode":%s,"emulatorWaitExitCode":%s,"manifestExitCode":%s,"nativeAcceptance":false}\n' "$arm" "$index" "$result" "$cleanup_status" "$emulator_wait_status" "$manifest_status" > "$out/wrapper-exit.json"
  if [[ -e "$destination" ]]; then exit 1; fi
  mv "$out" "$destination"
  if [[ "$cleanup_status" != 0 ]]; then exit 1; fi
  exit "$result"
}
trap cleanup EXIT
sdk_bin="$(dirname "$(find "$ANDROID_HOME/cmdline-tools" -type f -name avdmanager | sort | tail -1)")"
test -x "$sdk_bin/avdmanager"
test ! -e "$ANDROID_AVD_HOME/$ANDROID_QA_AVD.avd"
printf 'no\n' | "$sdk_bin/avdmanager" create avd -n "$ANDROID_QA_AVD" -k 'system-images;android-36.1;google_apis_playstore;x86_64' -d pixel_6 > "$out/avd.log" 2>&1
python3 - <<'PY'
import os,pathlib
config=pathlib.Path(os.environ['ANDROID_AVD_HOME'])/(os.environ['ANDROID_QA_AVD']+'.avd')/'config.ini'
values={'hw.cpu.ncore':'2','hw.ramSize':'4096','hw.lcd.width':'1080','hw.lcd.height':'2400','hw.lcd.density':'420','hw.keyboard':'yes','hw.camera.back':'none','hw.camera.front':'none','hw.gltransport':'asg'}
rows=[line for line in config.read_text().splitlines() if line.split('=',1)[0].strip() not in values]
config.write_text('\n'.join(rows+[key+' = '+value for key,value in values.items()])+'\n')
PY
cp "$ANDROID_AVD_HOME/$ANDROID_QA_AVD.avd/config.ini" "$out/avd-config.ini"
node scripts/qa/android-native-isolated/renderer-capabilities.mjs snapshot
node scripts/qa/android-native-isolated/gltransport.mjs snapshot
"$ANDROID_HOME/emulator/emulator" -avd "$ANDROID_QA_AVD" -port 5582 -no-window -no-snapshot -no-audio -no-boot-anim -gpu swiftshader -feature GLDirectMem,HasSharedSlotsHostMemoryAllocator -verbose -memory 4096 -cores 2 > "$out/emulator.log" 2>&1 &
emulator_pid=$!; export ANDROID_QA_EMULATOR_PID="$emulator_pid"
printf '%s\n' "$emulator_pid" > "$out/emulator.pid"
# Save host identity immediately so failed boots still have an owned teardown.
node --input-type=module - <<'JS'
import {writeFileSync} from 'node:fs';
const {assertHostOwner}=await import(process.env.GITHUB_WORKSPACE+'/scripts/qa/android-native-isolated/trace-diagnostics.mjs');
const owner=assertHostOwner({emulatorPid:Number(process.env.ANDROID_QA_EMULATOR_PID),avd:process.env.ANDROID_QA_AVD,device:process.env.ANDROID_QA_DEVICE});
writeFileSync('artifacts/android-native-isolated/emulator-owner.json',JSON.stringify({source:process.env.ANDROID_QA_SOURCE,toolsSource:process.env.GITHUB_SHA,owner}),{flag:'wx'});
JS
timeout 240 "$ADB_PATH" -s "$ANDROID_QA_DEVICE" wait-for-device
booted=0
for n in $(seq 1 180); do
  if [[ "$("$ADB_PATH" -s "$ANDROID_QA_DEVICE" shell getprop sys.boot_completed | tr -d '\r')" = 1 ]]; then booted=1; break; fi
  sleep 1
done
test "$booted" = 1
test "$("$ADB_PATH" -s "$ANDROID_QA_DEVICE" emu avd name | head -1 | tr -d '\r')" = "$ANDROID_QA_AVD"
owner_valid
"$ADB_PATH" -s "$ANDROID_QA_DEVICE" shell cat /proc/meminfo > "$out/guest-meminfo.txt"
cat /proc/meminfo > "$out/host-meminfo.txt"
node scripts/qa/android-native-isolated/network-isolation.mjs
"$ADB_PATH" -s "$ANDROID_QA_DEVICE" shell settings put secure show_ime_with_hard_keyboard 1
node scripts/qa/android-native-isolated/launcher-preparation.mjs
"$ADB_PATH" -s "$ANDROID_QA_DEVICE" install android/app/build/outputs/apk/debug/app-debug.apk
ANDROID_QA_HEALTH_PHASE=before node scripts/qa/android-native-isolated/emulator-health.mjs
node scripts/qa/android-native-isolated/renderer-capabilities.mjs verify
node scripts/qa/android-native-isolated/gltransport.mjs verify
# Tool module must execute from its actual checkout; source/cwd remain frozen c14.
node "$tools/pages-restart-diagnostic.mjs"
