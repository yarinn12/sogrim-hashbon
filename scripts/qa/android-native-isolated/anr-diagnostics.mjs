import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const target='com.sogrimhashbon.app.debug';
const protocol=/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+[VDIWEF]\s+\S/m;
export function assertNoTargetAppAnr(logcat){
  if(typeof logcat!=='string'||!protocol.test(logcat))throw new Error('Require nonempty actual Android ANR history');
  const allAnrLines=[],targetAppAnrLines=[];
  for(const line of logcat.split(/\r?\n/)){
    const row=/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+[VDIWEF]\s+([^\s:]+)\s*:\s*(.*)$/.exec(line);if(!row)continue;
    const [,tag,message]=row;let isAnr=false,owned=false;
    if(tag==='ActivityManager'&&message.startsWith('ANR in ')){isAnr=true;owned=new RegExp('^ANR in '+target.replaceAll('.','\\.')+'(?=[:\\s(]|$)').test(message);}
    if(tag==='WindowManager'&&message.startsWith('ANR in Window{')){isAnr=true;owned=new RegExp('^ANR in Window\\{[^}]*\\s'+target.replaceAll('.','\\.')+'/').test(message);}
    if(tag==='am_anr'){isAnr=true;const pkg=/^\[[^,]*,[^,]*,([^,]*),/.exec(message)?.[1]?.trim();owned=pkg===target;}
    if(isAnr){allAnrLines.push(line);if(owned)targetAppAnrLines.push(line);}
  }
  const evidence={target,allAnrLines,targetAppAnrLines};
  if(targetAppAnrLines.length){const error=new Error('Target Android app had an ANR during this run; later recovery cannot accept it');error.anrEvidence=evidence;throw error;}
  return evidence;
}

export function collectOwnedAnrDiagnostics({adbPath,device,avd,source,output,jobStatus='success',run=spawnSync}){
  if(!adbPath||!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!/^[a-f0-9]{40}$/.test(source||'')||!output)throw new Error('Require explicit owned CI emulator and exact source for ANR diagnostics');
  const out=resolve(output),report={source,device,avd,target,jobStatus,startedAtUtc:new Date().toISOString(),ownershipVerified:false,diagnosticsComplete:false,continuousLogCaptured:false,anrHistoryReady:false,commands:[]};mkdirSync(out,{recursive:true});
  function observe(name,args,timeout=20000){
    const row={name,args,startedAtUtc:new Date().toISOString()};let result;
    try{result=run(adbPath,['-s',device,...args],{encoding:'utf8',timeout,killSignal:'SIGKILL',windowsHide:true,maxBuffer:32*1024*1024});}catch(error){result={status:null,error};}
    row.exitCode=result.status;row.error=result.error?.message;row.completedAtUtc=new Date().toISOString();
    const stdout=result.stdout||'',stderr=result.stderr||'';writeFileSync(resolve(out,name+'.txt'),stdout+(stderr?'\nSTDERR:\n'+stderr:''));
    // Historical log/trace messages are payload, not failures of this command.
    const firstLine=stdout.trimStart().split(/\r?\n/,1)[0];
    row.ok=!result.error&&result.status===0&&!/^(?:Permission Denial|Unknown command|Can't find service)(?=[:\s]|$)/i.test(firstLine)&&!/Permission Denial|Unknown command|Can't find service/i.test(stderr);
    if(args[0]==='logcat'){row.logcatProtocol=protocol.test(stdout);row.ok&&=row.logcatProtocol;}
    report.commands.push(row);return {row,stdout};
  }
  try{
    const owner=observe('owned-avd',['emu','avd','name'],10000);
    if(!owner.row.ok||owner.stdout.split(/\r?\n/)[0].trim()!==avd)throw new Error('Refuse ANR diagnostics for a foreign or unreadable AVD');
    report.ownershipVerified=true;
    const last=observe('last-anr',['shell','dumpsys','activity','lastanr']);
    observe('dropbox-data-app-anr',['shell','dumpsys','dropbox','--print','data_app_anr']);
    observe('dropbox-system-app-anr',['shell','dumpsys','dropbox','--print','system_app_anr']);
    const continuous=resolve(out,'../logcat-live.log');let historicalTargetAnr=false;
    if(existsSync(continuous)){try{assertNoTargetAppAnr(readFileSync(continuous,'utf8'));}catch(error){historicalTargetAnr=Boolean(error.anrEvidence?.targetAppAnrLines.length);}}
    const lastReason=/^\s*Reason:\s*([^\r\n]*)/m.exec(last.stdout)?.[1]||'';
    const lastTargetsApp=new RegExp(target.replaceAll('.','\\.')+'(?=[:/\\s(]|$)').test(lastReason);
    const bugreportRequested=jobStatus!=='success'||historicalTargetAnr||lastTargetsApp;report.bugreportRequested=bugreportRequested;
    function captureBugreport(){
      report.bugreportRequested=true;
      const zip=resolve(out,'bugreport.zip'),capture=observe('bugreport',['bugreport',zip],180000);
      if(capture.row.ok&&existsSync(zip)&&statSync(zip).size>0){const bytes=readFileSync(zip);report.bugreport={path:zip,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
      else{report.bugreportError='Requested bugreport ZIP was not successfully retained';capture.row.ok=false;}
    }
    if(bugreportRequested)captureBugreport();
    const final=observe('logcat-final',['logcat','-b','all','-d','-v','threadtime']);
    if(existsSync(continuous)){const bytes=readFileSync(continuous),snapshot=resolve(out,'logcat-history-snapshot.log');writeFileSync(snapshot,bytes);report.continuousLogCaptured=protocol.test(bytes.toString('utf8'));report.continuousLog={path:continuous,snapshot,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
      try{if(!report.continuousLogCaptured)throw new Error('Continuous Native-run logcat history is empty or malformed');Object.assign(report,assertNoTargetAppAnr(bytes.toString('utf8')+'\n'+final.stdout));report.anrHistoryReady=true;}catch(error){if(error.anrEvidence)Object.assign(report,error.anrEvidence);report.historyError=error.message;}
    }else report.historyError='Continuous Native-run logcat history is absent';
    if(report.targetAppAnrLines?.length&&!report.bugreportRequested){captureBugreport();observe('logcat-post-bugreport',['logcat','-b','all','-d','-v','threadtime']);}
    report.diagnosticsComplete=report.commands.every(command=>command.ok)&&report.continuousLogCaptured;
  }catch(error){report.error=error.stack;}
  report.completedAtUtc=new Date().toISOString();writeFileSync(resolve(out,'anr-diagnostics.json'),JSON.stringify(report,null,2));return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=collectOwnedAnrDiagnostics({adbPath:process.env.ADB_PATH,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,source:process.env.ANDROID_QA_SOURCE,jobStatus:process.env.ANDROID_QA_JOB_STATUS||'failure',output:'artifacts/android-native-isolated/anr-diagnostics'});
  console.log(JSON.stringify({source:report.source,ownershipVerified:report.ownershipVerified,diagnosticsComplete:report.diagnosticsComplete,anrHistoryReady:report.anrHistoryReady,targetAppAnrLines:report.targetAppAnrLines?.length,bugreportRequested:report.bugreportRequested,error:report.error,historyError:report.historyError}));
  if(!report.diagnosticsComplete||!report.anrHistoryReady)process.exitCode=1;
}
