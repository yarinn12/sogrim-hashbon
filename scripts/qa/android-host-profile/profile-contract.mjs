import assert from 'node:assert/strict';
import {isAbsolute,join,resolve,delimiter,relative} from 'node:path';
import {realpathSync} from 'node:fs';
export const PROFILE=Object.freeze({hz:49,frames:32,bucketNs:1000000000,maxMapKeys:65536,maxBytes:268435456,rawFileMaxBytes:67108864,maxDurationMs:1200000,startupMs:30000,stopMs:15000,preflightMinCpuNs:250000000});
const fixedPath='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const paths=(value,label)=>{assert.equal(typeof value,'string');assert.ok(isAbsolute(value),label+' must be absolute');assert.ok(!/[\0\r\n]/.test(value),'Unsafe path');return resolve(value);};
export function childEnvironment({sdk,avdHome,home,temp}){
  sdk=paths(sdk,'SDK');avdHome=paths(avdHome,'AVD home');home=paths(home,'Private home');temp=paths(temp,'Private temp');
  // Build from explicit operational values; never spread process.env. Private
  // home/config paths prevent implicit reads of the runner's private config.
  return {PATH:fixedPath,HOME:home,TMPDIR:temp,XDG_CONFIG_HOME:join(home,'config'),XDG_CACHE_HOME:join(home,'cache'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',
    SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,ANDROID_AVD_HOME:avdHome,ANDROID_USER_HOME:home,ANDROID_EMULATOR_HOME:home,
    ADB_VENDOR_KEYS:join(home,'adbkey'),ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037'};
}
export function profilerEnvironment(options){
  return {...childEnvironment(options),BPFTRACE_BTF:'/sys/kernel/btf/vmlinux',BPFTRACE_MAX_MAP_KEYS:String(PROFILE.maxMapKeys),BPFTRACE_LOG_SIZE:'1048576',BPFTRACE_STACK_MODE:'raw'};
}
export function requireCleanEnvironment(actual,expected){
  assert.ok(JSON.stringify(Object.keys(actual).sort())===JSON.stringify(Object.keys(expected).sort()),'Unexpected child environment keys');
  for(const key of Object.keys(expected))assert.ok(actual[key]===expected[key],'Unexpected operational environment value: '+key);
  return {verified:true,keys:Object.keys(expected).sort(),secretValuesLogged:false};
}
export function emulatorEnvironment(actual,base,sdk,{realpath=realpathSync}={}){
  // Only the SDK launcher may add these two operational loader values. They
  // cannot inject arbitrary search paths or become profiler environment input.
  const extras=Object.keys(actual).filter(key=>!Object.hasOwn(base,key));
  assert.ok(extras.every(key=>['LD_LIBRARY_PATH','ANDROID_EMULATOR_LAUNCHER_DIR'].includes(key)),'Unexpected emulator environment keys');
  requireCleanEnvironment(Object.fromEntries(Object.keys(base).map(key=>[key,actual[key]])),base);
  const root=realpath(join(sdk,'emulator'));
  const contained=value=>{assert.ok(typeof value==='string'&&value.length>0&&!/[\0\r\n]/.test(value)&&isAbsolute(value),'Unsafe SDK loader path');const r=relative(root,realpath(value));assert.ok(r===''||(!r.startsWith('..')&&!isAbsolute(r)),'SDK loader path escapes emulator');};
  if(actual.LD_LIBRARY_PATH!==undefined){assert.equal(typeof actual.LD_LIBRARY_PATH,'string');for(const value of actual.LD_LIBRARY_PATH.split(delimiter))contained(value);}
  if(actual.ANDROID_EMULATOR_LAUNCHER_DIR!==undefined){contained(actual.ANDROID_EMULATOR_LAUNCHER_DIR);assert.equal(realpath(actual.ANDROID_EMULATOR_LAUNCHER_DIR),root);}
  return {...base,...Object.fromEntries(extras.map(key=>[key,actual[key]]))};
}
export function parseEnviron(bytes){
  const result=Object.create(null);for(const line of bytes.toString('utf8').split('\0').filter(Boolean)){const at=line.indexOf('=');assert.ok(at>0,'Malformed environment');const key=line.slice(0,at);assert.ok(!Object.hasOwn(result,key),'Duplicate environment key');result[key]=line.slice(at+1);}return result;
}
export function requireProfileIdentity(owner,clockTicks){
  assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>1,'Require an actual TGID');assert.match(owner.startTicks||'',/^[1-9]\d*$/,'Require original process startTicks');
  assert.ok(Number.isSafeInteger(clockTicks)&&clockTicks>0&&1000000000%clockTicks===0,'Unsupported USER_HZ conversion');return BigInt(1000000000/clockTicks);
}
export function buildProfileProgram(owner,clockTicks){
  const divisor=requireProfileIdentity(owner,clockTicks);
  return `BEGIN { printf("SOGRIM_PROFILE_READY ${owner.pid} ${owner.startTicks}\\n"); }\n`+
    `profile:hz:49 /pid == ${owner.pid}/ {\n`+
    `  $leader = ((struct task_struct *)curtask)->group_leader;\n`+
    `  if (($leader->start_boottime / ${divisor}) == ${owner.startTicks}) {\n`+
    `    @samples[nsecs(monotonic) / 1000000000, tid, ustack(raw, 32)] = count();\n`+
    `  }\n}\n`+
    `interval:s:1200 { printf("SOGRIM_PROFILE_DEADLINE\\n"); exit(); }\n`+
    `END { printf("SOGRIM_PROFILE_STOPPED\\n"); }\n`;
}
export function requireProfileProgram(program,owner,clockTicks){
  const divisor=requireProfileIdentity(owner,clockTicks);assert.equal(typeof program,'string');
  // Independent narrow grammar: one global timed sampling probe, TGID predicate,
  // then leader birth check, THEN the only target stack/data collection call.
  const expected=new RegExp('^BEGIN \\{ printf\\("SOGRIM_PROFILE_READY '+owner.pid+' '+owner.startTicks+'\\\\n"\\); \\}\\n'+
    'profile:hz:49 /pid == '+owner.pid+'/ \\{\\n'+
    '  \\$leader = \\(\\(struct task_struct \\*\\)curtask\\)->group_leader;\\n'+
    '  if \\(\\(\\$leader->start_boottime / '+divisor+'\\) == '+owner.startTicks+'\\) \\{\\n'+
    '    @samples\\[nsecs\\(monotonic\\) / 1000000000, tid, ustack\\(raw, 32\\)\\] = count\\(\\);\\n'+
    '  \\}\\n\\}\\n'+
    'interval:s:1200 \\{ printf\\("SOGRIM_PROFILE_DEADLINE\\\\n"\\); exit\\(\\); \\}\\n'+
    'END \\{ printf\\("SOGRIM_PROFILE_STOPPED\\\\n"\\); \\}\\n$');
  assert.ok(expected.test(program),'Unapproved BPF program; no stack/data read before TGID and birth guards');
  return {verified:true,genericTriggerOnAllCpus:true,targetTgid:owner.pid,targetStartTicks:owner.startTicks,forkSamplesAllowed:false,futureSameTgidThreadsIncluded:true,kernelStacks:false,rawUserStackBytes:false,dwarf:false};
}
export function parseProfileOutput(text,owner){
  assert.equal(typeof text,'string');assert.ok(text.includes(`SOGRIM_PROFILE_READY ${owner.pid} ${owner.startTicks}`),'Profiler did not acknowledge exact target');
  const rows=[],consumed=[];
  const pattern=/^@samples\[(\d+),\s*(\d+),\s*\n([\s\S]*?)\]:\s*(\d+)\s*$/gm;
  for(const match of text.matchAll(pattern)){
    const frames=match[3].split(/\r?\n/).map(s=>s.trim()).filter(Boolean);assert.ok(frames.length<=32,'Unexpected frame depth');
    assert.ok(frames.every(frame=>/^(?:0x)?[a-fA-F0-9]+$/.test(frame)||/^\[unknown\]$/.test(frame)),'Unexpected raw address output; preserve as partial');
    const count=Number(match[4]),tid=Number(match[2]);assert.ok(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(tid)&&tid>1);
    rows.push({monotonicSecond:match[1],tid,frames:frames.map(f=>f==='[unknown]'?null:'0x'+f.replace(/^0x/,'')),count});consumed.push([match.index,match.index+match[0].length]);
  }
  let remaining=text;for(const [a,b]of consumed.toReversed())remaining=remaining.slice(0,a)+remaining.slice(b);
  assert.ok(!/^@/m.test(remaining),'Unparsed profile map data');
  const unknown=rows.filter(r=>r.frames.length===0||r.frames.some(f=>!f));
  return {rows,totalSamples:rows.reduce((s,r)=>s+r.count,0),stopped:text.includes('SOGRIM_PROFILE_STOPPED'),deadlineReached:text.includes('SOGRIM_PROFILE_DEADLINE'),unknownFrameRows:unknown.length,unknownStackSamples:unknown.reduce((s,r)=>s+r.count,0),rawUserStackBytes:false,unwindCompletenessProven:false,symbolsComplete:false,causalAttributionProven:false};
}
export function profileHealth({stdout,stderr,fileBytes,exitCode,parsed}){
  assert.ok(Number.isSafeInteger(fileBytes)&&fileBytes>=0);
  const lines=(stdout+'\n'+stderr).split(/\r?\n/),messages=lines.filter(line=>/lost|dropped|overflow|map.*(?:full|limit|fail)|no space|ENOSPC|warning|error/i.test(line));
  const count=(keyword,formats)=>{const found=messages.filter(line=>keyword.test(line));if(!found.length)return null;const values=found.map(line=>formats.map(pattern=>line.match(pattern)?.[1]).find(Boolean));return values.every(Boolean)?values.reduce((s,n)=>s+Number(n),0):null;};
  return {technicalExitCode:exitCode,fileBytes,byteLimit:PROFILE.maxBytes,byteLimitExceeded:fileBytes>PROFILE.maxBytes,
    reportedDroppedSamples:count(/lost|dropped/i,[/(?:lost|dropped)\s+(\d+)\s+(?:events|samples)\b/i,/(\d+)\s+(?:events|samples)\s+(?:lost|dropped)\b/i]),
    reportedMapFull:count(/map.*(?:full|limit|fail)|ENOSPC|no space/i,[/(\d+)\s+map[- ]full\s+events\b/i]),
    reportedOverflow:count(/overflow/i,[/overflow\s*[:=]\s*(\d+)\s+(?:events|samples)\b/i]),
    unknownStackSamples:parsed?.unknownStackSamples??null,diagnosticMessages:messages,
    cleanTechnicalStop:exitCode===0&&parsed?.stopped===true&&!parsed.deadlineReached&&fileBytes<=PROFILE.maxBytes&&messages.length===0,
    // Absence of a warning is not an exact zero-loss/unwind measurement.
    completeKernelLossAccounting:false,lossFreeCaptureProven:false,fullUnwindCoverageProven:false,
    dataAvailability:parsed?.totalSamples>0?'partial':'unavailable',rawUserStackBytes:false};
}
export function verifyScopePreflight(profile,fixture){
  assert.ok(profile.stopped&&!profile.deadlineReached,'Scope probe did not stop normally');assert.ok(profile.totalSamples>0,'No actual profile samples');
  assert.ok(Number.isSafeInteger(fixture.mainTid)&&fixture.mainTid===fixture.pid);assert.ok(Number.isSafeInteger(fixture.lateThreadTid)&&fixture.lateThreadTid!==fixture.pid);
  assert.ok(Number.isSafeInteger(fixture.forkPid)&&fixture.forkPid!==fixture.pid);assert.equal(fixture.lateThreadStartedAfterGo,true);
  assert.ok([fixture.parentCpuNs,fixture.threadCpuNs,fixture.forkCpuNs].every(n=>Number.isSafeInteger(n)&&n>=PROFILE.preflightMinCpuNs),'Each scope control must execute at least 250ms measured CPU, not merely remain alive');
  const tids=new Set(profile.rows.map(r=>r.tid));assert.ok(tids.has(fixture.pid),'Main fixture thread was not sampled');assert.ok(tids.has(fixture.lateThreadTid),'Late CLONE_THREAD was not sampled');
  for(const tid of [fixture.pid,fixture.lateThreadTid])assert.ok(profile.rows.some(r=>r.tid===tid&&r.frames.some(frame=>frame!==null&&BigInt(frame)>0n)),'Scope control did not produce an actual user instruction address');
  assert.ok(!tids.has(fixture.forkPid),'Foreign fork process was sampled');assert.ok([...tids].every(tid=>[fixture.pid,fixture.lateThreadTid].includes(tid)),'Foreign preflight task sampled');
  return {ready:true,mainObserved:true,futureThreadObserved:true,busyForkRejected:true,minMeasuredCpuNs:PROFILE.preflightMinCpuNs,syntheticOnly:true,onePreflight:true};
}
