import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,openSync,closeSync,existsSync,statSync,readlinkSync,realpathSync,copyFileSync,readdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROFILE,childEnvironment,profilerEnvironment,requireCleanEnvironment,emulatorEnvironment,parseEnviron,buildProfileProgram,requireProfileProgram,parseProfileOutput,profileHealth,verifyScopePreflight} from './profile-contract.mjs';
import {parseProcStat} from '../android-native-isolated/trace-diagnostics.mjs';
import {withStartupCleanup} from './startup-lifecycle.mjs';
import {readOwner} from './owned.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
export function processIdentity(pid){return parseProcStat(readFileSync('/proc/'+pid+'/stat','utf8'));}
function liveIdentity(expected){const actual=processIdentity(expected.pid);assert.equal(actual.pid,expected.pid);assert.equal(actual.startTicks,expected.startTicks,'Refuse reused PID');return actual;}
function command(file,args,env,{timeout=30000,...options}={}){
  const r=cp.spawnSync(file,args,{env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:32*1024*1024,...options});
  return {file,args,exitCode:r.status,signal:r.signal??null,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''};
}
function requireCommand(result,label){assert.equal(result.exitCode,0,label+' failed');assert.ok(!result.error&&!result.signal,label+' interrupted');return result.stdout;}
export function createProfileRoot({runnerTemp,runId,sdk}){
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.match(String(runId),/^\d+$/);
  assert.equal(resolve(runnerTemp),'/home/runner/work/_temp','Unexpected standard-runner temp root');
  const nonce=randomBytes(16).toString('hex'),root=join(runnerTemp,'android-host-profile-'+runId+'-'+nonce);
  mkdirSync(root,{mode:0o700});for(const name of ['home','home/config','home/cache','temp','avds'])mkdirSync(join(root,name),{mode:0o700});
  const options={sdk,avdHome:join(root,'avds'),home:join(root,'home'),temp:join(root,'temp')};
  return {root,nonce,options,environment:profilerEnvironment(options),childEnv:childEnvironment(options),runnerUid:process.getuid(),runnerGid:process.getgid()};
}
export function inspectTool(context,output){
  mkdirSync(output,{recursive:true});const env=context.childEnv,tool='/usr/bin/bpftrace';
  assert.equal(realpathSync(tool),tool,'Unexpected profiler symlink');const stat=statSync(tool);assert.equal(stat.uid,0);assert.equal(stat.mode&0o022,0,'Profiler is writable outside root');
  const version=command(tool,['--version'],env),packageOwner=command('/usr/bin/dpkg-query',['-S',tool],env),packageVersion=command('/usr/bin/dpkg-query',['-W','-f=${Package} ${Version} ${Architecture}\n','bpftrace'],env),elf=command('/usr/bin/readelf',['-n',tool],env);
  for(const [name,value]of Object.entries({version,packageOwner,packageVersion,elf}))save(join(output,name+'.json'),value);
  assert.match(requireCommand(version,'bpftrace version').trim(),/^bpftrace v0\.20\.2$/,'Require documented Ubuntu Noble 0.20.2; no alternate tool/version');
  assert.match(requireCommand(packageOwner,'Official package owner'),/^bpftrace: \/usr\/bin\/bpftrace\s*$/);
  assert.match(requireCommand(packageVersion,'Official package version'),/^bpftrace 0\.20\.2[^\s]* amd64\s*$/);
  requireCommand(elf,'Profiler ELF notes');assert.ok(statSync('/sys/kernel/btf/vmlinux').size>0,'Missing actual kernel BTF');
  const ticks=command('/usr/bin/getconf',['CLK_TCK'],env);save(join(output,'clock-ticks.json'),ticks);const clockTicks=Number(requireCommand(ticks,'USER_HZ').trim());assert.ok(Number.isSafeInteger(clockTicks)&&clockTicks>0&&1000000000%clockTicks===0);
  const result={tool,toolSha256:sha(readFileSync(tool)),toolInode:String(stat.ino),toolDevice:String(stat.dev),version:version.stdout.trim(),clockTicks,btfPath:'/sys/kernel/btf/vmlinux',btfSha256:sha(readFileSync('/sys/kernel/btf/vmlinux')),kernelRelease:readFileSync('/proc/sys/kernel/osrelease','utf8').trim(),genericTriggerOnAllCpus:true,scope:'TGID plus leader birth predicate BEFORE user-stack addresses; no foreign PC, stack, comm or maps',rawUserStackBytes:false,actualBpfKernelScopePreflightReady:false};
  save(join(output,'tool-identity.json'),result);return result;
}
function targetReceipt(owner,kind,expectedEnv){
  const before=kind==='emulator'?readOwner(owner):liveIdentity(owner),exe=readlinkSync('/proc/'+owner.pid+'/exe');
  const actualCommand=readFileSync('/proc/'+owner.pid+'/cmdline','utf8').split('\0').filter(Boolean);
  const actualEnv=parseEnviron(readFileSync('/proc/'+owner.pid+'/environ'));
  const targetEnv=kind==='emulator'?emulatorEnvironment(actualEnv,expectedEnv,expectedEnv.ANDROID_HOME):expectedEnv;
  const environment=requireCleanEnvironment(actualEnv,targetEnv);
  const result={kind,pid:owner.pid,startTicks:owner.startTicks,exe,exeSha256:sha(readFileSync(exe)),command:actualCommand,environment,targetEnvironment:targetEnv};
  if(kind==='emulator')readOwner(owner);else liveIdentity(before);return result;
}
function privilege(context,mode,configPath,{timeout=30000}={}){
  return command('/usr/bin/sudo',['-n','--','/usr/bin/python3','-I','-B',join(here,'root-control.py'),mode,configPath],context.environment,{timeout});
}
export async function startProfile(context,tool,owner,output,{kind='emulator',onHandle=()=>{}}={}){
  mkdirSync(output,{recursive:true});const token=randomBytes(8).toString('hex'),programPath=join(context.root,'profile-'+token+'.bt'),dataPath=join(context.root,'profile-'+token+'.txt'),ticketPath=join(context.root,'profile-'+token+'-owner.json'),configPath=join(context.root,'profile-'+token+'-config.json');
  const target=targetReceipt(owner,kind,context.childEnv),program=buildProfileProgram(owner,tool.clockTicks),scope=requireProfileProgram(program,owner,tool.clockTicks);
  writeFileSync(programPath,program,{flag:'wx',mode:0o600});writeFileSync(dataPath,'',{flag:'wx',mode:0o600});
  const argv=[tool.tool,'-B','line','-kk','-p',String(owner.pid),'-o',dataPath,programPath];
  const config={version:1,root:context.root,nonce:context.nonce,runnerUid:context.runnerUid,runnerGid:context.runnerGid,target,targetEnvironment:target.targetEnvironment,tool:tool.tool,toolSha256:tool.toolSha256,environment:context.environment,program:programPath,programSha256:sha(Buffer.from(program)),output:dataPath,ticket:ticketPath,command:argv};
  save(configPath,config);copyFileSync(programPath,join(output,'profile.bt'));save(join(output,'launch-configuration.json'),config);save(join(output,'scope-contract.json'),scope);
  // Publish the cleanup handle before metadata, spawn, READY or inspect can fail.
  const handle={context,tool,owner,output,kind,configPath,dataPath,ticketPath,child:null,scope,startedAtUtc:new Date().toISOString(),startedMonotonicNs:process.hrtime.bigint().toString(),launchError:null,ownershipVerified:false,stopRequested:false,scopeErrors:[]};
  onHandle(handle);
  const until=performance.now()+PROFILE.startupMs;
  try{
  if(kind==='synthetic-preflight'){
    const info=command(tool.tool,['--info'],context.environment,{timeout:Math.max(1,Math.ceil(until-performance.now()))});save(join(output,'kernel-bpf-info.json'),{...info,scope:'Nonprivileged feature report; actual privileged compile/attach/scope proof below is mandatory'});requireCommand(info,'BPF/kernel feature query');
  }
  liveIdentity(owner);const stdout=openSync(join(output,'profiler-launch.stdout.log'),'wx',0o600),stderr=openSync(join(output,'profiler.stderr.log'),'wx',0o600);
  let child;try{child=cp.spawn('/usr/bin/sudo',['-n','--','/usr/bin/python3','-I','-B',join(here,'root-control.py'),'start',configPath],{env:context.environment,stdio:['ignore',stdout,stderr],windowsHide:true});handle.child=child;}finally{closeSync(stdout);closeSync(stderr);}
  child.once('error',error=>{handle.launchError=error.message;});
  while(performance.now()<until){
    liveIdentity(owner);if(handle.launchError)throw new Error('Profiler launch failed: '+handle.launchError);
    if(child.exitCode!==null||child.signalCode!==null)throw new Error('Profiler exited before ready; preserve startup logs');
    if(existsSync(ticketPath)&&readFileSync(dataPath,'utf8').includes(`SOGRIM_PROFILE_READY ${owner.pid} ${owner.startTicks}`))break;
    await wait(50);
  }
  assert.ok(existsSync(ticketPath)&&readFileSync(dataPath,'utf8').includes(`SOGRIM_PROFILE_READY ${owner.pid} ${owner.startTicks}`),'Profiler startup bound exhausted');
  assert.ok(performance.now()<until,'Profiler startup bound exhausted before identity check');
  const inspect=privilege(context,'inspect',configPath,{timeout:Math.max(1,Math.ceil(until-performance.now()))});save(join(output,'profiler-owned-start.json'),inspect);requireCommand(inspect,'Actual privileged profiler identity/environment');
  handle.ownershipVerified=true;liveIdentity(owner);
  handle.monitor=setInterval(()=>{
    try{if(kind==='emulator')readOwner(owner);else liveIdentity(owner);const bytes=statSync(dataPath).size+statSync(join(output,'profiler.stderr.log')).size;if(bytes>PROFILE.maxBytes&&!handle.stopRequested){handle.scopeErrors.push('Profiler output exceeded fixed256MiB cap');handle.stopRequested=true;const stop=privilege(context,'stop',configPath,{timeout:PROFILE.stopMs});save(join(output,'cap-stop.json'),stop);}}
    catch(error){if(!handle.scopeErrors.includes(error.message))handle.scopeErrors.push(error.message);if(!handle.stopRequested){handle.stopRequested=true;const stop=privilege(context,'stop',configPath,{timeout:PROFILE.stopMs});save(join(output,'identity-loss-stop.json'),stop);}}
  },1000);
  return handle;
  }catch(error){error.profileHandle=handle;save(join(output,'profile-start-error.json'),{error:error.message});throw error;}
}
export async function finishProfile(handle,{targetAlreadyExited=false}={}){
  clearInterval(handle.monitor);const {context,output,configPath,child}=handle,until=performance.now()+PROFILE.stopMs;
  if(child&&child.exitCode===null&&child.signalCode===null&&!targetAlreadyExited&&!handle.stopRequested){
    const stop=privilege(context,'stop',configPath,{timeout:Math.max(1,Math.ceil(until-performance.now()))});save(join(output,'owned-profiler-stop.json'),stop);handle.stopRequested=true;
    if(stop.exitCode!==0)handle.scopeErrors.push('Owned pidfd profiler stop failed');
  }
  while(child&&child.exitCode===null&&child.signalCode===null&&performance.now()<until)await wait(50);
  if(child&&child.exitCode===null&&child.signalCode===null)handle.scopeErrors.push('Owned profiler did not close within bound');
  let cleanupVerified=child===null,closedIdentity=null;
  if(child&&existsSync(handle.ticketPath)){
    const check=privilege(context,'inspect',configPath,{timeout:Math.max(1,Math.ceil(until-performance.now()))});save(join(output,'profiler-owned-after-stop.json'),check);
    try{if(check.exitCode===0){closedIdentity=JSON.parse(check.stdout);cleanupVerified=closedIdentity.verified===true&&closedIdentity.exited===true;}}catch{}
  }
  if(!cleanupVerified)handle.scopeErrors.push('Actual privileged profiler exit was not verified; do not issue further workload commands');
  const completedMonotonicNs=process.hrtime.bigint().toString();
  const stdout=readFileSync(handle.dataPath,'utf8'),stderr=existsSync(join(output,'profiler.stderr.log'))?readFileSync(join(output,'profiler.stderr.log'),'utf8'):'';copyFileSync(handle.dataPath,join(output,'profile-raw-addresses.txt'));
  let parsed=null,parseError=null;try{parsed=parseProfileOutput(stdout,handle.owner);}catch(error){parseError=error.message;handle.scopeErrors.push('Profile output could not be completely parsed');}
  const quality=profileHealth({stdout,stderr,fileBytes:Buffer.byteLength(stdout)+Buffer.byteLength(stderr),exitCode:child?.exitCode??null,parsed});
  if(handle.scopeErrors.length)quality.cleanTechnicalStop=false;
  const result={startedAtUtc:handle.startedAtUtc,completedAtUtc:new Date().toISOString(),startedMonotonicNs:handle.startedMonotonicNs,completedMonotonicNs,owner:handle.owner,scope:handle.scope,ownershipVerified:handle.ownershipVerified,scopeErrors:handle.scopeErrors,cleanupVerified,closedIdentity,parseError,parsed,quality,actualProfiler:existsSync(handle.ticketPath)?readJson(handle.ticketPath):null,targetAlreadyExited,foreignProcessesSignalled:false,rawUserStackBytes:false,nativeAcceptance:false,releaseAcceptance:false};
  save(join(output,'profile-result.json'),result);return result;
}
export async function runScopePreflight(context,tool,output){
  mkdirSync(output,{recursive:true});const fixture=join(context.root,'scope-fixture'),ready=join(context.root,'fixture-ready.txt'),go=join(context.root,'fixture-go'),resultPath=join(context.root,'fixture-result.json'),finish=join(context.root,'fixture-finish');
  const compiled=command('/usr/bin/cc',['-O0','-g','-fno-omit-frame-pointer','-pthread',join(here,'scope-fixture.c'),'-o',fixture],context.childEnv);save(join(output,'fixture-compilation.json'),compiled);requireCommand(compiled,'Owned native scope fixture compilation');
  const fd=openSync(join(output,'fixture.log'),'wx',0o600);let child;try{child=cp.spawn(fixture,[ready,go,resultPath,finish],{env:context.childEnv,stdio:['ignore',fd,fd],windowsHide:true});}finally{closeSync(fd);}
  child.once('error',()=>{});assert.ok(Number.isSafeInteger(child.pid)&&child.pid>1,'Scope fixture did not launch');
  const fixtureHandle={child,owner:null,leasePath:join(context.root,'fixture-cleanup-lease.json'),launchCommand:[fixture,ready,go,resultPath,finish],cleanupVerified:false};
  save(join(output,'fixture-launch-pending.json'),{pid:child.pid,command:fixtureHandle.launchCommand,identityVerified:false});
  let owner,result;
  return withStartupCleanup({
  begin:async retain=>{
    owner=processIdentity(child.pid);assert.equal(owner.pid,child.pid);const target=targetReceipt(owner,'synthetic-preflight',context.childEnv);assert.equal(target.exe,fixture);
    fixtureHandle.owner=owner;save(fixtureHandle.leasePath,{root:context.root,nonce:context.nonce,runnerUid:context.runnerUid,target,targetEnvironment:context.childEnv});
    save(join(output,'fixture-owned-identity.json'),target);
    const until=performance.now()+5000;while(!existsSync(ready)&&performance.now()<until){liveIdentity(owner);await wait(25);}
    assert.ok(existsSync(ready),'Scope fixture ready bound exhausted');assert.equal(Number(readFileSync(ready,'utf8').trim()),owner.pid);
    return startProfile(context,tool,owner,join(output,'scope-profile'),{kind:'synthetic-preflight',onHandle:retain});
  },
  work:async(profile,markClosed)=>{
    writeFileSync(go,'go\n',{flag:'wx',mode:0o600});const end=performance.now()+10000;
    while(!existsSync(resultPath)&&child.exitCode===null&&child.signalCode===null&&performance.now()<end)await wait(25);
    assert.ok(existsSync(resultPath),'Scope fixture failed/timed out before CPU proof');liveIdentity(owner);
    const native=readJson(resultPath);save(join(output,'fixture-result.json'),native);
    result=await finishProfile(profile);markClosed(result.cleanupVerified);writeFileSync(finish,'finish\n',{flag:'wx',mode:0o600});
    const closedBy=performance.now()+5000;while(child.exitCode===null&&child.signalCode===null&&performance.now()<closedBy)await wait(25);
    assert.equal(child.exitCode,0,'Owned scope fixture did not close');assert.equal(child.signalCode,null);
    assert.equal(result.quality.cleanTechnicalStop,true,'Scope profile has errors/loss/partial technical close');
    const preflight=verifyScopePreflight(result.parsed,native);save(join(output,'scope-preflight.json'),preflight);return preflight;
  },
  closeProfile:async profile=>{const partial=await finishProfile(profile);return {verified:partial.cleanupVerified};},
  closeFixture:async()=>{
    if(child.exitCode===null&&child.signalCode===null){
      if(fixtureHandle.owner&&existsSync(fixtureHandle.leasePath)){
        const stopped=command('/usr/bin/python3',['-I','-B',join(here,'root-control.py'),'stop-owned-fixture',fixtureHandle.leasePath],context.childEnv,{timeout:15000});save(join(output,'fixture-cleanup.json'),stopped);
        if(stopped.exitCode!==0)save(join(output,'fixture-cleanup-unverified.json'),{verified:false,reason:'Owned pidfd fixture stop failed; no numeric signal fallback'});
        const closedBy=performance.now()+5000;while(child.exitCode===null&&child.signalCode===null&&performance.now()<closedBy)await wait(25);
        if(child.exitCode===null&&child.signalCode===null)save(join(output,'fixture-cleanup-unverified.json'),{verified:false,reason:'Owned fixture exit not verified; no further commands'});
      }else{save(join(output,'fixture-cleanup-unverified.json'),{verified:false,reason:'No verified fixture identity/lease; no stop signal issued'});return {verified:false};}
    }
    return {verified:child.exitCode!==null||child.signalCode!==null};
  },
  recordUnavailable:async receipt=>save(join(output,'startup-cleanup-unverified.json'),receipt)
  });
}
