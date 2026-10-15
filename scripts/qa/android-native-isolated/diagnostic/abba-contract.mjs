import {readFileSync} from 'node:fs';
import {availableParallelism,cpus} from 'node:os';
import {APP_SOURCE,SIGNATURE_MEMBER_ALLOWLIST} from './apk-members.mjs';

export const TRIAL_ORDER=Object.freeze(['A','B','B','A']);
export const TRIAL_BUDGET_MS=90_000;
export const WINDOW_BUDGET_MS=720_000;

export function requireFrozenEmulatorControls(command){
  const value=flag=>command[command.indexOf(flag)+1];
  if(!Array.isArray(command)||value('-gpu')!=='swiftshader'||
    value('-feature')!=='GLDirectMem,HasSharedSlotsHostMemoryAllocator'||
    value('-memory')!=='4096'||value('-cores')!=='2'||
    !command.includes('-no-snapshot')||!command.includes('-no-window'))
    throw new Error('Require original isolated Native emulator renderer and resource controls');
  return command;
}

export function webviewProviderIdentity(raw){
  const text=String(raw);
  const tuple=/Current WebView package[^\r\n]*?:\s*\(([^,()]+),\s*([^)]+)\)/i.exec(text);
  const prose=/Current WebView package is\s+([^\s()]+)\s+\(version\s+([^)]+)\)/i.exec(text);
  const found=tuple||prose;
  if(!found||!/^[a-zA-Z0-9_.]+$/.test(found[1].trim())||!found[2].trim())throw new Error('Actual WebView provider package/version unavailable');
  return{name:found[1].trim(),version:found[2].trim()};
}

export function foreground15sVerdict(observations,windowStarted,{requireNativeAndroid=true}={}){
  if(!windowStarted)return null;
  if(observations.some(row=>row.elapsedSinceForegroundWaitMs!==null&&row.elapsedSinceForegroundWaitMs<=15000&&row.ownedActivityFocus===true&&(!requireNativeAndroid||row.nativeAndroid===true)))return true;
  return observations.some(row=>row.elapsedSinceForegroundWaitMs>=15000)?false:null;
}

export function requireDiagnosticManifest(manifest){
  if(manifest?.schemaVersion!==1||manifest.appSource!==APP_SOURCE||manifest.fixtureOnly!==true||manifest.nativeAcceptance!==false||
    manifest.requiredSignerVerification!==true||!Array.isArray(manifest.changedMembers)||!manifest.changedMembers.includes('assets/public/index.html')||
    manifest.changedMembers.some(name=>name!=='assets/public/index.html'&&!SIGNATURE_MEMBER_ALLOWLIST.includes(name))||
    !['A','B'].every(name=>typeof manifest.variants?.[name]?.path==='string'&&/^[a-f0-9]{64}$/.test(manifest.variants[name].apkSha256)))
    throw new Error('Require exact 59b fixture-only APK member audit');
  return manifest;
}

// Every planned trial receives a durable row. An ANR or ordinary trial failure
// never triggers retry or hides the remaining ABBA trials. Ownership loss and
// the whole-window cap stop unsafe work while retaining unattempted rows.
export async function runFixedTrials({runTrial,append,now=Date.now}){
  const start=now(),rows=[];let safetyStop=null;
  for(let index=0;index<TRIAL_ORDER.length;index++){
    const variant=TRIAL_ORDER[index],trial=index+1,atUtc=new Date(now()).toISOString();let row;
    if(safetyStop||now()-start>=WINDOW_BUDGET_MS)row={trial,variant,attempted:false,status:'not-attempted',reason:safetyStop||'window-budget',atUtc};
    else{
      const began=now();
      try{
        const evidence=await runTrial({trial,variant,budgetMs:Math.min(TRIAL_BUDGET_MS,WINDOW_BUDGET_MS-(began-start))});
        const elapsedMs=now()-began;
        row={trial,variant,attempted:true,status:elapsedMs>TRIAL_BUDGET_MS?'budget-exceeded':'recorded',atUtc,elapsedMs,evidence};
      }catch(error){
        row={trial,variant,attempted:true,status:'error',atUtc,elapsedMs:now()-began,error:String(error?.stack||error),...(error?.evidence?{evidence:error.evidence}:{})};
        if(error?.safetyStop)safetyStop=error.message||'safety-stop';
      }
    }
    rows.push(row);append(row);
  }
  return{schemaVersion:1,appSource:APP_SOURCE,order:[...TRIAL_ORDER],trialBudgetMs:TRIAL_BUDGET_MS,windowBudgetMs:WINDOW_BUDGET_MS,fixtureOnly:true,nativeAcceptance:false,rows};
}

const read=(path,reader)=>{try{return{value:reader(path,'utf8').trim()};}catch(error){return{unavailable:error.code||error.message};}};
export function hostCapacitySnapshot({reader=readFileSync,parallelism=availableParallelism,hostCpus=cpus}={}){
  return{atUtc:new Date().toISOString(),allowedCpus:parallelism(),logicalHostCpus:hostCpus().length,
    cgroupCpuMax:read('/sys/fs/cgroup/cpu.max',reader),cgroupCpuStat:read('/sys/fs/cgroup/cpu.stat',reader),
    cgroupCpuset:read('/sys/fs/cgroup/cpuset.cpus.effective',reader),procStat:read('/proc/stat',reader),
    procLoadavg:read('/proc/loadavg',reader),procPressureCpu:read('/proc/pressure/cpu',reader)};
}
