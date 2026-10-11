import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,readdirSync,existsSync,statSync,openSync,closeSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';

const target='com.sogrimhashbon.app.debug',hostIntervalMs=1000,maxHostBytes=64*1024*1024,maxTraceBytes=512*1024*1024;
const now=()=>new Date().toISOString(),delay=ms=>new Promise(done=>setTimeout(done,ms));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
function fileReceipt(file){const bytes=readFileSync(file);return{path:file,bytes:bytes.length,sha256:hash(bytes)};}

export function parseProcStat(raw){
  const match=/^(\d+) \((.*)\) (\S) (.*)$/.exec(raw.trim());
  if(!match)throw new Error('Malformed actual proc stat');
  const rest=match[4].split(/\s+/);
  for(const index of [10,11,18])if(!/^\d+$/.test(rest[index]||''))throw new Error('Missing actual proc CPU/start counters');
  return{pid:Number(match[1]),name:match[2],state:match[3],userTicks:rest[10],systemTicks:rest[11],startTicks:rest[18]};
}
function context(options){
  const{adbPath,device,avd,source,emulatorPid,output}=options;
  if(!adbPath||!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!/^[a-f0-9]{40}$/.test(source||'')||!Number.isSafeInteger(emulatorPid)||emulatorPid<=1||!output)throw new Error('Require exact source and explicit owned CI emulator/PID for trace');
  return{adbPath,device,avd,source,emulatorPid,output:resolve(output)};
}
export function assertHostOwner(options,{read=readFileSync,procRoot='/proc',expectedStartTicks}={}){
  const args=read(join(procRoot,String(options.emulatorPid),'cmdline'),'utf8').split('\0').filter(Boolean);
  const stat=parseProcStat(read(join(procRoot,String(options.emulatorPid),'stat'),'utf8'));
  if(!/^(?:emulator|qemu-system-[\w-]+)$/.test(basename(args[0]||''))||args[args.indexOf('-avd')+1]!==options.avd||args[args.indexOf('-port')+1]!==options.device.slice(9)||stat.pid!==options.emulatorPid||expectedStartTicks&&stat.startTicks!==expectedStartTicks)throw new Error('Refuse foreign or reused host emulator PID');
  return{pid:stat.pid,startTicks:stat.startTicks,command:args};
}
export function sampleOwnedHost(options,deps={}){
  let readCount=0,threadsScanned=0;
  const rawRead=deps.read||readFileSync,read=(...args)=>{readCount++;return rawRead(...args);},list=deps.list||readdirSync,procRoot=deps.procRoot||'/proc';
  const begin=performance.now(),owner=assertHostOwner(options,{...deps,read});
  const threads=[],unavailable=[],observedNames=[];
  for(const tid of list(join(procRoot,String(owner.pid),'task'))){
    if(!/^\d+$/.test(tid))continue;
    threadsScanned++;
    const task=join(procRoot,String(owner.pid),'task',tid);let stat;
    try{stat=parseProcStat(read(join(task,'stat'),'utf8'));}catch(error){unavailable.push({tid,error:error.message});continue;}
    observedNames.push(stat.name);
    if(Number(tid)!==owner.pid&&!/RenderThread|vcpu|llvm|swift|gfx|angle|gpu/i.test(stat.name))continue;
    let scheduling,wchan;
    try{scheduling=read(join(task,'schedstat'),'utf8').trim().split(/\s+/);if(scheduling.length!==3||scheduling.some(x=>!/^\d+$/.test(x)))throw new Error('Malformed schedstat');}catch(error){unavailable.push({tid,field:'schedstat',error:error.message});}
    try{wchan=read(join(task,'wchan'),'utf8').trim();if(wchan==='0')unavailable.push({tid,field:'wchan',error:'Kernel wait channel unavailable (0)'});}catch(error){unavailable.push({tid,field:'wchan',error:error.message});}
    threads.push({...stat,runNs:scheduling?.[0],runQueueWaitNs:scheduling?.[1],timeslices:scheduling?.[2],wchan});
  }
  assertHostOwner(options,{...deps,read,expectedStartTicks:owner.startTicks});
  return{atUtc:now(),monotonicNs:process.hrtime.bigint().toString(),owner,threads,observedNames:[...new Set(observedNames)],unavailable,readCount,threadsScanned,selectedThreads:threads.length,sampleDurationMs:performance.now()-begin};
}
export function requireDataSources(query){
  const required=['linux.ftrace','linux.process_stats','android.surfaceflinger.frametimeline'];
  const missing=required.filter(name=>!query.split(/\r?\n/).some(line=>line.trim().split(/\s+/)[0]===name));
  if(missing.length)throw new Error('Actual SDK trace providers unavailable: '+missing.join(', '));
  return{required,advertised:true,eventCoverageValidated:false};
}
// Register the exact inode watch BEFORE signalling the owned client. A PID exit
// alone is not a writer-close ACK. The guest script has its own bounded lifetime
// and cleans up only its child inotifyd, including on timeout/error.
export function closeWriteScript(start){
  if(!Number.isSafeInteger(start.guestPid)||start.guestPid<=1||!/^\d+$/.test(start.guestStartTicks||'')||!/^\/data\/misc\/perfetto-traces\/sogrim_ci_[a-z0-9_]+\.pftrace$/.test(start.guestPath||''))throw new Error('Require confirmed owned guest tracer for close-write');
  return String.raw`set -eu
trace='${start.guestPath}'
pid='${start.guestPid}'
ticks='${start.guestStartTicks}'
events="$trace.close-events"
[ ! -e "$events" ] || { echo 'Refuse existing close-watch journal' >&2; exit 2; }
inode=$(toybox stat -c %i "$trace")
hex=$(printf '%x' "$inode")
toybox inotifyd - "$trace:w" >"$events" &
watcher=$!
watch_ticks=''
cleanup() {
  [ -r "/proc/$watcher/stat" ] || return 0
  actual_ticks=$(toybox sed 's/.*) //' "/proc/$watcher/stat" | toybox cut -d ' ' -f20)
  parent=$(toybox sed 's/.*) //' "/proc/$watcher/stat" | toybox cut -d ' ' -f2)
  if [ "$parent" = "$$" ] && { [ -z "$watch_ticks" ] || [ "$actual_ticks" = "$watch_ticks" ]; } && toybox tr '\000' '\n' <"/proc/$watcher/cmdline" | toybox grep -Fx "$trace:w" >/dev/null; then
    kill -TERM "$watcher" 2>/dev/null || :
    wait "$watcher" 2>/dev/null || :
  fi
}
trap cleanup EXIT HUP INT TERM
watch_ticks=$(toybox sed 's/.*) //' "/proc/$watcher/stat" | toybox cut -d ' ' -f20)
case "$watch_ticks" in ''|*[!0-9]*) echo 'Close-watch PID identity unavailable' >&2; exit 3;; esac
ready=0
for n in $(toybox seq 1 40); do
  for fd in /proc/$watcher/fdinfo/*; do
    [ -r "$fd" ] || continue
    if toybox grep -Eq "^inotify wd:[[:xdigit:]]+ ino:$hex " "$fd"; then ready=1; break; fi
  done
  [ "$ready" = 0 ] || break
  toybox sleep 0.05
done
[ "$ready" = 1 ] || { echo 'Owned inode close-watch not registered' >&2; exit 3; }
echo "WATCH_READY $inode $trace"
[ "$(toybox sed 's/.*) //' "/proc/$pid/stat" | toybox cut -d ' ' -f20)" = "$ticks" ] || { echo 'Refuse reused tracer before signal' >&2; exit 4; }
toybox tr '\000' '\n' <"/proc/$pid/cmdline" | toybox grep -Fx "$trace" >/dev/null
first=$(toybox tr '\000' '\n' <"/proc/$pid/cmdline" | toybox head -1)
case "$first" in perfetto|*/perfetto) ;; *) echo 'Refuse foreign tracer before signal' >&2; exit 4;; esac
kill -TERM "$pid"
for n in $(toybox seq 1 120); do
  if toybox grep -Fx "$(printf 'w\t%s' "$trace")" "$events" >/dev/null; then
    [ "$(toybox stat -c %i "$trace")" = "$inode" ] || { echo 'Trace inode changed' >&2; exit 5; }
    echo "CLOSE_WRITE $inode $trace"
    exit 0
  fi
  toybox sleep 0.05
done
echo 'Writer-close ACK unavailable; PID exit is insufficient' >&2
toybox cat "$events"
exit 6
`;
}
export function verifyCloseWrite(output,start){
  const lines=output.trim().split(/\r?\n/),ready=lines.find(line=>line.startsWith('WATCH_READY ')),closed=lines.find(line=>line.startsWith('CLOSE_WRITE '));
  const match=/^WATCH_READY (\d+) (.+)$/.exec(ready||'');
  if(!match||match[2]!==start.guestPath||closed!==`CLOSE_WRITE ${match[1]} ${start.guestPath}`||lines.indexOf(ready)>=lines.indexOf(closed))throw new Error('Actual owned writer-close acknowledgement missing/mismatched');
  return{verified:true,inode:match[1],path:match[2],semanticCoverageValidated:false};
}
export function perfettoConfig(session){
  if(!/^sogrim_ci_[a-z0-9_]+$/.test(session))throw new Error('Invalid owned trace name');
  return `unique_session_name: "${session}"
buffers { size_kb: 32768 fill_policy: RING_BUFFER }
duration_ms: 1200000
write_into_file: true
file_write_period_ms: 5000
max_file_size_bytes: ${maxTraceBytes}
data_sources { config { name: "linux.ftrace" ftrace_config {
  compact_sched { enabled: true }
  ftrace_events: "sched/sched_switch"
  ftrace_events: "sched/sched_waking"
  ftrace_events: "sched/sched_process_exit"
  ftrace_events: "task/task_newtask"
  ftrace_events: "task/task_rename"
  atrace_categories: "gfx"
  atrace_categories: "view"
  atrace_categories: "wm"
  atrace_categories: "am"
  atrace_categories: "input"
  atrace_apps: "${target}"
} } }
data_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
`;
}
// Framing checks detect absent, text, truncated or metadata-only files. Semantic
// coverage/loss and ANR causality still require Trace Processor on the real trace.
export function inspectTrace(bytes){
  function fields(buffer,visit){
    let pos=0;
    function varint(){let value=0n,shift=0n;for(let n=0;n<10;n++){if(pos>=buffer.length)throw new Error('Truncated trace varint');const b=buffer[pos++];value|=BigInt(b&127)<<shift;if(!(b&128))return value;shift+=7n;}throw new Error('Invalid trace varint');}
    while(pos<buffer.length){const key=Number(varint()),field=key>>>3,wire=key&7;if(!field)throw new Error('Invalid trace field');let start=pos,end;
      if(wire===0){const value=varint();visit(field,wire,null,value);continue;}
      if(wire===2){const length=varint();if(length>BigInt(buffer.length-pos))throw new Error('Truncated trace packet');start=pos;end=pos+Number(length);}
      else if(wire===1)end=pos+8;else if(wire===5)end=pos+4;else throw new Error('Unsupported trace wire type');
      if(end>buffer.length)throw new Error('Truncated trace field');visit(field,wire,buffer.subarray(start,end));pos=end;
    }
  }
  let packets=0,ftracePackets=0,processTreePackets=0,timestamps=0,compactSchedulingBundles=0,minTimestamp,maxTimestamp;
  fields(bytes,(field,wire,packet)=>{if(field!==1||wire!==2)return;packets++;fields(packet,(id,type,data,value)=>{
    if(id===1&&type===2&&data.length){ftracePackets++;fields(data,(bundleId,bundleWire,compact)=>{
      if(bundleId===4&&bundleWire===2)fields(compact,(schedId,schedWire,packed)=>{if((schedId===1||schedId===7)&&schedWire===2&&packed.length)compactSchedulingBundles++;});
    });}
    if(id===2&&type===2&&data.length)processTreePackets++;
    if(id===8&&type===0){timestamps++;if(minTimestamp===undefined||value<minTimestamp)minTimestamp=value;if(maxTimestamp===undefined||value>maxTimestamp)maxTimestamp=value;}
  });});
  if(!packets||!ftracePackets||!processTreePackets||!timestamps)throw new Error('Actual scheduling/process/timestamp trace payload is missing');
  if(!compactSchedulingBundles)throw new Error('Requested compact scheduling payload absent; CPU metadata is insufficient');
  return{packets,ftracePackets,processTreePackets,timestamps,compactSchedulingBundles,minTimestamp:minTimestamp.toString(),maxTimestamp:maxTimestamp.toString(),semanticCoverageValidated:false};
}
function observer(options,report,run){
  return(name,args,input)=>{const row={name,args,startedAtUtc:now()};let result;
    try{result=run(options.adbPath,['-s',options.device,...args],{encoding:'utf8',input,timeout:name==='perfetto-start'?35000:name==='perfetto-stop-close'?20000:10000,killSignal:'SIGKILL',windowsHide:true,maxBuffer:1024*1024});}catch(error){result={status:null,error};}
    row.exitCode=result.status;row.error=result.error?.message;row.completedAtUtc=now();row.ok=!result.error&&result.status===0;
    const stdout=result.stdout||'',stderr=result.stderr||'',file=join(options.output,(report.finalizeStartedAtUtc?'finish-':'start-')+(report.commands.length+1)+'-'+name+'.txt');writeFileSync(file,stdout+(stderr?'\nSTDERR:\n'+stderr:''));row.output=fileReceipt(file);report.commands.push(row);
    if(!row.ok)throw new Error(`Trace command ${name} failed: ${row.error||stderr||stdout}`);return /^perfetto-(?:help|version)$/.test(name)?stdout+stderr:stdout;
  };
}
function ownerReadback(options,observe){
  const owner=observe('owned-avd',['emu','avd','name']);if(owner.split(/\r?\n/)[0].trim()!==options.avd)throw new Error('Refuse trace on foreign/unreadable AVD');
}
function guestOwner(report,observe){
  if(!Number.isSafeInteger(report.guestPid)||report.guestPid<=1)throw new Error('No confirmed owned Perfetto PID');
  const args=observe('perfetto-owner-cmdline',['shell','cat',`/proc/${report.guestPid}/cmdline`]).split('\0').filter(Boolean);
  const stat=parseProcStat(observe('perfetto-owner-stat',['shell','cat',`/proc/${report.guestPid}/stat`]));
  if(basename(args[0]||'')!=='perfetto'||!args.includes(report.guestPath)||stat.pid!==report.guestPid||report.guestStartTicks&&stat.startTicks!==report.guestStartTicks)throw new Error('Refuse foreign or reused guest Perfetto PID');
  return stat.startTicks;
}
async function waitFile(file,ms=5000){const end=Date.now()+ms;while(!existsSync(file)&&Date.now()<end)await delay(50);if(!existsSync(file))throw new Error('Owned host observer did not acknowledge '+basename(file));return readJson(file);}
async function spawnHost(options,owner){
  const fd=openSync(join(options.output,'host-observer.log'),'a');let child;
  try{child=spawn(process.execPath,[fileURLToPath(import.meta.url),'host',options.output],{detached:true,stdio:['ignore',fd,fd],windowsHide:true});}finally{closeSync(fd);}
  child.unref();writeFileSync(join(options.output,'host-observer.pid'),String(child.pid));
  const ready=await waitFile(join(options.output,'host-ready.json'));if(ready.source!==options.source||ready.owner.startTicks!==owner.startTicks)throw new Error('Host observer readiness ownership mismatch');
  return{pid:child.pid,ready};
}
export async function startOwnedTrace(raw,{run=spawnSync,platform=process.platform,hostRead=readFileSync,procRoot='/proc',launchHost=spawnHost}={}){
  const options=context(raw);mkdirSync(options.output,{recursive:true});const stateFile=join(options.output,'trace-start.json');if(existsSync(stateFile))throw new Error('Refuse duplicate trace start or overwrite');
  const report={...options,startedAtUtc:now(),captureStarted:false,commands:[],errors:[],nativeAcceptance:false};const observe=observer(options,report,run);
  try{
    if(platform!=='linux')throw new Error('Host scheduling instrumentation requires owned Linux CI, not this local device');
    ownerReadback(options,observe);report.hostOwner=assertHostOwner(options,{read:hostRead,procRoot});
    report.perfettoVersion=observe('perfetto-version',['shell','perfetto','--version']).trim();
    const help=observe('perfetto-help',['shell','perfetto','--help']);
    if(!help.includes('--background-wait')||!help.includes('--no-clobber'))throw new Error('Actual SDK Perfetto background/ownership options unavailable');
    report.providers=requireDataSources(observe('perfetto-providers',['shell','perfetto','--query','--long']));
    report.guestTools=observe('guest-trace-tools',['shell','toybox']).trim();
    for(const tool of ['inotifyd','timeout','stat','sed','cut','grep','tr','head','seq','sleep','cat'])if(!report.guestTools.split(/\s+/).includes(tool))throw new Error('Actual guest close-watch tool unavailable: '+tool);
    report.session=`${options.avd}_${randomBytes(8).toString('hex')}`;report.guestPath=`/data/misc/perfetto-traces/${report.session}.pftrace`;
    const config=perfettoConfig(report.session);writeFileSync(join(options.output,'perfetto-config.pbtxt'),config);report.configSha256=hash(config);
    writeFileSync(stateFile,JSON.stringify(report,null,2));
    ownerReadback(options,observe);
    const started=observe('perfetto-start',['shell','perfetto','--background-wait','--no-clobber','--txt','-c','-','-o',report.guestPath],config).trim();
    if(!/^\d+$/.test(started))throw new Error('Perfetto background PID acknowledgement is absent or ambiguous');
    report.guestPid=Number(started);writeFileSync(stateFile,JSON.stringify(report,null,2));report.guestStartTicks=guestOwner(report,observe);
    writeFileSync(stateFile,JSON.stringify(report,null,2));report.hostObserver=await launchHost(options,report.hostOwner);report.captureStarted=true;
  }catch(error){report.errors.push(error.stack);}
  report.completedAtUtc=now();writeFileSync(stateFile,JSON.stringify(report,null,2));return report;
}
export async function finishOwnedTrace(raw,{run=spawnSync,stopHost=async options=>{writeFileSync(join(options.output,'host-stop'),'stop\n');return waitFile(join(options.output,'host-summary.json'));}}={}){
  const options=context(raw);mkdirSync(options.output,{recursive:true});let start;
  const report={...options,finalizeStartedAtUtc:now(),captureComplete:false,commands:[],errors:[],nativeAcceptance:false,traceAnalysisStatus:'pending actual Trace Processor scheduling/loss/coverage analysis'};const observe=observer(options,report,run);
  try{start=readJson(join(options.output,'trace-start.json'));for(const name of ['source','device','avd','emulatorPid'])if(start[name]!==options[name])throw new Error('Refuse mismatched trace source/ownership receipt');if(!new RegExp('^/data/misc/perfetto-traces/'+options.avd+'_[a-f0-9]{16}\\.pftrace$').test(start.guestPath||''))throw new Error('Refuse unowned guest trace path');report.start=start;}catch(error){report.errors.push(error.stack);start=undefined;}
  // Always release our cooperative host observer even if guest ownership vanished.
  try{report.host=await stopHost(options);if(report.host.source!==options.source||!report.host.captureComplete)throw new Error('Owned host scheduling capture is missing/incomplete');}catch(error){report.errors.push(error.stack);}
  if(start){
    let owned=false;
    try{
      ownerReadback(options,observe);owned=true;guestOwner(start,observe);ownerReadback(options,observe);
      const script=closeWriteScript(start);writeFileSync(join(options.output,'close-write.sh'),script);
      report.writerClose=verifyCloseWrite(observe('perfetto-stop-close',['shell','toybox','timeout','15','sh','-s'],script),start);
    }catch(error){report.errors.push(error.stack);}
    if(owned){
      try{
        // Pull partial evidence on failure too, but never accept it without close-write.
        ownerReadback(options,observe);const file=join(options.output,'guest.pftrace');observe('perfetto-pull',['pull',start.guestPath,file]);report.trace=fileReceipt(file);if(report.trace.bytes>=maxTraceBytes)throw new Error('Trace hit diagnostic disk cap; coverage is incomplete');report.structure=inspectTrace(readFileSync(file));
      }catch(error){report.errors.push(error.stack);}
    }
  }
  report.captureComplete=!!start?.captureStarted&&!!report.writerClose?.verified&&!!report.trace&&!!report.structure&&!!report.host?.captureComplete&&report.errors.length===0;
  report.finalizedAtUtc=now();writeFileSync(join(options.output,'trace-diagnostics.json'),JSON.stringify(report,null,2));return report;
}
async function watchHost(output){
  const options=readJson(join(output,'trace-start.json')),data=join(output,'host-scheduling.jsonl'),summary={source:options.source,owner:options.hostOwner,startedAtUtc:now(),captureComplete:false,samples:0,errors:[],unavailableFields:0,maxSampleDurationMs:0,rendererNames:[]};
  const end=Date.now()+1200000,names=new Set(),cpuStart=process.cpuUsage(),timeStart=performance.now();
  summary.limits={intervalMs:hostIntervalMs,durationMs:1200000,maxHostBytes,maxTraceBytes};summary.readCount=0;summary.threadsScanned=0;summary.maxThreadsScanned=0;summary.maxSelectedThreads=0;
  try{
    do{
      const sample=sampleOwnedHost(options,{expectedStartTicks:options.hostOwner.startTicks});
      appendFileSync(data,JSON.stringify(sample)+'\n');summary.samples++;summary.unavailableFields+=sample.unavailable.length;summary.maxSampleDurationMs=Math.max(summary.maxSampleDurationMs,sample.sampleDurationMs);
      summary.readCount+=sample.readCount;summary.threadsScanned+=sample.threadsScanned;summary.maxThreadsScanned=Math.max(summary.maxThreadsScanned,sample.threadsScanned);summary.maxSelectedThreads=Math.max(summary.maxSelectedThreads,sample.selectedThreads);
      for(const thread of sample.threads)if(/RenderThread|llvm|swift|gfx|angle|gpu/i.test(thread.name))names.add(thread.name);
      if(sample.threads.some(x=>!x.runNs))throw new Error('Selected host thread scheduler counters unavailable');
      if(summary.samples===1)writeFileSync(join(output,'host-ready.json'),JSON.stringify({source:options.source,owner:sample.owner}));
      if(statSync(data).size>=maxHostBytes)throw new Error('Host diagnostic disk cap reached');
      if(existsSync(join(output,'host-stop')))break;
      await delay(hostIntervalMs);
    }while(Date.now()<end);
    if(!existsSync(join(output,'host-stop')))throw new Error('Host diagnostic duration cap reached before finalize');
    if(summary.samples<2||!names.size)throw new Error('Host renderer scheduling samples are missing');
    summary.captureComplete=true;
  }catch(error){summary.errors.push(error.stack);}
  summary.rendererNames=[...names];summary.kernelWaitChannelsComplete=summary.unavailableFields===0;summary.overhead={observerCpuMicroseconds:process.cpuUsage(cpuStart),elapsedMs:performance.now()-timeStart,rssBytes:process.memoryUsage().rss};summary.completedAtUtc=now();if(existsSync(data))summary.data=fileReceipt(data);writeFileSync(join(output,'host-summary.json'),JSON.stringify(summary,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const mode=process.argv[2];
  if(mode==='host')await watchHost(resolve(process.argv[3]));
  else{
    try{
      const options={adbPath:process.env.ADB_PATH,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,source:process.env.ANDROID_QA_SOURCE,emulatorPid:Number(readFileSync('artifacts/android-native-isolated/emulator.pid','utf8').trim()),output:'artifacts/android-native-isolated/trace-diagnostics'};
      const report=mode==='start'?await startOwnedTrace(options):mode==='finish'?await finishOwnedTrace(options):(()=>{throw new Error('Require trace start/finish mode');})();
      console.log(JSON.stringify({source:report.source,captureStarted:report.captureStarted,captureComplete:report.captureComplete,errors:report.errors,nativeAcceptance:false}));if(!(report.captureStarted||report.captureComplete))process.exitCode=1;
    }catch(error){
      const output='artifacts/android-native-isolated/trace-diagnostics';mkdirSync(output,{recursive:true});const report={source:process.env.ANDROID_QA_SOURCE,mode,captureStarted:false,captureComplete:false,nativeAcceptance:false,error:error.stack,recordedAtUtc:now()};writeFileSync(join(output,'trace-unavailable-'+mode+'.json'),JSON.stringify(report,null,2));console.error(JSON.stringify(report));process.exitCode=1;
    }
  }
}
