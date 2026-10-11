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
 child.on('exit',code=>{exitCode=code;clearTimeout(deadline);grace=setTimeout(()=>finish(code===0?null:code,Object.assign(new Error('Inherited stderr did not close after owned shell exit'),{code:'ETIMEDOUT'})),500);});
 child.on('close',code=>finish(code));
});}
async function exercise(t,mode){
 const directory=mkdtempSync(join(tmpdir(),'sogrim-close-child-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
 for(const folder of ['traces','config','proc/7000'])mkdirSync(join(directory,folder),{recursive:true});
 writeFileSync(join(directory,'traces/trace.pftrace'),'synthetic trace');writeFileSync(join(directory,'config/config.pbtxt'),'synthetic config');writeFileSync(join(directory,'proc/7000/stat'),procStat(7000,'perfetto','S',1,'7007'));writeFileSync(join(directory,'proc/7000/cmdline'),'perfetto\0--background-wait\0--txt\0-c\0./config/config.pbtxt\0');
 writeFileSync(join(directory,'holder.sh'),'printf ready >./holder-ready\nwhile [ ! -e ./holder-stop ]; do command sleep .005 >/dev/null 2>&1; done\nprintf ended >./holder-ended\n');
 t.after(async()=>{writeFileSync(join(directory,'holder-stop'),'stop');writeFileSync(join(directory,'harness-stop'),'stop');for(let i=0;i<100&&(!existsSync(join(directory,'watcher-ended'))||existsSync(join(directory,'holder-ready'))&&!existsSync(join(directory,'holder-ended')));i++)await new Promise(r=>setTimeout(r,10));assert.ok(existsSync(join(directory,'watcher-ended')),'The test must clean its own background child');if(existsSync(join(directory,'holder-ready')))assert.ok(existsSync(join(directory,'holder-ended')),'The test must release its own helper descendant');rmSync(directory,{recursive:true,force:true});});
 const control=String.raw`
mode='${mode}'
command() {
  if builtin [ "$mode" = held-helper-pipe ] && builtin [ "$1" = sleep ] && builtin [ "$BASHPID" = "${'${fixture_watcher:-}'}" ]; then
    builtin command bash ./holder.sh
    return $?
  fi
  builtin command "$@"
}
mock_stat() { printf '%s (inotifyd) %s %s' "$1" "$2" "$3"; for ((i=1;i<=17;i++)); do printf ' 0'; done; printf ' %s\n' "$4"; }
publish_stat() {
  local file="./proc/$1/stat" pending="./proc/$1/stat.pending.$BASHPID"
  if builtin [ "$mode" = atomic-snapshot ] && builtin [ -e ./cleanup-active ] && builtin [ ! -e ./snapshot-first-read ]; then
    printf '%s (inotifyd) %s %s\n' "$1" "$2" "$3" >|"$pending"
    local observed; IFS= read -r observed <"$file" || :
    printf '%s\n' "$observed" >./snapshot-first-read
  fi
  mock_stat "$@" >|"$pending"
  command mv -f -- "$pending" "$file"
}
read_phase() { harness_phase=initial; if builtin [ -r ./cleanup-phase ]; then read -r harness_phase <./cleanup-phase || :; fi; }
finish_owned_child() {
  printf exit >./child-exit-request
  for ((j=0;j<1000;j++)); do builtin [ -e ./watcher-ended ] && break; command sleep .005; done
  builtin [ -e ./watcher-ended ]
}
disappear() {
  builtin [ ! -e ./race-triggered ] || return 0
  read_phase; printf '%s/%s\n' "$1" "$harness_phase" >./race-triggered
  # The child exits cooperatively; the hook selects the observation boundary,
  # not a sleep/random scheduling race. Pipe EOF must still occur in runShell.
  finish_owned_child || return 97
  printf gone >./proc-gone
  command rm -f -- "./proc/$watcher/stat" "./proc/$watcher/cmdline"
}
hook() {
  builtin [ -e ./cleanup-active ] || return 0
  case "$mode" in gone-"$1"-*) ;; *) return 0;; esac
  read_phase; builtin [ "$mode" = "gone-$1-$harness_phase" ] || return 0
  disappear "$1"
}
echo() { builtin echo "$@"; case "$1" in 'CLOSE_WRITE '*) printf active >./cleanup-active;; esac; }
[() {
  local rc=0
  # The closing bracket is already an argument of the original builtin call.
  builtin [ "$@" || rc=$?
  if builtin [ -n "${'${watcher:-}'}" ]; then
    if builtin [ "$#" = 4 ] && builtin [ "$1" = '!' ] && builtin [ "$2" = -d ] && builtin [ "$3" = "./proc/$watcher" ]; then
      builtin [ ! -e ./proc-gone ] || return 0
      hook dir || return
    elif builtin [ "$#" = 3 ] && builtin [ "$1" = -r ] && builtin [ "$2" = "./proc/$watcher/stat" ]; then
      builtin [ ! -e ./proc-gone ] || return 1
      if builtin [ -e ./cleanup-active ]; then
        local count=0; builtin [ ! -r ./identity-count ] || read -r count <./identity-count
        printf '%s\n' "$((count+1))" >|./identity-count
        hook readable || return
      fi
    elif builtin [ "$#" = 4 ] && builtin [ "$1" = 3000 ] && builtin [ "$2" = '=' ] && builtin [ "$3" = 3000 ]; then
      local count=0; builtin [ ! -r ./identity-count ] || read -r count <./identity-count
      read_phase; case "$harness_phase/$count" in initial/2|escalation/1) hook before-command || return;; esac
    fi
  fi
  return "$rc"
}
match_rows() { flag=$1; pattern=$2; found=1; while IFS= read -r line; do case "$flag" in -Fx) [ "$line" != "$pattern" ] || found=0;; -Eq) [[ ! "$line" =~ $pattern ]] || found=0;; *) return 98;; esac; done; return "$found"; }
toybox() {
 tool=$1; shift
 case "$tool" in
  inotifyd)
   fixture_watcher=$BASHPID
   mkdir -p "./proc/$BASHPID/fdinfo"
   trap 'publish_stat "$BASHPID" Z "$$" 3000; printf ended >./watcher-ended' EXIT
   if [ "$mode" = partial-initial-stat ]; then
    printf '%s (inotifyd) S %s\n' "$BASHPID" "$$" >"./proc/$BASHPID/stat"
    printf pending >./initial-stat-pending
    while [ ! -e ./readiness-wait-observed ] && [ ! -e ./harness-stop ]; do command sleep .005 >/dev/null 2>&1; done
   fi
   publish_stat "$BASHPID" S "$$" 3000
   if [ "$mode" = intact ] || [ "$mode" = intact-ignore-term ]; then printf 'toybox\000inotifyd\000-\000%s:w\000' "$trace" >"./proc/$BASHPID/cmdline";
   else printf 'toybox\000inotifyd\000-\000%s\000w\000' "$trace" >"./proc/$BASHPID/cmdline"; fi
   printf 'inotify wd:1 ino:7b sdev:fe38 mask:8\n' >"./proc/$BASHPID/fdinfo/3"
   printf '%s\n' "$BASHPID" >./watcher.pid
   case "$mode" in ignore-term|intact-ignore-term|late-cmdline|late-startticks|late-parent|gone-*|reject-*|changed-command-*|held-helper-pipe) trap '' TERM;; *) trap 'exit 0' TERM;; esac
   # Utility descendants must not inherit the transport pipe being tested.
   # The watcher itself still owns stderr until it actually exits.
   while [ ! -e ./harness-stop ] && [ ! -e ./child-exit-request ]; do command sleep .005 >/dev/null 2>&1; done
   ;;
  stat) if [ "$2" = '%i' ]; then printf '123\n'; elif [ -e ./inode-changed ]; then printf '65080:124\n'; else printf '65080:123\n'; fi ;;
  sed)
   for file do :; done
   if builtin [ ! -e ./cleanup-active ] && builtin [ "$file" != ./proc/7000/stat ]; then
    for ((i=1;i<=100;i++)); do
     if [ -e ./watcher.pid ] && [ -r "$file" ]; then break; fi
     if [ "$mode" = partial-initial-stat ]; then printf waiting >|./readiness-wait-observed; fi
     command sleep .001 >/dev/null 2>&1
    done
   fi
   if builtin [ -e ./cleanup-active ] && builtin [ "$file" = "./proc/$watcher/stat" ]; then
    if builtin [ -e ./proc-gone ]; then printf 'sed: %s: No such file or directory\n' "$file" >&2; return 1; fi
    case "$mode" in
     reject-stat-read) printf 'sed: %s: Permission denied\n' "$file" >&2; return 1;;
     reject-stat-malformed) printf 'malformed\n'; return 0;;
    esac
   fi
   IFS= read -r row <"$file"
   if builtin [ -e ./cleanup-active ] && builtin [ "$file" = "./proc/$watcher/stat" ]; then hook stat || return; fi
   printf '%s\n' "${'${row##*) }'}" ;;
  cut) IFS=' ' read -r -a parts; if [ "$3" = -f20 ]; then printf '%s\n' "${'${parts[19]}'}"; else printf '%s\n' "${'${parts[1]}'}"; fi ;;
  tr)
   if builtin [ -e ./cleanup-active ] && builtin [ ! -e ./command-read ]; then
    read_phase; case "$harness_phase" in initial|escalation)
     printf read >./command-read
     if builtin [ "$mode" = reject-command-read ]; then printf 'tr: owned cmdline read failed\n' >&2; return 1; fi
     for kind in startticks parent; do
      if builtin [ "$mode" = "changed-command-$kind-$harness_phase" ]; then
       cp "./proc/$watcher/stat" ./before-command-change-stat
       if builtin [ "$kind" = startticks ]; then publish_stat "$watcher" S "$$" 4000;
       else publish_stat "$watcher" S 1 3000; fi
       printf '%s/%s\n' "$kind" "$harness_phase" >./live-identity-change
      fi
     done
     hook command || return;;
    esac
   fi
   while IFS= read -r -d '' arg; do printf '%s\n' "$arg"; done ;;
  grep) if [ "$#" = 3 ]; then match_rows "$1" "$2" <"$3"; else match_rows "$1" "$2"; fi ;;
  # Model polling, not wall time. The real child still has actual TERM/KILL and
  # open stderr; Windows utility launch costs must not determine fake time.
  sleep)
   read_phase
   if builtin [ -r ./cleanup-phase ] && builtin [ "$harness_phase" = term ]; then
    local count=0; builtin [ ! -r ./poll-count ] || read -r count <./poll-count
    count=$((count+1)); printf '%s\n' "$count" >|./poll-count
    if builtin [ "$count" = 20 ]; then printf escalation >|./cleanup-phase; printf '0\n' >|./identity-count; command rm -f -- ./command-read; fi
   fi ;;
  *) command "$tool" "$@" ;;
 esac
}
kill() {
 printf '%s %s\n' "$1" "$2" >>./signals.log
 if [ "$2" = 7000 ]; then
  child=$(cat ./watcher.pid)
  case "$mode" in
   reused|no-ack-reused) publish_stat "$child" S "$$" 4000 ;;
   foreign-parent) publish_stat "$child" S 1 3000 ;;
   foreign-program) printf 'foreign\000inotifyd\000-\000%s\000w\000' "$trace" >|"./proc/$child/cmdline" ;;
   extra-argument) printf 'toybox\000inotifyd\000-\000%s\000w\000extra\000' "$trace" >|"./proc/$child/cmdline" ;;
   foreign-path) printf 'toybox\000inotifyd\000-\000%s-foreign\000w\000' "$trace" >|"./proc/$child/cmdline" ;;
   inode-changed) printf changed >./inode-changed ;;
   reject-reused-zombie|reject-foreign-parent-zombie)
    finish_owned_child || return 97
    if builtin [ "$mode" = reject-reused-zombie ]; then publish_stat "$child" Z "$$" 4000;
    else publish_stat "$child" Z 1 3000; fi ;;
  esac
  case "$mode" in no-ack|no-ack-reused) ;; *) printf 'w\t%s\n' "$trace" >>"$config.close-events";; esac
  return 0
 fi
 [ "$2" = "$(cat ./watcher.pid)" ] || return 99
 if [ "$1" = -TERM ]; then
  builtin kill "$@" || return
  case "$mode" in gone-*|reject-*|changed-command-*) printf term >|./cleanup-phase; printf '0\n' >|./identity-count;; esac
  # Change the observation synchronously after TERM, before the shell resumes
  # polling/escalation. No sleep or performance-dependent race selects it.
  case "$mode" in
   late-cmdline) cp "./proc/$2/cmdline" ./pre-change-cmdline; printf 'toybox\000inotifyd\000-\000%s\000a\000' "$trace" >|"./proc/$2/cmdline"; printf changed >./late-identity-change ;;
   late-startticks) publish_stat "$2" S "$$" 4000; printf changed >./late-identity-change ;;
   late-parent) publish_stat "$2" S 1 3000; printf changed >./late-identity-change ;;
  esac
  return 0
 fi
 if [ "$1" = -KILL ]; then publish_stat "$2" Z "$$" 3000; printf ended >./watcher-ended; case "$mode" in gone-*|reject-*) printf killed >|./cleanup-phase; printf '0\n' >|./identity-count;; esac; fi
 if [ "$1" = -KILL ]; then
  builtin kill "$@" || return
  # Consume Bash's asynchronous job notice in the synthetic SDK wrapper.
  # This real owned child has just received KILL; the guest's own wait remains
  # guarded by its independent proc observations and is tested unchanged.
  builtin wait "$2" 2>/dev/null || :
  return 0
 fi
 builtin kill "$@"
}
`;
 const script=control+closeWriteScript(start).replaceAll(start.guestPath,'./traces/trace.pftrace').replaceAll(start.configPath,'./config/config.pbtxt').replaceAll('/proc/','./proc/');writeFileSync(join(directory,'run.sh'),script);
 const result=await runShell(directory);const signals=existsSync(join(directory,'signals.log'))?readFileSync(join(directory,'signals.log'),'utf8').trim().split(/\r?\n/):[];
 const child=existsSync(join(directory,'watcher.pid'))?readFileSync(join(directory,'watcher.pid'),'utf8').trim():null;
 const marker=name=>existsSync(join(directory,name))?readFileSync(join(directory,name),'utf8').trim():null;
 return {...result,signals,child,watchSignals:signals.filter(s=>s.endsWith(' '+child)),cmdline:child&&existsSync(join(directory,'proc',child,'cmdline'))?readFileSync(join(directory,'proc',child,'cmdline')):null,lateChange:existsSync(join(directory,'late-identity-change')),cmdlineBeforeLateChange:existsSync(join(directory,'pre-change-cmdline'))?readFileSync(join(directory,'pre-change-cmdline')):null,race:marker('race-triggered'),ownedChildEnded:existsSync(join(directory,'watcher-ended')),liveIdentityChange:marker('live-identity-change'),holderStillAlive:existsSync(join(directory,'holder-ready'))&&!existsSync(join(directory,'holder-ended')),readinessWaitObserved:existsSync(join(directory,'readiness-wait-observed')),snapshotFirstRead:marker('snapshot-first-read'),localDiagnostic:{phase:marker('cleanup-phase'),pollCount:marker('poll-count'),identityCount:marker('identity-count'),watcherReady:existsSync(join(directory,'watcher.pid')),watcherEnded:existsSync(join(directory,'watcher-ended'))}};
}

const failureContext=r=>JSON.stringify({status:r.status,error:r.error?.code,bashExitCode:r.bashExitCode,stdout:r.stdout,stderr:r.stderr,signals:r.signals,diagnostic:r.localDiagnostic});

for(const mode of ['intact','mutated'])test(`owned watcher with ${mode} Toybox argv is cleaned after the actual close event`,async t=>{
 const r=await exercise(t,mode);assert.equal(r.status,0,failureContext(r));assert.equal(r.error,undefined);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);assert.match(r.stdout,/WATCH_READY 123/);assert.match(r.stdout,/CLOSE_WRITE 123/);assert.equal(verifyCloseWrite(r.stdout.replaceAll('./traces/trace.pftrace',start.guestPath),start).verified,true);
 const args=r.cmdline.toString().split('\0').filter(Boolean);assert.deepEqual(args,mode==='intact'?['toybox','inotifyd','-','./traces/trace.pftrace:w']:['toybox','inotifyd','-','./traces/trace.pftrace','w']);
});
for(const mode of ['ignore-term','intact-ignore-term'])test(`owned ${mode} watcher is revalidated then killed with bounded cleanup`,async t=>{const r=await exercise(t,mode);assert.equal(r.status,0,failureContext(r));assert.equal(r.error,undefined);assert.deepEqual(r.watchSignals,['-TERM '+r.child,'-KILL '+r.child]);assert.match(r.stdout,/CLOSE_WRITE 123/);});
for(const mode of ['reused','foreign-parent','foreign-program','extra-argument','foreign-path'])test(`cleanup refuses ${mode} watcher identity and never reports completed capture`,async t=>{const r=await exercise(t,mode);assert.notEqual(r.status,0,'Unconfirmed cleanup cannot report success');assert.deepEqual(r.watchSignals,[],'No signal may reach a foreign/reused watcher');assert.match(r.stderr,/cleanup.*(?:unconfirmed|unavailable)|Refuse.*watch/i);});
test('missing writer-close ACK preserves exit6 and cleans only the confirmed owned watcher',async t=>{const r=await exercise(t,'no-ack');assert.equal(r.status,6);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Writer-close ACK unavailable/);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);});
test('changed trace inode preserves exit5 even when the event is present and the watcher is cleaned',async t=>{const r=await exercise(t,'inode-changed');assert.equal(r.status,5);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Trace inode changed/);assert.deepEqual(r.watchSignals,['-TERM '+r.child]);});
test('unconfirmed watcher cleanup preserves the original exit6 and never signals a reused child',async t=>{const r=await exercise(t,'no-ack-reused');assert.equal(r.bashExitCode,6);assert.equal(r.status,6);assert.doesNotMatch(r.stdout,/CLOSE_WRITE/);assert.match(r.stderr,/Writer-close ACK unavailable/);assert.match(r.stderr,/cleanup unconfirmed/);assert.deepEqual(r.watchSignals,[]);});
for(const mode of ['late-cmdline','late-startticks','late-parent'])test(`identity changed after TERM (${mode}) prevents KILL and rejects cleanup deterministically`,async t=>{
 const r=await exercise(t,mode);assert.equal(r.lateChange,true,'The change must occur after the actual TERM call');assert.deepEqual(r.watchSignals,['-TERM '+r.child],'Never send KILL after the confirmed child identity changes');assert.equal(r.bashExitCode,7);assert.equal(r.status,7);assert.match(r.stderr,/cleanup unconfirmed/);
 if(mode==='late-cmdline'){assert.deepEqual(r.cmdlineBeforeLateChange.toString().split('\0').filter(Boolean),['toybox','inotifyd','-','./traces/trace.pftrace','w']);assert.deepEqual(r.cmdline.toString().split('\0').filter(Boolean),['toybox','inotifyd','-','./traces/trace.pftrace','a']);}
});
for(const phase of ['initial','term','escalation','killed'])for(const boundary of (phase==='initial'?['dir','readable','stat','before-command','command']:phase==='escalation'?['readable','stat','before-command','command']:['dir','readable','stat']))test(`owned proc disappearance at ${boundary}/${phase} completes cleanup without a stale signal`,async t=>{
 const r=await exercise(t,`gone-${boundary}-${phase}`);
 assert.equal(r.race,`${boundary}/${phase}`,'The controlled disappearance must reach its selected observation boundary: '+JSON.stringify({status:r.status,error:r.error?.code,stdout:r.stdout,stderr:r.stderr,signals:r.signals}));
 const expected=phase==='initial'?[]:phase==='killed'?['-TERM '+r.child,'-KILL '+r.child]:['-TERM '+r.child];
 assert.deepEqual(r.watchSignals,expected,'Never signal the PID after the observed owned child disappeared');
 assert.equal(r.status,0,JSON.stringify({error:r.error?.code,stdout:r.stdout,stderr:r.stderr}));assert.equal(r.error,undefined,'Actual inherited pipes must close');assert.equal(r.ownedChildEnded,true);assert.equal(r.stderr,'','An expected proc disappearance is not a surviving read failure');
 assert.match(r.stdout,/WATCH_READY 123/);assert.match(r.stdout,/CLOSE_WRITE 123/);assert.match(r.stdout,new RegExp('WATCH_CLEANED '+r.child+' 3000'));
});
for(const mode of ['reject-stat-read','reject-stat-malformed','reject-command-read'])test(`existing proc with ${mode} remains an error and never receives a signal`,async t=>{
 const r=await exercise(t,mode);assert.equal(r.race,null);assert.equal(r.bashExitCode,7);assert.equal(r.status,7);assert.deepEqual(r.watchSignals,[]);assert.match(r.stdout,/CLOSE_WRITE 123/);assert.doesNotMatch(r.stdout,/WATCH_CLEANED/);assert.match(r.stderr,/cleanup unconfirmed/);
 if(mode==='reject-stat-read')assert.match(r.stderr,/Permission denied/);if(mode==='reject-command-read')assert.match(r.stderr,/owned cmdline read failed/);
});
for(const phase of ['initial','escalation'])for(const kind of ['startticks','parent'])test(`live identity change during command read (${kind}/${phase}) prevents the next signal`,async t=>{
 const r=await exercise(t,`changed-command-${kind}-${phase}`);assert.equal(r.liveIdentityChange,`${kind}/${phase}`);
 assert.deepEqual(r.watchSignals,phase==='initial'?[]:['-TERM '+r.child],'Identity must still match after the command observation and before the next signal');assert.equal(r.bashExitCode,7);assert.equal(r.status,7);assert.match(r.stderr,/cleanup unconfirmed/);assert.doesNotMatch(r.stdout,/WATCH_CLEANED/);
});
for(const mode of ['reject-reused-zombie','reject-foreign-parent-zombie'])test(`already exited child with ${mode} cannot accept a foreign proc identity`,async t=>{
 const r=await exercise(t,mode);assert.equal(r.ownedChildEnded,true);assert.equal(r.error,undefined);assert.equal(r.status,7);assert.deepEqual(r.watchSignals,[]);assert.match(r.stderr,/cleanup unconfirmed/);assert.doesNotMatch(r.stdout,/WATCH_CLEANED/);
});
test('owned watcher pipe closes after KILL even while a controlled helper descendant is alive',async t=>{
 const r=await exercise(t,'held-helper-pipe');assert.equal(r.holderStillAlive,true,'The helper must remain alive until test cleanup, beyond the old pipe grace period');assert.equal(r.status,0);assert.equal(r.error,undefined,'The helper may not keep inherited stderr open');assert.deepEqual(r.watchSignals,['-TERM '+r.child,'-KILL '+r.child]);assert.match(r.stdout,new RegExp('WATCH_CLEANED '+r.child+' 3000'));
});
test('initial stat reader waits for a complete published snapshot and the ready PID',async t=>{
 const r=await exercise(t,'partial-initial-stat');assert.equal(r.readinessWaitObserved,true);assert.equal(r.status,0,failureContext(r));assert.equal(r.error,undefined);assert.equal(r.stderr,'');assert.match(r.stdout,new RegExp('WATCH_CLEANED '+r.child+' 3000'));
});
test('a reader during stat publication observes the previous complete snapshot',async t=>{
 const r=await exercise(t,'atomic-snapshot');assert.equal(r.status,0,failureContext(r));assert.equal(r.error,undefined);assert.ok(r.snapshotFirstRead);assert.equal(r.snapshotFirstRead.replace(/^.*\) /,'').split(/\s+/).length,20,'A partially published stat must never be exposed');assert.match(r.stdout,new RegExp('WATCH_CLEANED '+r.child+' 3000'));
});
