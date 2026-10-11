import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {closeWriteScript,verifyCloseWrite} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

// The real generated guest shell runs in Bash; only kernel/SDK observations and
// tracer signalling are synthetic. A real owned background child holds stderr
// open until cleaned. No ADB, emulator, SDK or production connection is used.
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const session='sogrim_ci_cleanup_1_abcdef0123456789',start={session,guestPid:7000,guestStartTicks:'7007',traceIdentity:'65080:123',guestPath:`/data/misc/perfetto-traces/${session}.pftrace`,configPath:`/data/misc/perfetto-configs/${session}.pbtxt`};
const procStat=(pid,name,state,parent,ticks)=>`${pid} (${name}) ${state} ${parent} ${Array(17).fill('0').join(' ')} ${ticks}\n`;
function runShell(directory){return new Promise(resolve=>{
 const child=spawn(bash,['./run.sh'],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',exitCode,finished=false,grace;
 const finish=(status,error)=>{if(finished)return;finished=true;clearTimeout(deadline);clearTimeout(grace);if(exitCode===undefined)child.kill('SIGKILL');resolve({status,error,stdout,stderr,bashExitCode:exitCode});};
 // An SDK-free transport model: distinguish parent exit from pipe EOF. This
 // harness deadline is not a device performance assertion or an SDK timeout.
 const deadline=setTimeout(()=>finish(null,Object.assign(new Error('Owned shell/transport did not finish'),{code:'ETIMEDOUT'})),15000);
 child.stdout.on('data',b=>{stdout+=b.toString();});child.stderr.on('data',b=>{stderr+=b.toString();});child.on('error',e=>finish(null,e));
 child.on('exit',code=>{exitCode=code;clearTimeout(deadline);grace=setTimeout(()=>finish(code===0?null:code,Object.assign(new Error('Owned watcher kept inherited stderr open after shell exit'),{code:'ETIMEDOUT'})),500);});
 child.on('close',code=>finish(code));
});}
async function exercise(t,mode){
 const directory=mkdtempSync(join(tmpdir(),'sogrim-close-child-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
 for(const folder of ['traces','config','proc/7000'])mkdirSync(join(directory,folder),{recursive:true});
 writeFileSync(join(directory,'traces/trace.pftrace'),'synthetic trace');writeFileSync(join(directory,'config/config.pbtxt'),'synthetic config');writeFileSync(join(directory,'proc/7000/stat'),procStat(7000,'perfetto','S',1,'7007'));writeFileSync(join(directory,'proc/7000/cmdline'),'perfetto\0--background-wait\0--txt\0-c\0./config/config.pbtxt\0');
 t.after(async()=>{writeFileSync(join(directory,'harness-stop'),'stop');for(let i=0;i<100&&!existsSync(join(directory,'watcher-ended'));i++)await new Promise(r=>setTimeout(r,10));assert.ok(existsSync(join(directory,'watcher-ended')),'The test must clean its own background child');rmSync(directory,{recursive:true,force:true});});
 const control=String.raw`
mode='${mode}'
mock_stat() { printf '%s (inotifyd) %s %s' "$1" "$2" "$3"; for ((i=1;i<=17;i++)); do printf ' 0'; done; printf ' %s\n' "$4"; }
match_rows() { flag=$1; pattern=$2; found=1; while IFS= read -r line; do case "$flag" in -Fx) [ "$line" != "$pattern" ] || found=0;; -Eq) [[ ! "$line" =~ $pattern ]] || found=0;; *) return 98;; esac; done; return "$found"; }
toybox() {
 tool=$1; shift
 case "$tool" in
  inotifyd)
   mkdir -p "./proc/$BASHPID/fdinfo"
   mock_stat "$BASHPID" S "$$" 3000 >"./proc/$BASHPID/stat"
   if [ "$mode" = intact ] || [ "$mode" = intact-ignore-term ]; then printf 'toybox\000inotifyd\000-\000%s:w\000' "$trace" >"./proc/$BASHPID/cmdline";
   else printf 'toybox\000inotifyd\000-\000%s\000w\000' "$trace" >"./proc/$BASHPID/cmdline"; fi
   printf 'inotify wd:1 ino:7b sdev:fe38 mask:8\n' >"./proc/$BASHPID/fdinfo/3"
   printf '%s\n' "$BASHPID" >./watcher.pid
   trap 'mock_stat "$BASHPID" Z "$$" 3000 >|"./proc/$BASHPID/stat"; printf ended >./watcher-ended' EXIT
   if [ "$mode" = ignore-term ] || [ "$mode" = intact-ignore-term ]; then trap '' TERM; else trap 'exit 0' TERM; fi
   while [ ! -e ./harness-stop ]; do command sleep .005; done
   ;;
  stat) if [ "$2" = '%i' ]; then printf '123\n'; elif [ -e ./inode-changed ]; then printf '65080:124\n'; else printf '65080:123\n'; fi ;;
  sed) for file do :; done; for ((i=1;i<=100;i++)); do [ ! -e ./watcher.pid ] && [ ! -r "$file" ] && command sleep .001 || break; done; IFS= read -r row <"$file"; printf '%s\n' "${'${row##*) }'}" ;;
  cut) IFS=' ' read -r -a parts; if [ "$3" = -f20 ]; then printf '%s\n' "${'${parts[19]}'}"; else printf '%s\n' "${'${parts[1]}'}"; fi ;;
  tr) while IFS= read -r -d '' arg; do printf '%s\n' "$arg"; done ;;
  grep) if [ "$#" = 3 ]; then match_rows "$1" "$2" <"$3"; else match_rows "$1" "$2"; fi ;;
  # Model polling, not wall time. The real child still has actual TERM/KILL and
  # open stderr; Windows utility launch costs must not determine fake time.
  sleep) : ;;
  *) command "$tool" "$@" ;;
 esac
}
kill() {
 printf '%s %s\n' "$1" "$2" >>./signals.log
 if [ "$2" = 7000 ]; then
  child=$(cat ./watcher.pid)
  case "$mode" in
   reused|no-ack-reused) mock_stat "$child" S "$$" 4000 >|"./proc/$child/stat" ;;
   foreign-parent) mock_stat "$child" S 1 3000 >|"./proc/$child/stat" ;;
   foreign-program) printf 'foreign\000inotifyd\000-\000%s\000w\000' "$trace" >|"./proc/$child/cmdline" ;;
   extra-argument) printf 'toybox\000inotifyd\000-\000%s\000w\000extra\000' "$trace" >|"./proc/$child/cmdline" ;;
   foreign-path) printf 'toybox\000inotifyd\000-\000%s-foreign\000w\000' "$trace" >|"./proc/$child/cmdline" ;;
   inode-changed) printf changed >./inode-changed ;;
  esac
  case "$mode" in no-ack|no-ack-reused) ;; *) printf 'w\t%s\n' "$trace" >>"$config.close-events";; esac
  return 0
 fi
 [ "$2" = "$(cat ./watcher.pid)" ] || return 99
 if [ "$1" = -KILL ]; then mock_stat "$2" Z "$$" 3000 >|"./proc/$2/stat"; printf ended >./watcher-ended; fi
 builtin kill "$@"
}
`;
 const script=control+closeWriteScript(start).replaceAll(start.guestPath,'./traces/trace.pftrace').replaceAll(start.configPath,'./config/config.pbtxt').replaceAll('/proc/','./proc/');writeFileSync(join(directory,'run.sh'),script);
 const result=await runShell(directory);const signals=existsSync(join(directory,'signals.log'))?readFileSync(join(directory,'signals.log'),'utf8').trim().split(/\r?\n/):[];
 const child=existsSync(join(directory,'watcher.pid'))?readFileSync(join(directory,'watcher.pid'),'utf8').trim():null;
 return {...result,signals,child,watchSignals:signals.filter(s=>s.endsWith(' '+child)),cmdline:child?readFileSync(join(directory,'proc',child,'cmdline')):null};
}

for(const mode of ['intact','mutated'])test(`owned watcher with ${mode} Toybox argv is cleaned after the actual close event`,async t=>{
 const r=await exercise(t,mode);assert.equal(r.status,0,JSON.stringify({error:r.error?.code,stdout:r.stdout,stderr:r.stderr}));assert.equal(r.error,undefined);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);assert.match(r.stdout,/WATCH_READY 123/);assert.match(r.stdout,/CLOSE_WRITE 123/);assert.equal(verifyCloseWrite(r.stdout.replaceAll('./traces/trace.pftrace',start.guestPath),start).verified,true);
 const args=r.cmdline.toString().split('\0').filter(Boolean);assert.deepEqual(args,mode==='intact'?['toybox','inotifyd','-','./traces/trace.pftrace:w']:['toybox','inotifyd','-','./traces/trace.pftrace','w']);
});
for(const mode of ['ignore-term','intact-ignore-term'])test(`owned ${mode} watcher is revalidated then killed with bounded cleanup`,async t=>{const r=await exercise(t,mode);assert.equal(r.status,0,JSON.stringify({error:r.error?.code,stdout:r.stdout,stderr:r.stderr}));assert.equal(r.error,undefined);assert.deepEqual(r.watchSignals,['-TERM '+r.child,'-KILL '+r.child]);assert.match(r.stdout,/CLOSE_WRITE 123/);});
for(const mode of ['reused','foreign-parent','foreign-program','extra-argument','foreign-path'])test(`cleanup refuses ${mode} watcher identity and never reports completed capture`,async t=>{const r=await exercise(t,mode);assert.notEqual(r.status,0,'Unconfirmed cleanup cannot report success');assert.deepEqual(r.watchSignals,[],'No signal may reach a foreign/reused watcher');assert.match(r.stderr,/cleanup.*(?:unconfirmed|unavailable)|Refuse.*watch/i);});
test('missing writer-close ACK preserves exit6 and cleans only the confirmed owned watcher',async t=>{const r=await exercise(t,'no-ack');assert.equal(r.status,6);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Writer-close ACK unavailable/);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);});
test('changed trace inode preserves exit5 even when the event is present and the watcher is cleaned',async t=>{const r=await exercise(t,'inode-changed');assert.equal(r.status,5);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Trace inode changed/);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);});
test('unconfirmed watcher cleanup preserves the original exit6 and never signals a reused child',async t=>{const r=await exercise(t,'no-ack-reused');assert.equal(r.bashExitCode,6);assert.equal(r.status,6);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Writer-close ACK unavailable/);assert.match(r.stderr,/cleanup unconfirmed/);assert.deepEqual(r.watchSignals,[]);});
