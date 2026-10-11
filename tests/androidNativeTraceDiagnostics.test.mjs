import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {parseProcStat,assertHostOwner,sampleOwnedHost,perfettoConfig,requireDataSources,guestFilesScript,closeWriteScript,verifyCloseWrite,inspectTrace,startOwnedTrace,finishOwnedTrace} from '../scripts/qa/android-native-isolated/trace-diagnostics.mjs';

// Entirely synthetic protocol/ownership controls. No ADB, SDK or device is run.
function stat(pid,name='RenderThread',start='12345'){const rest=Array(40).fill('0');rest[10]='3';rest[11]='4';rest[18]=start;return`${pid} (${name}) S ${rest.join(' ')}\n`;}
function varint(value){const bytes=[];value=BigInt(value);do{let byte=Number(value&127n);value>>=7n;if(value)byte|=128;bytes.push(byte);}while(value);return Buffer.from(bytes);}
function field(id,value){return Buffer.concat([varint(id*8+2),varint(value.length),value]);}
function trace({cpuOnly=false,noProcesses=false}={}){const bundle=cpuOnly?Buffer.from([8,1]):Buffer.concat([Buffer.from([8,1]),field(4,field(1,varint(100)))]);const packet=Buffer.concat([field(1,bundle),noProcesses?Buffer.alloc(0):field(2,Buffer.from([8,1])),varint(8*8),varint(100)]);return field(1,packet);}
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'sogrim-trace-boundary-'));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const options={adbPath:'boundary-adb',device:'emulator-5582',avd:'sogrim_ci_boundary_1',source:'d'.repeat(40),emulatorPid:3441,output:join(root,'trace')};
  const proc=join(root,'proc'),processDir=join(proc,'3441');mkdirSync(join(processDir,'task','3441'),{recursive:true});mkdirSync(join(processDir,'task','3450'),{recursive:true});
  writeFileSync(join(processDir,'cmdline'),['/sdk/emulator/emulator','-avd','sogrim_ci_boundary_1','-port','5582',''].join('\0'));
  writeFileSync(join(processDir,'stat'),stat(3441,'qemu-system-x86'));
  for(const[pid,name]of[[3441,'qemu-system-x86'],[3450,'RenderThread']]){const dir=join(processDir,'task',String(pid));writeFileSync(join(dir,'stat'),stat(pid,name));writeFileSync(join(dir,'schedstat'),'100 20 3\n');writeFileSync(join(dir,'wchan'),'futex_wait\n');}
  const calls=[],state={guestTicks:'6789',owner:options.avd,hostStopped:false,pullBytes:trace(),configIdentity:'7:122:1024',traceIdentity:'7:123'};
  function run(binary,args,settings){
    assert.equal(binary,options.adbPath);assert.deepEqual(args.slice(0,2),['-s',options.device]);assert.ok(settings.timeout<=35000);calls.push(args);
    const command=args.slice(2);
    if(command[0]==='emu')return{status:0,stdout:state.owner+'\nOK\n'};
    if(command[0]==='pull'){writeFileSync(command[2],state.pullBytes);return{status:0,stdout:'Boundary file pulled\n'};}
    if(command[1]==='perfetto'){
      if(command.includes('--version'))return{status:0,stdout:'Perfetto v51.2 (N/A)\n'};
      if(command.includes('--help'))return{status:0,stdout:'Usage: perfetto\n --background-wait --config --query --txt\n'};
      if(command.includes('--query'))return{status:0,stdout:state.providers??'linux.ftrace traced_probes gfx,view,wm,am,input\nlinux.process_stats traced_probes\nandroid.surfaceflinger.frametimeline surfaceflinger\n'};
      if(state.startFail)return{status:1,stderr:'Trace data source unavailable'};
      assert.equal(command.at(-1),state.configPath);assert.ok(!command.includes('-o'));return{status:0,stdout:'7000\n'};
    }
    if(command[1]==='sh'&&command[2]==='-s'){
      const script=settings.input,reserve=script.includes('set -C');
      if(reserve){
        state.configPath=/config='([^']+)'/.exec(script)[1];state.guestPath=/trace='([^']+)'/.exec(script)[1];
        const config=script.split("<<'SOGRIM_OWNED_CONFIG'\n")[1].split('SOGRIM_OWNED_CONFIG\n')[0];
        state.configSha=createHash('sha256').update(config).digest('hex');assert.match(config,/linux.ftrace/);assert.ok(config.includes(`output_path: "${state.guestPath}"`));
      }
      if(state.fileFail)return{status:1,stderr:'Refuse existing trace/config path'};
      return{status:0,stdout:`CONFIG ${state.configIdentity} ${state.configSha} ${state.configPath}\n`+(reserve?'':`TRACE ${state.traceIdentity} ${state.guestPath}\n`)};
    }
    if(command[1]==='cat'&&command[2].endsWith('/cmdline'))return{status:0,stdout:'/system/bin/perfetto\0--background-wait\0--txt\0-c\0'+state.configPath+'\0'};
    if(command[1]==='cat'&&command[2].endsWith('/stat'))return{status:0,stdout:stat(7000,'perfetto',state.guestTicks)};
    if(command[1]==='toybox'&&command.length===2)return{status:0,stdout:state.guestTools??'inotifyd timeout stat sha256sum sed cut grep tr head seq sleep cat'};
    if(command[1]==='toybox'&&command[2]==='timeout'){
      assert.match(settings.input,/kill -TERM "\$pid"/);assert.match(settings.input,/inotify wd:/);
      return state.stopFail?{status:1,stderr:'Could not finalize trace'}:{status:0,stdout:state.closeOutput??`WATCH_READY 123 ${state.guestPath}\nCLOSE_WRITE 123 ${state.guestPath}\n`};
    }
    if(command[1]==='test')return{status:1,stdout:''};
    throw new Error('Unexpected boundary command '+JSON.stringify(command));
  }
  const deps={run,platform:'linux',procRoot:proc,launchHost:async()=>({pid:99,ready:{boundaryOnly:true}})};
  const stopHost=async()=>{state.hostStopped=true;return{source:options.source,captureComplete:true,samples:2,boundaryOnly:true};};
  return{root,proc,processDir,options,state,calls,run,deps,stopHost};
}

const actualHelpRaw=readFileSync(new URL('./fixtures/android-native-perfetto-v51.2-help-raw.txt',import.meta.url),'utf8');
const actualVersionRaw=readFileSync(new URL('./fixtures/android-native-perfetto-v51.2-version.txt',import.meta.url),'utf8');
const actualHelpStderr=actualHelpRaw.slice('\nSTDERR:\n'.length);
function recordedPreflight(f,{helpExit=1,stderr=actualHelpStderr,version=actualVersionRaw}={}){
  return(binary,args,settings)=>args.includes('--help')?{status:helpExit,stdout:'',stderr}:args.includes('--version')?{status:0,stdout:version}:f.run(binary,args,settings);
}
test('recorded API36.1 Perfetto v51.2 help exit1 starts with the supported non-overwriting output protocol',async t=>{
  assert.equal(createHash('sha256').update(actualHelpRaw).digest('hex'),'f05dc4cefeebbc8ba8c7ab49380ce62e4c42329f2a9f5f469d9380e2c55420bf');
  assert.equal(createHash('sha256').update(actualVersionRaw).digest('hex'),'3436076794f0d928bbda4b8f6dc6c28a6b0c51688c53f55dae883e20475bbb5d');
  assert.doesNotMatch(actualHelpStderr,/--no-clobber/);
  const f=fixture(t),start=await startOwnedTrace(f.options,{...f.deps,run:recordedPreflight(f)});
  assert.equal(start.captureStarted,true,start.errors.join('\n'));
  assert.equal(start.commands.find(x=>x.name==='perfetto-help').exitCode,1);
  assert.equal(readFileSync(start.commands.find(x=>x.name==='perfetto-help').output.path,'utf8'),actualHelpRaw);
  const launch=f.calls.find(x=>x.includes('--background-wait'));assert.ok(launch);assert.ok(!launch.includes('--no-clobber'));assert.ok(!launch.includes('-o'));
});
test('recorded help plus an actual error, unexpected exit or unknown version still rejects before capture',async t=>{
  for(const changes of [{stderr:'Permission denied\n'+actualHelpStderr},{stderr:actualHelpStderr+'Failed to connect\n'},{helpExit:0,stderr:'Permission denied\n'+actualHelpStderr},{helpExit:2},{version:'Perfetto v52.0 (N/A)\n'},{helpExit:0,version:'Perfetto v52.0 (N/A)\n'}]){
    const f=fixture(t),start=await startOwnedTrace(f.options,{...f.deps,run:recordedPreflight(f,changes)});
    assert.equal(start.captureStarted,false);assert.ok(start.errors.length);assert.ok(!f.calls.some(x=>x.includes('--background-wait')));
  }
});
test('existing config/trace collisions, changed file provenance and stderr failures never start or signal a trace',async t=>{
  for(const kind of ['reserve','race','config-inode','config-content','trace-inode','stderr']){
    const f=fixture(t);let started=false;
    const run=(binary,args,settings)=>{
      if(kind==='reserve'&&args.includes('sh')&&settings.input.includes('set -C'))return{status:1,stderr:'Refuse existing trace/config path'};
      if(kind==='race'&&args.includes('--background-wait'))return{status:1,stderr:'traced: Failed to create trace file (File exists)'};
      if(kind==='stderr'&&args.includes('--query'))return{status:0,stdout:'linux.ftrace\nlinux.process_stats\nandroid.surfaceflinger.frametimeline\n',stderr:'Permission denied\n'};
      const result=f.run(binary,args,settings);
      if(started&&args.includes('sh')){if(kind==='config-inode')return{...result,stdout:result.stdout.replace('7:122:1024','7:998:1024')};if(kind==='config-content')return{...result,stdout:result.stdout.replace(f.state.configSha,'0'.repeat(64))};if(kind==='trace-inode'&&f.state.replaceTrace)return{...result,stdout:result.stdout.replace('TRACE 7:123','TRACE 7:998')};}
      if(args.includes('--background-wait'))started=true;return result;
    };
    const start=await startOwnedTrace(f.options,{...f.deps,run});
    if(kind==='trace-inode'){
      assert.equal(start.captureStarted,true);f.calls.length=0;f.state.replaceTrace=true;
      const finish=await finishOwnedTrace(f.options,{run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.match(finish.errors.join(),/provenance mismatch/);assert.ok(!f.calls.some(x=>x.includes('timeout')||x.includes('pull')));
    }else{assert.equal(start.captureStarted,false);assert.ok(start.errors.length);if(kind==='reserve'||kind==='stderr')assert.ok(!f.calls.some(x=>x.includes('--background-wait')));}
  }
});
test('service-created trace keeps exclusive output path and exact config/inode provenance through close and pull',async t=>{
  const f=fixture(t),start=await startOwnedTrace(f.options,f.deps);
  assert.equal(start.creation,'traced output_path O_CREAT|O_EXCL; config shell noclobber');assert.equal(start.traceIdentity,'7:123');assert.equal(start.configIdentity,'7:122:1024');
  const config=readFileSync(join(f.options.output,'perfetto-config.pbtxt'),'utf8');assert.ok(config.includes(`output_path: "${start.guestPath}"`));
  const reserve=guestFilesScript(start,true);assert.match(reserve,/set -C\ncat >"\$config"/);assert.ok(reserve.includes('[ ! -L "$trace" ]'));assert.ok(!reserve.includes('rm '));
  const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,true);assert.equal(finish.writerClose.inode,'123');
});
test('host spawned before readiness failure is finalized; no spawned host has no wait',async t=>{
  for(const spawned of [true,false]){
    const f=fixture(t);await startOwnedTrace(f.options,{...f.deps,launchHost:async(options,owner,onSpawn)=>{if(spawned)onSpawn({pid:99});throw new Error('Readiness acknowledgement unavailable');}});
    const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.equal(f.state.hostStopped,spawned);assert.ok(finish.writerClose.verified);
  }
});
test('recorded preflight failure finalizes as no capture without guest calls or unlaunched host wait',async t=>{
  const f=fixture(t);await startOwnedTrace(f.options,{...f.deps,run:recordedPreflight(f,{helpExit:2})});f.calls.length=0;
  const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});
  assert.equal(finish.captureComplete,false);assert.equal(finish.noCaptureStarted,true);assert.equal(finish.traceAnalysisStatus,'unavailable: capture never started');
  assert.equal(f.state.hostStopped,false);assert.equal(f.calls.length,0);assert.ok(finish.errors.length);assert.doesNotMatch(finish.errors.join(),/unowned guest trace path|host.*acknowledge/i);
});

test('owned host stat handles spaces/parentheses and detects actual PID/start-time reuse',t=>{
  const f=fixture(t);assert.equal(parseProcStat(stat(3441,'renderer (pool)')).name,'renderer (pool)');
  assert.equal(assertHostOwner(f.options,{procRoot:f.proc}).startTicks,'12345');
  assert.throws(()=>assertHostOwner(f.options,{procRoot:f.proc,expectedStartTicks:'999'}),/foreign or reused/);
  writeFileSync(join(f.processDir,'cmdline'),['/sdk/emulator/emulator','-avd','foreign_avd','-port','5582',''].join('\0'));assert.throws(()=>assertHostOwner(f.options,{procRoot:f.proc}),/foreign or reused/);
});
test('owned Linux launcher may exec the QEMU headless engine in the same PID',t=>{
  const f=fixture(t);writeFileSync(join(f.processDir,'cmdline'),['/sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless','-avd',f.options.avd,'-port','5582',''].join('\0'));
  const owner=assertHostOwner(f.options,{procRoot:f.proc,expectedStartTicks:'12345'});assert.equal(owner.pid,3441);assert.equal(owner.startTicks,'12345');
  writeFileSync(join(f.processDir,'cmdline'),['/sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless','-avd',f.options.avd,'-port','5584',''].join('\0'));assert.throws(()=>assertHostOwner(f.options,{procRoot:f.proc}),/foreign or reused/);
});
test('host sampling scopes all reads to the owned process and records CPU/runqueue/wait-channel data',t=>{
  const f=fixture(t),paths=[],read=(path,...args)=>{paths.push(path);return readFileSync(path,...args);};
  const sample=sampleOwnedHost(f.options,{procRoot:f.proc,read,expectedStartTicks:'12345'});
  assert.equal(sample.threads.length,2);assert.equal(sample.threads[1].runNs,'100');assert.equal(sample.threads[1].runQueueWaitNs,'20');assert.equal(sample.threads[1].wchan,'futex_wait');assert.equal(sample.unavailable.length,0);
  assert.ok(paths.every(path=>path.startsWith(f.processDir+sep)));
  assert.equal(sample.threadsScanned,2);assert.equal(sample.selectedThreads,2);assert.equal(sample.readCount,10);
});
test('unavailable kernel wait channels and disappearing task reads remain explicit',t=>{
  const f=fixture(t);writeFileSync(join(f.processDir,'task','3450','wchan'),'0\n');
  const sample=sampleOwnedHost(f.options,{procRoot:f.proc});assert.ok(sample.unavailable.some(x=>x.field==='wchan'));
  rmSync(join(f.processDir,'task','3450','schedstat'));const missing=sampleOwnedHost(f.options,{procRoot:f.proc});assert.ok(missing.unavailable.some(x=>x.field==='schedstat'));assert.equal(missing.threads[1].runNs,undefined);
});
test('trace configuration limits diagnostic buffers/storage without changing renderer/resources/ANR gates',()=>{
  const config=perfettoConfig('sogrim_ci_boundary_1_abcdef');assert.match(config,/size_kb: 32768/);assert.match(config,/file_write_period_ms: 5000/);assert.match(config,/sched\/sched_waking/);assert.match(config,/android.surfaceflinger.frametimeline/);assert.match(config,/atrace_apps: "com.sogrimhashbon.app.debug"/);
  assert.doesNotMatch(config,/no_guardrails|renderer|hw\.ram|no-guardrails|txt-lossy/);assert.throws(()=>perfettoConfig('foreign/path'),/owned trace name/);
});
test('scheduling/process/timestamp trace framing accepts a boundary payload but does not call it Native acceptance',()=>{
  const parsed=inspectTrace(trace());assert.equal(parsed.ftracePackets,1);assert.equal(parsed.processTreePackets,1);assert.equal(parsed.semanticCoverageValidated,false);
  for(const bytes of [Buffer.alloc(0),Buffer.from('Permission Denial'),trace().subarray(0,4),field(1,Buffer.from([64,1]))])assert.throws(()=>inspectTrace(bytes),/trace|Trace/);
  assert.throws(()=>inspectTrace(trace({cpuOnly:true})),/CPU metadata is insufficient/);assert.equal(parsed.compactSchedulingBundles,1);
  assert.throws(()=>inspectTrace(trace({noProcesses:true})),/process.*trace payload is missing/);
});
test('successful scoped start/finalize keeps ownership, raw command outputs and diagnostic-only receipt',async t=>{
  const f=fixture(t),start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,true);assert.equal(start.guestStartTicks,'6789');assert.equal(start.nativeAcceptance,false);
  const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,true);assert.equal(finish.nativeAcceptance,false);assert.equal(finish.structure.semanticCoverageValidated,false);assert.equal(f.state.hostStopped,true);
  assert.equal(finish.writerClose.verified,true);assert.ok(f.calls.some(x=>x.includes('timeout')));assert.ok(f.calls.every(x=>!x.includes('force-stop')&&!x.includes('settings')&&!x.includes('emu-kill')));
  assert.notEqual(start.commands[0].output.path,finish.commands[0].output.path);assert.ok(start.commands[0].output.sha256);
});
test('foreign AVD blocks start before any trace mutation and blocks finalization guest kill/pull',async t=>{
  const f=fixture(t);f.state.owner='foreign_avd';const start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,false);assert.equal(f.calls.length,1);assert.match(start.errors.join(),/foreign/);
  // Establish our own start receipt, then lose device ownership.
  const g=fixture(t);await startOwnedTrace(g.options,g.deps);g.calls.length=0;g.state.owner='foreign_avd';const finish=await finishOwnedTrace(g.options,{run:g.run,stopHost:g.stopHost});assert.equal(finish.captureComplete,false);assert.equal(g.state.hostStopped,true);assert.equal(g.calls.length,1);
});
test('foreign/reused host PID and unsupported local OS cannot start a guest trace',async t=>{
  const f=fixture(t);writeFileSync(join(f.processDir,'cmdline'),'/usr/bin/unrelated\0');const start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,false);assert.match(start.errors.join(),/host emulator PID/);assert.equal(f.calls.length,1);
  const g=fixture(t),local=await startOwnedTrace(g.options,{...g.deps,platform:'win32'});assert.equal(local.captureStarted,false);assert.equal(g.calls.length,0);assert.match(local.errors.join(),/owned Linux CI/);
});
test('nonzero trace-start acknowledgement is retained as unavailable without retry',async t=>{
  const f=fixture(t);f.state.startFail=true;const start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,false);assert.match(start.errors.join(),/data source unavailable/);assert.equal(f.calls.filter(x=>x.includes('--background-wait')).length,1);assert.equal(start.commands.at(-1).ok,false);
  f.calls.length=0;const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.noCaptureStarted,false);assert.match(finish.traceAnalysisStatus,/not acknowledged/);assert.match(finish.errors.join(),/data source unavailable/);assert.equal(f.calls.length,0);assert.equal(f.state.hostStopped,false);
});
test('actual help on stderr is retained and missing SDK options cannot start tracing',async t=>{
  for(const supported of [true,false]){const f=fixture(t),run=(binary,args,settings)=>args.includes('--help')?{status:1,stdout:'',stderr:supported?actualHelpStderr:'no supported options\n'}:f.run(binary,args,settings);
    const start=await startOwnedTrace(f.options,{...f.deps,run});assert.equal(start.captureStarted,supported);assert.ok(start.commands.find(x=>x.name==='perfetto-help').output.sha256);if(!supported)assert.equal(f.calls.some(x=>x.includes('--background-wait')),false);
  }
});
test('host startup failure retains confirmed guest ownership for finalize; absent receipt does not touch guest',async t=>{
  const f=fixture(t),start=await startOwnedTrace(f.options,{...f.deps,launchHost:async()=>{throw new Error('Host observer unavailable');}});assert.equal(start.captureStarted,false);assert.equal(start.guestPid,7000);
  const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.ok(f.calls.some(x=>x.includes('timeout')));
  assert.match(finish.errors.join(),/Host observer unavailable/);
  const g=fixture(t),missing=await finishOwnedTrace(g.options,{run:g.run,stopHost:g.stopHost});assert.equal(missing.captureComplete,false);assert.equal(g.calls.length,0);assert.equal(g.state.hostStopped,false);
});
test('reused guest tracer PID is never signalled and its failure is preserved even if a partial file exists',async t=>{
  const f=fixture(t);await startOwnedTrace(f.options,f.deps);f.calls.length=0;f.state.guestTicks='1111';const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.match(finish.errors.join(),/reused guest/);assert.ok(!f.calls.some(x=>x.includes('timeout')));assert.equal(f.state.hostStopped,true);
});
test('missing actual providers or guest close-watch tools fail before any trace start',async t=>{
  for(const kind of ['providers','tools']){const f=fixture(t);if(kind==='providers')f.state.providers='linux.ftrace traced_probes\nlinux.process_stats traced_probes\n';else f.state.guestTools='timeout stat sed cut grep tr head seq sleep cat';
    const start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,false);assert.match(start.errors.join(),kind==='providers'?/providers unavailable/:/close-watch tool unavailable/);assert.ok(!f.calls.some(x=>x.includes('--background-wait')));
  }
  assert.throws(()=>requireDataSources('linux.ftrace_more\nlinux.process_stats\nandroid.surfaceflinger.frametimeline'),/linux.ftrace/);
});
test('provider readback handles the official query table format and preserves the raw readback',async t=>{
  // Synthetic table control for primary PerfettoCmd::PrintServiceState:
  // printf("%-40s %-28s ", ds_descriptor.name, producer) then category details.
  // https://raw.githubusercontent.com/google/perfetto/main/src/perfetto_cmd/perfetto_cmd.cc
  // This is not an actual SDK capture; the first SDK run must retain that separately.
  const f=fixture(t);f.state.providers='\x1b[31mMachine parsing uses the recorded names only\x1b[0m\n\nService: boundary\nDATA SOURCES REGISTERED:\nNAME                                     PRODUCER                     DETAILS\nlinux.ftrace                             traced_probes (1)            gfx,view,wm,am,input\nlinux.process_stats                      traced_probes (1)            \nandroid.surfaceflinger.frametimeline      surfaceflinger (2)           \n\nTRACING SESSIONS:\n';
  const start=await startOwnedTrace(f.options,f.deps);assert.equal(start.captureStarted,true);assert.deepEqual(start.providers.required,['linux.ftrace','linux.process_stats','android.surfaceflinger.frametimeline']);assert.equal(start.providers.eventCoverageValidated,false);
  const raw=readFileSync(start.commands.find(x=>x.name==='perfetto-providers').output.path,'utf8');assert.equal(raw,f.state.providers);
});
test('PID exit or valid-looking bytes cannot substitute for an actual owned writer-close ACK',async t=>{
  for(const ack of ['', 'WATCH_READY 123 PATH\n', 'WATCH_READY 123 PATH\nCLOSE_WRITE 124 PATH\n', 'CLOSE_WRITE 123 PATH\nWATCH_READY 123 PATH\n']){
    const f=fixture(t);await startOwnedTrace(f.options,f.deps);f.state.closeOutput=ack.replaceAll('PATH',f.state.guestPath);
    const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.ok(finish.trace.sha256);assert.match(finish.errors.join(),/writer-close/);assert.equal(f.state.hostStopped,true);
  }
});
test('close-write requires registration before owned signal, inode equality and cleanup on failure',()=>{
  const session='sogrim_ci_boundary_1_abcdef0123456789',start={session,guestPid:7000,guestStartTicks:'6789',traceIdentity:'7:123',guestPath:`/data/misc/perfetto-traces/${session}.pftrace`,configPath:`/data/misc/perfetto-configs/${session}.pbtxt`},script=closeWriteScript(start);
  assert.ok(script.indexOf('inotify wd:')<script.indexOf('kill -TERM "$pid"'));assert.ok(script.indexOf('Refuse reused tracer before signal')<script.indexOf('kill -TERM "$pid"'));assert.match(script,/trap cleanup EXIT HUP INT TERM/);assert.match(script,/Trace inode changed/);
  assert.throws(()=>closeWriteScript({...start,guestPid:1}),/confirmed owned/);assert.throws(()=>verifyCloseWrite('WATCH_READY 123 foreign\nCLOSE_WRITE 123 foreign',start),/writer-close/);
});
test('finalize failure still retains the trace file and finishes the owned host observer',async t=>{
  const f=fixture(t);await startOwnedTrace(f.options,f.deps);f.state.stopFail=true;const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:f.stopHost});assert.equal(finish.captureComplete,false);assert.match(finish.errors.join(),/Could not finalize/);assert.ok(finish.trace.sha256);assert.equal(f.state.hostStopped,true);
});
test('empty trace, corrupt trace, host failure and mismatched source remain incomplete rather than PASS',async t=>{
  for(const kind of ['empty','corrupt','host','source']){
    const f=fixture(t);await startOwnedTrace(f.options,f.deps);f.calls.length=0;
    if(kind==='empty')f.state.pullBytes=Buffer.alloc(0);if(kind==='corrupt')f.state.pullBytes=Buffer.from('not a trace');
    if(kind==='source'){const file=join(f.options.output,'trace-start.json'),receipt=JSON.parse(readFileSync(file));receipt.source='a'.repeat(40);writeFileSync(file,JSON.stringify(receipt));}
    const finish=await finishOwnedTrace(f.options,{run:f.run,stopHost:kind==='host'?async()=>({source:f.options.source,captureComplete:false}):f.stopHost});assert.equal(finish.captureComplete,false);assert.ok(finish.errors.length);
    if(kind==='source')assert.equal(f.calls.length,0);
  }
});
test('workflow preserves original historical ANR collection and owned emulator cleanup after trace failure',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-native-parity-qa.yml',import.meta.url),'utf8');
  assert.match(workflow,/trace-diagnostics\.mjs start/);const finish=workflow.indexOf('trace-diagnostics.mjs finish'),anr=workflow.indexOf('anr-diagnostics.mjs ||'),kill=workflow.indexOf('emu kill');assert.ok(finish<anr&&anr<kill);
  assert.match(workflow,/finish \|\| trace_status=\$\?/);assert.match(workflow,/if \[\[ "\$diagnostic_status" != 0 \]\]/);assert.match(workflow,/exit "\$trace_status"/);
});
