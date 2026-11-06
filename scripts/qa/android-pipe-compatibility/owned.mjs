import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {parseProcStat} from '../android-native-isolated/trace-diagnostics.mjs';
export function readOwner(context,{read=readFileSync,procRoot='/proc'}={}){
  assert.ok(Number.isSafeInteger(context.pid)&&context.pid>1,'Require actual owned PID');
  assert.match(context.startTicks||'',/^\d+$/,'Require pinned actual startTicks');
  assert.match(context.avd||'',/^sogrim_ci_\d+_1_pipe$/);
  const stat=()=>parseProcStat(read(join(procRoot,String(context.pid),'stat'),'utf8'));
  const before=stat(),args=read(join(procRoot,String(context.pid),'cmdline'),'utf8').split('\0').filter(Boolean),after=stat();
  for(const s of [before,after]){assert.equal(s.pid,context.pid);assert.equal(s.startTicks,context.startTicks,'Refuse reused PID');}
  assert.ok([join(context.sdk,'emulator/emulator'),join(context.sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless')].includes(args[0]),'Refuse foreign executable');
  for(const [flag,value] of Object.entries({'-avd':context.avd,'-port':'5582','-gpu':'swiftshader','-feature':'GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory':'4096','-cores':'2'})){
    assert.equal(args.filter(x=>x===flag).length,1,'Missing/duplicate owned argument: '+flag);assert.equal(args[args.indexOf(flag)+1],value,'Foreign emulator command: '+flag);
  }
  return {pid:context.pid,startTicks:context.startTicks,command:args};
}
export function requireAdbArgs(args){
  assert.ok(Array.isArray(args));assert.equal(args[0],'-s');assert.equal(args[1],'emulator-5582','Refuse foreign serial');
  assert.ok(!args.slice(2).some(a=>['-H','-P','-L','kill-server','start-server','connect','disconnect','devices'].includes(a)),'Refuse global or foreign ADB command');
}
export function guardedAdb(context,args,options,run,{owner=readOwner,record=row=>appendFileSync(context.audit,JSON.stringify(row)+'\n')}={}){
  const row={atUtc:new Date().toISOString(),args,executed:false};
  try{
    requireAdbArgs(args);
    const before=process.hrtime.bigint();row.before=owner(context);const began=process.hrtime.bigint();row.guardBeforeNs=String(began-before);row.executed=true;
    const result=run(args,options);const finished=process.hrtime.bigint();row.commandDurationNs=String(finished-began);row.exitCode=result.status;row.signal=result.signal??null;row.error=result.error?.message??null;
    row.after=owner(context);row.guardAfterNs=String(process.hrtime.bigint()-finished);return result;
  }catch(error){row.guardError=error.message;throw error;}
  finally{record(row);}
}
export function installAudit(cp,context,{owner=readOwner,record=row=>appendFileSync(context.audit,JSON.stringify(row)+'\n')}={}){
  const originalSync=cp.spawnSync,originalSpawn=cp.spawn;
  const isAdb=file=>resolve(String(file))===join(context.sdk,'platform-tools/adb');
  cp.spawnSync=(file,args,options)=>isAdb(file)?guardedAdb(context,args,options,(a,o)=>originalSync(file,a,o),{owner,record}):originalSync(file,args,options);
  cp.spawn=(file,args,options)=>{
    if(!isAdb(file))return originalSpawn(file,args,options);
    const row={atUtc:new Date().toISOString(),args,async:true,executed:false};
    try{
      requireAdbArgs(args);row.before=owner(context);
      const child=originalSpawn(file,args,options);row.executed=true;row.childPid=child.pid;row.after=owner(context);record(row);
      child.once('close',(code,signal)=>record({atUtc:new Date().toISOString(),asyncClose:true,args,childPid:child.pid,exitCode:code,signal}));
      return child;
    }catch(error){row.guardError=error.message;record(row);throw error;}
  };
  return ()=>{cp.spawnSync=originalSync;cp.spawn=originalSpawn;};
}
export async function cleanupOwned(context,{logcat,logcatIdentity,env,run,owner=readOwner,read=readFileSync,procRoot='/proc',record=row=>appendFileSync(context.audit,JSON.stringify(row)+'\n'),onStoppingLogcat=()=>{},clock=()=>performance.now(),wait=ms=>new Promise(done=>setTimeout(done,ms))}={}){
  const deadline=clock()+15000;
  const proc=(pid,name)=>read(join(procRoot,String(pid),name),'utf8');
  try{
    owner(context);
    if(logcatIdentity&&logcat?.exitCode===null&&logcat?.signalCode===null){
      const current=parseProcStat(proc(logcatIdentity.pid,'stat')),command=proc(logcatIdentity.pid,'cmdline').split('\0').filter(Boolean);
      assert.equal(current.pid,logcatIdentity.pid);assert.equal(current.startTicks,logcatIdentity.startTicks,'Refuse reused logcat PID');assert.deepEqual(command,logcatIdentity.command,'Refuse foreign logcat command');
      record({action:'stop-owned-logcat',child:current,command});onStoppingLogcat();assert.equal(logcat.kill('SIGTERM'),true,'Owned logcat signal failed');
      while(logcat.exitCode===null&&logcat.signalCode===null&&clock()<deadline)await wait(50);
      assert.ok(logcat.exitCode!==null||logcat.signalCode!==null,'Owned logcat did not close');
    }else if(logcatIdentity)record({action:'logcat-already-exited',child:logcatIdentity});
    const before=owner(context),args=['-s','emulator-5582','emu','kill'];
    assert.ok(clock()<deadline,'Original cleanup bound exhausted');
    const timeout=Math.floor(deadline-clock());assert.ok(timeout>0);
    let stopped;try{stopped=run(join(context.sdk,'platform-tools/adb'),args,{env,encoding:'utf8',timeout,windowsHide:true});}
    catch(error){record({action:'stop-owned-emulator',args,before,error:error.message});throw error;}
    record({action:'stop-owned-emulator',args,before,exitCode:stopped.status,error:stopped.error?.message,signal:stopped.signal,stdout:stopped.stdout,stderr:stopped.stderr});
    assert.equal(stopped.status,0,'Owned emulator stop failed');assert.ok(!stopped.error&&!stopped.signal);
    let exited=false,reusedAfterExit=false;
    while(clock()<deadline){
      try{const p=parseProcStat(proc(context.pid,'stat'));if(p.startTicks!==context.startTicks){exited=true;reusedAfterExit=true;break;}}
      catch(error){if(error.code==='ENOENT'){exited=true;break;}throw error;}
      await wait(100);
    }
    assert.ok(exited,'Owned emulator remained live; no next arm');
    const receipt={complete:true,owner:context,reusedAfterExit,foreignProcessesSignalled:false};record({action:'cleanup-complete',...receipt});return receipt;
  }catch(error){record({action:'cleanup-failed',error:error.message});throw error;}
}
