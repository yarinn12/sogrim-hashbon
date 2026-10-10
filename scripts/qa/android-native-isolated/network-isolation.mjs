import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function networkObservation(adbPath,device,args,spawn=spawnSync,timeout=10000){
  const run=spawn(adbPath,['-s',device,...args],{encoding:'utf8',timeout,killSignal:'SIGKILL',windowsHide:true,maxBuffer:1024*1024});
  if(run.error)throw new Error(`Bounded network ADB observation failed: ${run.error.message}`);
  return {ok:run.status===0,stdout:(run.stdout||'').trim(),stderr:(run.stderr||'').trim(),exitCode:run.status};
}

export function hasNoDefaultNetwork(dump){
  const active=[...String(dump).matchAll(/^\s*Active default network:\s*([^\r\n]+)\s*$/gm)].map(match=>match[1].trim());
  const defaults=[...String(dump).matchAll(/^\s*mDefaultNetwork\s*=\s*([^\r\n]+)\s*$/gm)].map(match=>match[1].trim());
  return active.length===1&&active[0]==='none'&&defaults.every(value=>value==='null');
}

export async function waitForNetworkIsolation({readConnectivity,readAirplaneMode,isLauncherAlive,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=30000,onAttempt=()=>{}}){
  const deadline=now()+timeoutMs;
  while(now()<deadline){
    if(!isLauncherAlive())throw new Error('Owned emulator launcher exited before network isolation completed');
    const network=readConnectivity(Math.min(10000,deadline-now()));
    if(now()>=deadline)break;
    const airplane=readAirplaneMode(Math.min(10000,deadline-now()));
    onAttempt({network,airplane});
    if(now()>=deadline)break;
    if(network.ok&&airplane.ok&&airplane.stdout==='1'&&hasNoDefaultNetwork(network.stdout))return {isolated:true,connectivity:network.stdout,airplaneMode:airplane.stdout};
    await delay(Math.min(500,Math.max(0,deadline-now())));
  }
  throw new Error(`Owned emulator network did not become isolated within ${timeoutMs}ms`);
}

export async function isolateOwnedEmulator({observe,expectedName,isLauncherAlive,...pollOptions}){
  const name=observe(['emu','avd','name']);
  if(!name.ok||name.stdout.split(/\r?\n/)[0].trim()!==expectedName)throw new Error('Refuse network changes on a foreign or unreadable AVD');
  for(const args of [['shell','cmd','connectivity','airplane-mode','enable'],['shell','svc','wifi','disable'],['shell','svc','data','disable']]){
    const command=observe(args);
    if(!command.ok)throw new Error(`Network disable command failed without retry: ${args.join(' ')} exit=${command.exitCode} ${command.stderr}`);
  }
  return waitForNetworkIsolation({...pollOptions,isLauncherAlive,readConnectivity:timeout=>observe(['shell','dumpsys','connectivity'],timeout),readAirplaneMode:timeout=>observe(['shell','settings','get','global','airplane_mode_on'],timeout)});
}

async function main(){
  const device=process.env.ANDROID_QA_DEVICE,avd=process.env.ANDROID_QA_AVD,adbPath=process.env.ADB_PATH,pid=Number(process.env.ANDROID_QA_EMULATOR_PID),out=resolve('artifacts/android-native-isolated');
  if(!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!adbPath||!Number.isSafeInteger(pid)||pid<=1)throw new Error('Require explicit owned CI emulator serial/AVD/PID and ADB_PATH');
  const report={source:process.env.ANDROID_QA_SOURCE,device,avd,pid,isolated:false,attempts:[],startedAtUtc:new Date().toISOString()};
  try{Object.assign(report,await isolateOwnedEmulator({expectedName:avd,observe:(args,timeout)=>networkObservation(adbPath,device,args,spawnSync,timeout),isLauncherAlive:()=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}},onAttempt:attempt=>{report.attempts.push({...attempt,atUtc:new Date().toISOString()});report.connectivity=attempt.network.stdout;}}));}
  catch(error){report.error=error.stack;console.error(error.message);process.exitCode=1;}
  finally{report.completedAtUtc=new Date().toISOString();mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'network-isolation.json'),JSON.stringify(report,null,2));if(report.connectivity)writeFileSync(resolve(out,'connectivity.txt'),report.connectivity);console.log(JSON.stringify({isolated:report.isolated,avd,attempts:report.attempts.length,error:report.error}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
