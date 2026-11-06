import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PROFILE,childEnvironment,profilerEnvironment,requireCleanEnvironment,emulatorEnvironment,parseEnviron,buildProfileProgram,requireProfileProgram,parseProfileOutput,profileHealth,verifyScopePreflight} from '../scripts/qa/android-host-profile/profile-contract.mjs';
import {analyzeStoppedProfile,OFFLINE} from '../scripts/qa/android-host-profile/offline.mjs';
import {withStartupCleanup} from '../scripts/qa/android-host-profile/startup-lifecycle.mjs';
import {SOURCE,TREE,BRANCH,CONFIG,requireInvocation,runOneProfile,runOriginalStages,inspectOriginalWorkload,summarizeHostProfile} from '../scripts/qa/android-host-profile/contract.mjs';
import {parseMappings,moduleFileIdentity,addressMapping} from '../scripts/qa/android-host-profile/modules.mjs';
import {verifyTransport} from '../scripts/qa/android-host-profile/transport.mjs';
const owner={pid:1234,startTicks:'999'},options={sdk:'/sdk',avdHome:'/private/avds',home:'/private/home',temp:'/private/tmp'};
const program=buildProfileProgram(owner,100);
const output=(rows='@samples[123, 1234,\n  abcdef\n]: 5\n@samples[123, 1235,\n  123abc\n]: 4\n')=>'SOGRIM_PROFILE_READY 1234 999\n'+rows+'SOGRIM_PROFILE_STOPPED\n';
const fixture={pid:1234,mainTid:1234,lateThreadTid:1235,forkPid:2345,lateThreadStartedAfterGo:true,parentCpuNs:500000000,threadCpuNs:500000000,forkCpuNs:500000000};

test('profile environment is constructed from operational values and ignores arbitrary inherited inputs',()=>{
  const env=profilerEnvironment({...options,GITHUB_TOKEN:'SENTINEL',ACTIONS_RUNTIME_TOKEN:'SENTINEL',OPENAI_API_KEY:'SENTINEL',NODE_OPTIONS:'--import private.mjs'});
  assert.ok(!JSON.stringify(env).includes('SENTINEL'));assert.equal(env.BPFTRACE_STACK_MODE,'raw');assert.equal(env.BPFTRACE_BTF,'/sys/kernel/btf/vmlinux');assert.equal(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD,'1');
  assert.ok(!Object.hasOwn(env,'NODE_OPTIONS'));assert.ok(!Object.hasOwn(env,'LD_PRELOAD'));
});
for(const key of ['GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','AUTHORIZATION','OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY','NODE_OPTIONS','LD_PRELOAD','BPFTRACE_PERF_RB_PAGES']){
  test('actual child environment rejects unexpected '+key,()=>{const expected=profilerEnvironment(options);assert.throws(()=>requireCleanEnvironment({...expected,[key]:'SENTINEL'},expected),/environment keys/);});
}
test('actual operational environment values must also match and errors do not echo secrets',()=>{
  const expected=childEnvironment(options);assert.throws(()=>requireCleanEnvironment({...expected,HOME:'SECRET_SENTINEL'},expected),error=>/HOME/.test(error.message)&&!error.message.includes('SECRET_SENTINEL'));
});
test('environ decoder cannot hide a duplicate key behind a later allowlisted value',()=>{assert.throws(()=>parseEnviron(Buffer.from('HOME=secret\0HOME=/private/home\0')),/Duplicate/);});
test('prototype-shaped environment names cannot disappear from the allowlist audit',()=>{
  const actual=parseEnviron(Buffer.from('HOME=/owned\0__proto__=SYNTHETIC_SECRET\0'));assert.throws(()=>requireCleanEnvironment(actual,{HOME:'/owned'}),/environment keys/);
});
test('relative and injected operational paths are rejected before spawning',()=>{for(const home of ['relative','/home\nTOKEN','/home\0TOKEN'])assert.throws(()=>childEnvironment({...options,home}));});

test('SDK launcher loader exceptions remain confined to public emulator directories',()=>{
  const base=childEnvironment(options),sdk=resolve(options.sdk),root=join(sdk,'emulator'),library=join(root,'lib64'),actual={...base,LD_LIBRARY_PATH:[root,library].join(delimiter),ANDROID_EMULATOR_LAUNCHER_DIR:root},realpath=value=>value;
  assert.deepEqual(emulatorEnvironment(actual,base,sdk,{realpath}),actual);
  for(const path of [join(sdk,'private'),'',root+delimiter,join(root,'..','outside')])assert.throws(()=>emulatorEnvironment({...actual,LD_LIBRARY_PATH:path},base,sdk,{realpath}));
  assert.throws(()=>emulatorEnvironment({...actual,GH_TOKEN:'SENTINEL'},base,sdk,{realpath}),/environment keys/);
  assert.throws(()=>emulatorEnvironment(actual,base,sdk,{realpath:value=>value===library?join(sdk,'private'):value}),/escapes/);
});
test('BPF program has one data collection behind TGID then leader-birth guard',()=>{
  const scope=requireProfileProgram(program,owner,100);assert.equal(scope.genericTriggerOnAllCpus,true);assert.equal(scope.forkSamplesAllowed,false);assert.equal(scope.futureSameTgidThreadsIncluded,true);assert.equal(scope.rawUserStackBytes,false);
  assert.equal(program.match(/ustack\(/g).length,1);assert.ok(program.indexOf('pid == 1234')<program.indexOf('start_boottime'));assert.ok(program.indexOf('start_boottime')<program.indexOf('ustack(raw, 32)'));
});
const corruptions=[
  ['missing TGID predicate',p=>p.replace('/pid == 1234/','/1/')],
  ['missing birth check',p=>p.replace('if (($leader->start_boottime / 10000000) == 999)','if (1)')],
  ['reused process birth',p=>p.replace('== 999)','== 1000)')],
  ['stack before guard',p=>p.replace('  $leader =','  @leak[ustack(raw, 32)] = count();\n  $leader =')],
  ['foreign comm before guard',p=>p.replace('profile:hz:49 /pid == 1234/','profile:hz:49 /comm == "qemu"/')],
  ['kernel stack',p=>p.replace('ustack(raw, 32)','kstack(raw, 32)')],
  ['implicit symbol resolution',p=>p.replace('ustack(raw, 32)','ustack(perf, 32)')],
  ['unbounded frame depth',p=>p.replace('ustack(raw, 32)','ustack(raw, 1024)')],
  ['arbitrary side-effect helper',p=>p.replace('    @samples','    system("bad");\n    @samples')],
];
for(const [name,mutate]of corruptions)test('privileged launch contract rejects '+name,()=>assert.throws(()=>requireProfileProgram(mutate(program),owner,100),/Unapproved BPF/));
test('BPF numeric interpolation rejects malformed identity and unsupported clock conversion',()=>{
  for(const bad of [{pid:1,startTicks:'1'},{pid:1234,startTicks:'1) { system("bad");'},{pid:NaN,startTicks:'1'}])assert.throws(()=>buildProfileProgram(bad,100));
  assert.throws(()=>buildProfileProgram(owner,999));
});
test('raw profile keeps address samples and explicitly leaves unwind/symbol coverage unproven',()=>{
  const p=parseProfileOutput(output(),owner);assert.equal(p.totalSamples,9);assert.deepEqual(p.rows.map(r=>r.tid),[1234,1235]);assert.equal(p.rows[0].frames[0],'0xabcdef');assert.equal(p.unwindCompletenessProven,false);assert.equal(p.rawUserStackBytes,false);
});
test('unknown stack samples are weighted by sample counts and remain partial',()=>{
  const p=parseProfileOutput(output('@samples[123, 1234,\n [unknown]\n]: 17\n'),owner);assert.equal(p.unknownStackSamples,17);assert.equal(p.unknownFrameRows,1);
});
test('unknown map output or symbolized strings cannot be silently accepted as raw addresses',()=>{
  assert.throws(()=>parseProfileOutput(output('@foreign[1]: 2\n'),owner),/Unparsed/);
  assert.throws(()=>parseProfileOutput(output('@samples[123, 1234,\n abcd symbol (/private)\n]: 2\n'),owner),/raw address/);
});
test('ready line must bind the exact original target identity',()=>assert.throws(()=>parseProfileOutput(output().replace('1234 999','1234 1000'),owner),/acknowledge exact/));
test('single actual preflight requires main and future-thread samples, busy fork exclusion, and CPU evidence',()=>{
  const p=parseProfileOutput(output(),owner),r=verifyScopePreflight(p,fixture);assert.equal(r.busyForkRejected,true);assert.equal(r.futureThreadObserved,true);assert.equal(r.minMeasuredCpuNs,250000000);
});
for(const [name,change]of [
  ['busy fork sampled',p=>({...p,rows:[...p.rows,{tid:2345,count:1,frames:['0xab']}]} )],
  ['late thread omitted',p=>({...p,rows:p.rows.filter(r=>r.tid!==1235)})],
  ['parent runner sampled',p=>({...p,rows:[...p.rows,{tid:9999,count:1,frames:['0xab']}]} )],
  ['deadline reached',p=>({...p,deadlineReached:true})],
  ['missing complete stop',p=>({...p,stopped:false})],
])test('preflight fails closed when '+name,()=>assert.throws(()=>verifyScopePreflight(change(parseProfileOutput(output(),owner)),fixture)));
test('a fork merely alive or doing too little work is not a meaningful exclusion control',()=>{
  for(const forkCpuNs of [0,1,249999999])assert.throws(()=>verifyScopePreflight(parseProfileOutput(output(),owner),{...fixture,forkCpuNs}),/250ms/);
});
test('profile byte cap and reported losses cannot turn into a complete profile',()=>{
  const parsed=parseProfileOutput(output(),owner),h=profileHealth({stdout:output(),stderr:'Lost 12 events\nmap full\noverflow: 7 samples',fileBytes:PROFILE.maxBytes+1,exitCode:0,parsed});
  assert.equal(h.byteLimitExceeded,true);assert.equal(h.reportedDroppedSamples,12);assert.equal(h.reportedMapFull,null);assert.equal(h.reportedOverflow,7);assert.equal(h.cleanTechnicalStop,false);assert.equal(h.dataAvailability,'partial');assert.equal(h.completeKernelLossAccounting,false);
});
test('silent helpers do not establish exact zero losses or full unwind',()=>{
  const h=profileHealth({stdout:output(),stderr:'',fileBytes:1000,exitCode:0,parsed:parseProfileOutput(output(),owner)});assert.equal(h.cleanTechnicalStop,true);assert.equal(h.reportedDroppedSamples,null);assert.equal(h.reportedMapFull,null);assert.equal(h.lossFreeCaptureProven,false);assert.equal(h.fullUnwindCoverageProven,false);
});
test('source line numbers and errno numbers are not invented loss counters',()=>{
  const h=profileHealth({stdout:output(),stderr:'stdin:42: WARNING map_update_elem failed (-28)\nline 17: overflow',fileBytes:1000,exitCode:0,parsed:parseProfileOutput(output(),owner)});assert.equal(h.reportedMapFull,null);assert.equal(h.reportedOverflow,null);assert.equal(h.cleanTechnicalStop,false);
});
test('scope controls with only unknown/empty stacks do not prove the user-stack helper works',()=>{
  const p=parseProfileOutput(output(),owner);assert.throws(()=>verifyScopePreflight({...p,rows:p.rows.map(r=>({...r,frames:[]}))},fixture),/actual user instruction/);
});
for(const point of ['before READY','during inspect'])test('startup failure '+point+' closes the retained profiler then the independently owned fixture',async()=>{
  const events=[],handle={owned:true},original=new Error(point);let profilerAlive=true,fixtureAlive=true;
  await assert.rejects(withStartupCleanup({begin:async retain=>{retain(handle);events.push('retained');throw original;},work:async()=>assert.fail('No workload after startup failure'),
    closeProfile:async h=>{assert.equal(h,handle);profilerAlive=false;events.push('profiler');return{verified:true};},closeFixture:async()=>{fixtureAlive=false;events.push('fixture');return{verified:true};},recordUnavailable:async()=>assert.fail('Both exits verified')}),error=>error===original);
  assert.equal(profilerAlive,false);assert.equal(fixtureAlive,false);assert.deepEqual(events,['retained','profiler','fixture']);
});
test('fixture is closed even when startup fails before a profiler handle exists',async()=>{
  let closed=false;await assert.rejects(withStartupCleanup({begin:async()=>{throw Error('metadata failed');},work:async()=>assert.fail(),closeProfile:async()=>assert.fail('No profiler was created'),closeFixture:async()=>{closed=true;return{verified:true};},recordUnavailable:async()=>assert.fail()}),/metadata failed/);assert.equal(closed,true);
});
test('missing or foreign profiler identity is reported unverified and never triggers a generic signal fallback',async()=>{
  let fixtureClosed=false,foreignSignals=0,reported;
  await assert.rejects(withStartupCleanup({begin:async retain=>{retain({owned:false});throw Error('READY timeout');},work:async()=>assert.fail(),closeProfile:async()=>{throw Error('Refuse reused PID');},closeFixture:async()=>{fixtureClosed=true;return{verified:true};},recordUnavailable:async r=>{reported=r;}}),error=>error.cleanupErrors.some(s=>s.includes('reused PID')));
  assert.equal(foreignSignals,0);assert.equal(fixtureClosed,true);assert.equal(reported.verified,false);assert.equal(reported.noFurtherCommands,true);
});
test('already verified profile close is not signalled twice',async()=>{
  let calls=0;const result=await withStartupCleanup({begin:async retain=>{const h={};retain(h);return h;},work:async(h,closed)=>{closed(true);return'OK';},closeProfile:async()=>{calls++;return{verified:true};},closeFixture:async()=>({verified:true}),recordUnavailable:async()=>assert.fail()});assert.equal(result,'OK');assert.equal(calls,0);
});
test('diagnostic is exactly one original ASG attempt independent of an ANR baseline',async()=>{
  const calls=[];const r=await runOneProfile(async arm=>{calls.push(arm);return{...arm,source:SOURCE,valid:true,targetAnr:false};});assert.deepEqual(calls,[{id:'ASG',transport:'asg'}]);assert.equal(r.targetAnr,false);assert.equal(CONFIG['hw.gltransport'],'asg');assert.throws(()=>verifyTransport('',{},'pipe'),/original ASG/);
});
test('all original workload stages run once after a workload failure, but never after owned scope loss',async()=>{
  const calls=[];await runOriginalStages(async label=>{calls.push(label);return{label,exitCode:label==='acceptance'?1:0,executed:true};});assert.deepEqual(calls,['font-regression','acceptance','geometry-regression','health-after']);
  const lost=[];await assert.rejects(runOriginalStages(async label=>{lost.push(label);return{label,exitCode:null,executed:false};}),/scope lost/);assert.deepEqual(lost,['font-regression']);
});
test('late successful checks cannot erase original ANR or unavailable profiler cleanup',()=>{
  const provenance={sourceCommit:SOURCE,sourceTree:TREE},report={provenance},checks=n=>Array.from({length:n},()=>({ok:true}));
  const e={integrity:true,selection:{transport:'asg',verified:true},diagnostics:{source:SOURCE,ownershipVerified:true,diagnosticsComplete:true,continuousLogCaptured:true,targetAppAnrLines:['actual ANR'],anrHistoryReady:false},matrix:{...report,results:[1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>({scale,orientation,checks:checks(36)})))},pages:{...report,samples:Array(24).fill({}),checks:checks(325)},journey:{...report,checks:checks(8),exceptions:[]},acceptance:{...report,ready:true},font:{...report,ready:true,actualGuardResults:{root:false,rem:false,brand:false}},geometry:{...report,ready:true,checks:checks(4)},healthBefore:{source:SOURCE,healthy:true},healthAfter:{source:SOURCE,healthy:true},stageCodes:['font-regression','acceptance','geometry-regression','health-after','anr-diagnostics'].map(label=>({label,executed:true,exitCode:label==='anr-diagnostics'?1:0}))};
  const workload=inspectOriginalWorkload(e),profile={preflight:{ready:true},ownershipVerified:true,cleanupVerified:true,scopeErrors:[],quality:{cleanTechnicalStop:true,dataAvailability:'partial'},parsed:{totalSamples:10}};
  const verdict=summarizeHostProfile(workload,profile);assert.equal(workload.fullWorkload,true);assert.equal(workload.clean,false);assert.equal(verdict.technicalExitCode,1);assert.equal(verdict.diagnosticOutcome,'PROFILE_AVAILABLE_NATIVE_ANR');assert.equal(verdict.profileDataAvailability,'partial');assert.equal(verdict.nativeAcceptance,false);assert.equal(verdict.releaseAcceptance,false);
  assert.equal(summarizeHostProfile(workload,{...profile,cleanupVerified:false}).diagnosticOutcome,'PROFILE_UNAVAILABLE_OR_FAILED');
});
test('only the exact first branch-creation event may run the diagnostic',()=>{
  const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1'},event={created:true,deleted:false,forced:false,before:'0'.repeat(40),after:env.GITHUB_SHA,ref:env.GITHUB_REF,repository:{full_name:env.GITHUB_REPOSITORY}};requireInvocation(env,event);
  for(const patch of [{created:false},{before:'b'.repeat(40)},{forced:true}])assert.throws(()=>requireInvocation(env,{...event,...patch}));assert.throws(()=>requireInvocation({...env,GITHUB_RUN_ATTEMPT:'2'},event));
});
test('workflow and deployment gates retain explicit diagnostic-only first creation and official tool dependency',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/android-host-profile-info-2d4.yml',import.meta.url),'utf8'),vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  assert.equal(vercel.git.deploymentEnabled[BRANCH],false);assert.match(workflow,/timeout-minutes: 45/);assert.match(workflow,/runs-on: ubuntu-24\.04/);assert.match(workflow,/github\.event\.created == true/);assert.match(workflow,/github\.run_attempt == 1/);assert.match(workflow,/github\.run_number == 1/);assert.doesNotMatch(workflow,/workflow_dispatch|workflow_call|pull_request|contents: write|actions: write/);
  assert.match(workflow,/apt-get install --yes --no-install-recommends bpftrace/);assert.match(workflow,/ulimit -c 0/);assert.doesNotMatch(workflow,/swangle|sysctl|setcap|sudo perf|--unsafe/);
  const runner=readFileSync(new URL('../scripts/qa/android-host-profile/runner.mjs',import.meta.url),'utf8');assert.ok(runner.indexOf('runScopePreflight(profileContext')<runner.indexOf("cp.spawn(join(sdk,'emulator/emulator')"));assert.match(runner,/env:profileContext\.childEnv/);assert.doesNotMatch(runner,/\.\.\.env,ANDROID_QA_SOURCE/);
});
test('owned module records bind device/inode and do not invent function attribution from a mapping',()=>{
  const maps=parseMappings('1000-2000 r-xp 00000100 0a:20 123 /usr/lib/test.so\n');assert.equal(addressMapping('0x1100',maps).elfFileOffset,'0x200');assert.equal(addressMapping('0x3000',maps),null);
  moduleFileIdentity(maps[0],{ino:123n,dev:(10n<<8n)|32n,size:4096n});assert.throws(()=>moduleFileIdentity(maps[0],{ino:124n,dev:(10n<<8n)|32n,size:4096n}),/inode differs/);
});
test('scope fixture uses per-thread storage and does not pretend sleep is CPU work',()=>{
  const source=readFileSync(new URL('../scripts/qa/android-host-profile/scope-fixture.c',import.meta.url),'utf8');assert.match(source,/_Thread_local volatile unsigned long sink/);assert.match(source,/CLOCK_THREAD_CPUTIME_ID/);assert.match(source,/pthread_create/);assert.match(source,/fork\(\)/);
});

test('offline decoding waits for actual workload and profiler exit verification',()=>{
  const output=mkdtempSync(join(tmpdir(),'host-offline-stop-'));let calls=0;
  for(const [workloadStopped,cleanupVerified]of [[false,true],[true,false]]){
    const result=analyzeStoppedProfile({profile:{cleanupVerified,parsed:{}},snapshots:[],workloadStopped,output,env:childEnvironment(options),run:()=>{calls++;assert.fail('No decoder before verified stop');}});assert.equal(result.ready,false);assert.equal(result.executed,false);
  }assert.equal(calls,0);
});
test('offline decoder command failure preserves partial output and fails technical acceptance',()=>{
  const output=mkdtempSync(join(tmpdir(),'host-offline-failure-')),env=childEnvironment(options),partial={complete:false,status:'deadline',rows:[{address:'0xab',symbol:null}]};
  const result=analyzeStoppedProfile({profile:{cleanupVerified:true,parsed:{}},snapshots:[],workloadStopped:true,output,env,run:(file,args,config)=>{
    assert.equal(file,'/usr/bin/python3');assert.deepEqual(config.env,env);assert.equal(config.timeout,OFFLINE.timeoutMs);writeFileSync(args[4],JSON.stringify(partial));return{status:1,stdout:'partial',stderr:''};}});
  assert.equal(result.ready,false);assert.deepEqual(result.decoding,partial);assert.equal(result.execution.exitCode,1);
  const profile={preflight:{ready:true},ownershipVerified:true,cleanupVerified:true,scopeErrors:[],quality:{cleanTechnicalStop:true},parsed:{totalSamples:10},offlineAnalysis:result},workload={valid:true,clean:true,targetAnr:false};
  const verdict=summarizeHostProfile(workload,profile);assert.equal(verdict.technicalExitCode,1);assert.equal(verdict.diagnosticOutcome,'PROFILE_AVAILABLE_OFFLINE_ANALYSIS_FAILED');assert.equal(verdict.profile.quality.cleanTechnicalStop,true);
  assert.equal(summarizeHostProfile({...workload,clean:false,targetAnr:true},profile).diagnosticOutcome,'PROFILE_AVAILABLE_NATIVE_ANR');
});
test('successful offline processing with unknown symbols retains partial attribution and failed original source gate',()=>{
  const output=mkdtempSync(join(tmpdir(),'host-offline-success-'));
  const result=analyzeStoppedProfile({profile:{cleanupVerified:true,parsed:{}},snapshots:[],workloadStopped:true,output,env:childEnvironment(options),run:(file,args)=>{writeFileSync(args[4],JSON.stringify({complete:true,functionAttributionAvailability:'unavailable',rows:[{address:'0xab',symbol:null}]}));return{status:0};}});
  assert.equal(result.ready,true);assert.equal(result.decoding.functionAttributionAvailability,'unavailable');assert.equal(result.releaseAcceptance,false);
  const verdict=summarizeHostProfile({valid:true,clean:true,targetAnr:false},{preflight:{ready:true},ownershipVerified:true,cleanupVerified:true,scopeErrors:[],quality:{cleanTechnicalStop:true},parsed:{totalSamples:10},offlineAnalysis:result});assert.equal(verdict.technicalExitCode,0);assert.equal(verdict.originalSourceGate,'FAILED');assert.equal(verdict.profileAttributionComplete,false);
});
test('offline ELF controls use true PT_LOAD, exact public bytes and ambiguous/JIT unknowns',()=>{
  const path=new URL('./android_host_profile_symbols_test.py',import.meta.url),candidates=[process.env.PYTHON,'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',process.platform==='win32'?'python':'python3'].filter(Boolean);
  const python=candidates.find(file=>spawnSync(file,['--version'],{encoding:'utf8',windowsHide:true}).status===0);assert.ok(python,'Python required, no skipped ELF controls');
  const run=spawnSync(python,['-B',path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
});
test('privileged Python exact-body and no-exec corruption controls',()=>{
  const path=new URL('./android_host_profile_root_test.py',import.meta.url);
  const candidates=[process.env.PYTHON,'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',process.platform==='win32'?'python':'python3'].filter(Boolean);
  const python=candidates.find(file=>spawnSync(file,['--version'],{encoding:'utf8',windowsHide:true}).status===0);assert.ok(python,'Python required, do not skip privileged guard tests');
  const run=spawnSync(python,['-B',path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{input:JSON.stringify({nodeProgram:program}),encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
});
test('all original immutable APK/source/SDK Python controls remain required',()=>{
  const path=new URL('./android_host_profile_artifact_test.py',import.meta.url),candidates=[process.env.PYTHON,'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',process.platform==='win32'?'python':'python3'].filter(Boolean);
  const python=candidates.find(file=>spawnSync(file,['--version'],{encoding:'utf8',windowsHide:true}).status===0);assert.ok(python,'Python required');
  const run=spawnSync(python,['-B',path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
});
