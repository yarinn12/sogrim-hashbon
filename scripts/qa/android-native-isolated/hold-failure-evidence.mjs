import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {assertHostOwner,parseProcStat} from './trace-diagnostics.mjs';
import {actualDefaultDisplayFocus} from './orientation.mjs';

const target='com.sogrimhashbon.app.debug';
function requireOwner(options){
  if(!/^emulator-\d+$/.test(options.device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(options.avd||'')||!/^[a-f0-9]{40}$/.test(options.source||'')||!Number.isSafeInteger(options.emulatorPid)||options.emulatorPid<=1||!/^\d+$/.test(options.expectedStartTicks||''))throw new Error('Require explicit owned source/AVD/serial/PID/startTicks');
}

// Kernel stacks only: no debugger attach, ptrace, signals or process mutation.
// The caller runs this in a bounded child because /proc availability varies.
export function readOwnedHostKernelStacks(options,{read=readFileSync,list=readdirSync,procRoot='/proc',platform=process.platform}={}){
  requireOwner(options);
  if(platform!=='linux')return {available:false,kind:'kernel-only',unavailable:'Linux /proc stacks unavailable on this host'};
  const check=()=>assertHostOwner(options,{read,procRoot,expectedStartTicks:options.expectedStartTicks});
  const owner=check(),tasks=join(procRoot,String(owner.pid),'task'),candidates=[];
  for(const id of list(tasks).filter(id=>/^\d+$/.test(id)).slice(0,256)){
    check();
    try{const stat=parseProcStat(read(join(tasks,id,'stat'),'utf8'));if(stat.pid===owner.pid||stat.name==='RenderThread')candidates.push(stat);}catch{}
  }
  candidates.sort((a,b)=>(b.pid===owner.pid)-(a.pid===owner.pid)||(b.state==='R')-(a.state==='R')||Number(BigInt(b.userTicks)+BigInt(b.systemTicks)-BigInt(a.userTicks)-BigInt(a.systemTicks)));
  const stacks=[];
  for(const thread of candidates.slice(0,8)){
    check();const entry={tid:thread.pid,startTicks:thread.startTicks,name:thread.name};
    try{
      const path=join(tasks,String(thread.pid));
      if(parseProcStat(read(join(path,'stat'),'utf8')).startTicks!==thread.startTicks)throw new Error('Host thread was reused');
      entry.stack=read(join(path,'stack'),'utf8');
      if(parseProcStat(read(join(path,'stat'),'utf8')).startTicks!==thread.startTicks)throw new Error('Host thread changed during stack read');
    }catch(error){delete entry.stack;entry.unavailable=error.message;}
    check();stacks.push(entry);
  }
  check();return {available:stacks.some(row=>Boolean(row.stack?.trim())),kind:'kernel-only',owner,stacks,threadLimit:8,taskScanLimit:256};
}

export function captureHoldFailure(options,{run=spawnSync,read=readFileSync,write=writeFileSync,mkdir=mkdirSync,procRoot='/proc',clock=()=>Date.now()}={}){
  const started=clock(),report={diagnosticOnly:true,source:options.source,scale:options.scale,orientation:options.orientation,phase:options.phase,errorAtUtc:options.errorAtUtc,originalError:options.error?.stack||String(options.error),startedAtUtc:new Date(started).toISOString(),commands:[],unavailable:[]};
  const out=resolve(options.output);
  const save=(name,data)=>write(join(out,name),data,{flag:'wx'});
  const remaining=()=>{const ms=8000-(clock()-started);if(ms<=0)throw new Error('Post-failure diagnostic budget exhausted');return Math.min(1500,ms);};
  let owned;
  const check=()=>assertHostOwner(owned,{read,procRoot,expectedStartTicks:owned.expectedStartTicks});
  function observe(name,args,binary=false){
    check();const row={name,args,atUtc:new Date(clock()).toISOString()};report.commands.push(row);
    const result=run(options.adbPath,['-s',options.device,...args],{encoding:binary?null:'utf8',timeout:remaining(),windowsHide:true,killSignal:'SIGKILL',maxBuffer:12*1024*1024});
    row.exitCode=result.status;row.error=result.error?.message;
    save(name+(binary?'.png':'.txt'),result.stdout||(binary?Buffer.alloc(0):''));save(name+'.stderr.txt',result.stderr||'');
    check();if(result.error||result.status!==0)throw new Error(`Failure evidence command unavailable: ${name}`);
    return result.stdout;
  }
  function attempt(name,fn){try{remaining();report[name]=fn();}catch(error){report.unavailable.push({name,error:error.message});}}
  function appIdentity(name){
    const raw=observe(name+'-pid',['shell','pidof',target]).trim();
    if(!/^\d+$/.test(raw)||Number(raw)<=1)throw new Error('App PID unavailable or ambiguous');
    const stat=parseProcStat(observe(name+'-stat',['shell','cat',`/proc/${raw}/stat`]));
    if(stat.pid!==Number(raw))throw new Error('App stat PID changed');
    return {pid:stat.pid,startTicks:stat.startTicks,atUtc:new Date(clock()).toISOString()};
  }
  try{
    mkdir(out,{recursive:true});
    const trace=JSON.parse(read(options.traceStartFile,'utf8'));
    const emulatorPid=options.emulatorPid??Number(read(options.emulatorPidFile,'utf8').trim());
    owned={...options,emulatorPid,expectedStartTicks:trace.hostOwner?.startTicks};requireOwner(owned);
    if(!options.adbPath||!trace.captureStarted||['source','device','avd','emulatorPid'].some(key=>trace[key]!==owned[key])||trace.hostOwner.pid!==emulatorPid)throw new Error('Failure evidence trace ownership does not match the failed job');
    report.hostOwner=check();
    if(observe('owned-avd',['emu','avd','name']).split(/\r?\n/)[0].trim()!==options.avd)throw new Error('Failure evidence AVD identity changed');
    attempt('appBefore',()=>appIdentity('app-before'));
    attempt('screenshot',()=>{
      const bytes=observe('failure-screen',['exec-out','screencap','-p'],true);
      if(!Buffer.isBuffer(bytes)||bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(-8,-4).toString()!=='IEND')throw new Error('Failure screenshot is not a complete PNG');
      return {path:join(out,'failure-screen.png'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    });
    attempt('focus',()=>actualDefaultDisplayFocus(observe('failure-display',['shell','dumpsys','window','displays'])));
    attempt('appAfter',()=>appIdentity('app-after'));
    report.appIdentityStable=Boolean(report.appBefore&&report.appAfter&&report.appBefore.pid===report.appAfter.pid&&report.appBefore.startTicks===report.appAfter.startTicks);
    attempt('hostKernelStacks',()=>{
      check();
      const result=run(process.execPath,[fileURLToPath(import.meta.url),'--host-kernel-stacks'],{input:JSON.stringify({source:owned.source,device:owned.device,avd:owned.avd,emulatorPid:owned.emulatorPid,expectedStartTicks:owned.expectedStartTicks}),encoding:'utf8',timeout:remaining(),windowsHide:true,killSignal:'SIGKILL',maxBuffer:256*1024});
      save('host-kernel-stacks.txt',result.stdout||'');save('host-kernel-stacks.stderr.txt',result.stderr||'');check();
      if(result.error||result.status!==0)throw new Error('Bounded host kernel stacks unavailable: '+(result.error?.message||result.status));
      return JSON.parse(result.stdout);
    });
  }catch(error){report.unavailable.push({name:'ownership-or-storage',error:error.message});}
  report.completedAtUtc=new Date(clock()).toISOString();report.elapsedMs=clock()-started;
  try{save('failure-evidence.json',JSON.stringify(report,null,2));}catch(error){report.unavailable.push({name:'receipt',error:error.message});}
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href&&process.argv[2]==='--host-kernel-stacks'){
  try{console.log(JSON.stringify(readOwnedHostKernelStacks(JSON.parse(readFileSync(0,'utf8')))));}
  catch(error){console.log(JSON.stringify({available:false,kind:'kernel-only',unavailable:error.message}));}
}
