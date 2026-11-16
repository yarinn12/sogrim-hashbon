import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function assertEmulatorHealthy(logcat){
  if(typeof logcat!=='string'||!/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+[VDIWEF]\s+\S/m.test(logcat))throw new Error('Require actual nonempty Android logcat health evidence');
  const rowPattern=/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+([VDIWEF])\s+([^\s:]+)\s*:\s*(.*)$/;
  const coreName=/^(?:\/system\/bin\/)?(?:surfaceflinger|system_server|zygote(?:64)?)$/;
  const coreCrashLines=logcat.split(/\r?\n/).filter(line=>{
    const row=rowPattern.exec(line);if(!row)return false;
    const [,severity,tag,message]=row;
    if((severity==='E'||severity==='F')&&tag==='AndroidRuntime'&&/^(?:\*\*\*\s*)?FATAL EXCEPTION IN SYSTEM PROCESS:\s*\S/.test(message))return true;
    if(severity!=='F')return false;
    if(tag==='mapper.ranchu'&&message.startsWith('Assertion failed:'))return true;
    const signal=tag==='libc'?/^Fatal signal.*\bpid \d+ \(([^)]+)\)/.exec(message):null;
    const dump=tag==='DEBUG'?/^Cmdline:\s*(.+)$/.exec(message):null;
    return Boolean((signal&&coreName.test(signal[1].trim()))||(dump&&coreName.test(dump[1].trim())));
  });
  if(coreCrashLines.length){const error=new Error('Owned emulator had a core graphics/system crash; Native acceptance cannot continue');error.health={healthy:false,coreCrashLines:coreCrashLines.slice(-20)};throw error;}
  return {healthy:true,coreCrashLines:[]};
}

export function healthAdbObservation(adbPath,device,args,run=spawnSync,timeout=20000){
  const result=run(adbPath,['-s',device,...args],{encoding:'utf8',timeout,killSignal:'SIGKILL',windowsHide:true,maxBuffer:20*1024*1024});
  if(result.error||result.status!==0)throw new Error(`Emulator health SDK command failed without retry: ${args.join(' ')} ${result.error?.message||result.stderr||result.status}`);
  return result.stdout||'';
}

export function readOwnedEmulatorLog({device,avd,adbPath,run=spawnSync}){
  if(!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!adbPath)throw new Error('Require explicit owned CI emulator serial/AVD and ADB_PATH');
  const name=healthAdbObservation(adbPath,device,['emu','avd','name'],run,10000).split(/\r?\n/)[0].trim();
  if(name!==avd)throw new Error('Refuse health observation of a foreign or unreadable AVD');
  return healthAdbObservation(adbPath,device,['logcat','-d'],run);
}

function main(){
  const phase=process.env.ANDROID_QA_HEALTH_PHASE||'before',out=resolve('artifacts/android-native-isolated');
  if(!/^(before|after)$/.test(phase))throw new Error('Require known before/after Native health phase');
  const report={source:process.env.ANDROID_QA_SOURCE,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,phase,healthy:false,startedAtUtc:new Date().toISOString()};
  try{
    const logcat=readOwnedEmulatorLog({device:report.device,avd:report.avd,adbPath:process.env.ADB_PATH});
    mkdirSync(out,{recursive:true});writeFileSync(resolve(out,`emulator-health-${phase}.log`),logcat);
    Object.assign(report,assertEmulatorHealthy(logcat));
  }catch(error){if(error.health)Object.assign(report,error.health);report.error=error.stack;console.error(error.message);process.exitCode=1;}
  finally{report.completedAtUtc=new Date().toISOString();mkdirSync(out,{recursive:true});writeFileSync(resolve(out,`emulator-health-${phase}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
