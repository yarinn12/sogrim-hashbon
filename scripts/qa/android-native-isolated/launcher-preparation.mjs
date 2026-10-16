import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertHostOwner} from './trace-diagnostics.mjs';
import {assertNoTargetAppAnr} from './anr-diagnostics.mjs';
import {actualDefaultDisplayFocus} from './orientation.mjs';

const launcher='com.google.android.apps.nexuslauncher',target='com.sogrimhashbon.app.debug';

export function inspectPreparationWindow(raw){
  if(typeof raw!=='string'||!raw.trim())throw new Error('Missing actual preparation window dump');
  const focus=actualDefaultDisplayFocus(raw).slice('mCurrentFocus='.length).trim();
  if(focus==='null')return {focus,launcherAnr:false};
  const window=/^Window\{[a-f0-9]+ u0 ([^}\r\n]+)\}$/.exec(focus);
  if(!window)throw new Error('Unclear preparation focus window or user');
  const launcherAnr=window[1]===`Application Not Responding: ${launcher}`;
  if(/\bANR\b|Not Responding/i.test(window[1])&&!launcherAnr)throw new Error('Refuse foreign, target or unclear ANR focus');
  return {focus,launcherAnr};
}

function assertNoTargetLastAnr(raw){
  const name=target.replaceAll('.','\\.'),boundary='(?=[:/\\s(}]|$)';
  const process='(?:ProcessRecord\\{[^}\\r\\n]*?\\s\\d+:)?'+name+boundary;
  const identity=new RegExp('^\\s*(?:Process:\\s*|ANR in\\s+|Application Not Responding:\\s*)'+process,'m');
  const reason=new RegExp('^\\s*Reason:.*'+name+boundary,'m');
  if(identity.test(raw)||reason.test(raw))throw new Error('Target app ANR remains in lastanr history');
}

export function prepareOwnedLauncher(options,{run=spawnSync,read=readFileSync,procRoot='/proc'}={}){
  const {adbPath,device,avd,source,emulatorPid,output}=options;
  if(!adbPath||!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!/^[a-f0-9]{40}$/.test(source||'')||!Number.isSafeInteger(emulatorPid)||emulatorPid<=1||!output)throw new Error('Require explicit SDK, serial, AVD, source, host PID and output');
  const out=resolve(output),report={source,device,avd,emulatorPid,launcher,target,ready:false,forceStopAttempted:false,forceStopSucceeded:false,startedAtUtc:new Date().toISOString(),commands:[],errors:[]};
  mkdirSync(out,{recursive:true});
  const receipt=resolve(out,'launcher-preparation.json');
  // Refuse a second invocation against the same preparation receipt.
  writeFileSync(receipt,JSON.stringify(report,null,2),{flag:'wx'});
  let owner;
  const checkOwner=()=>assertHostOwner(options,{read,procRoot,expectedStartTicks:owner?.startTicks});
  function observe(name,args){
    checkOwner();
    const row={name,args,startedAtUtc:new Date().toISOString()};report.commands.push(row);
    let result;
    try{result=run(adbPath,['-s',device,...args],{encoding:'utf8',timeout:20000,killSignal:'SIGKILL',windowsHide:true,maxBuffer:32*1024*1024});}
    catch(error){result={status:null,error};}
    const stdout=result.stdout||'',stderr=result.stderr||'';
    writeFileSync(resolve(out,name+'.txt'),stdout);writeFileSync(resolve(out,name+'.stderr.txt'),stderr);
    Object.assign(row,{exitCode:result.status,error:result.error?.message,completedAtUtc:new Date().toISOString()});
    const commandError=/^(?:Error:|Failure\b|Permission Denial\b|Unknown command\b|Can't find service\b)/i;
    row.ok=!result.error&&result.status===0&&!commandError.test(stdout.trimStart().split(/\r?\n/,1)[0])&&!commandError.test(stderr.trimStart());
    checkOwner();
    if(!row.ok)throw new Error(`Launcher preparation command failed without retry: ${name}`);
    return stdout;
  }
  function verifyAvd(name){
    if(observe(name,['emu','avd','name']).split(/\r?\n/)[0].trim()!==avd)throw new Error('Refuse foreign or unreadable preparation AVD');
  }
  function snapshot(phase){
    const state={};report[phase]=state;
    state.packages=observe(phase+'-packages',['shell','cmd','package','list','packages','--user','0',target]);
    state.logcat=observe(phase+'-logcat',['logcat','-b','all','-d','-v','threadtime']);
    state.lastAnr=observe(phase+'-last-anr',['shell','dumpsys','activity','lastanr']);
    state.window=observe(phase+'-window',['shell','dumpsys','window','displays']);
    return state;
  }
  function assertEligible(state){
    const rows=state.packages.split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
    if(rows.some(row=>!/^package:[\w.]+$/.test(row)))throw new Error('Unclear target package installation evidence');
    if(rows.includes('package:'+target))throw new Error('Target app is already installed; preparation cannot continue');
    // Every snapshot is complete, unfiltered logcat. Retain all earlier snapshots
    // as well, so recovery or buffer turnover cannot erase an observed app ANR.
    report.anrEvidence=assertNoTargetAppAnr([report.before,report.preAction,report.after].filter(Boolean).map(s=>s.logcat||'').join('\n'));
    assertNoTargetLastAnr(state.lastAnr);
    state.focus=inspectPreparationWindow(state.window);
    return state.focus;
  }
  try{
    owner=checkOwner();report.hostOwner=owner;
    verifyAvd('before-owned-avd');report.ownershipVerified=true;
    const before=assertEligible(snapshot('before'));
    if(before.launcherAnr){
      // Re-read installation, complete ANR history and focus immediately before
      // the only allowed mutation. Neither package comes from caller input.
      verifyAvd('pre-action-owned-avd');
      if(!assertEligible(snapshot('preAction')).launcherAnr)throw new Error('Launcher ANR focus changed before preparation action');
      verifyAvd('action-owned-avd');
      checkOwner();
      report.forceStopAttempted=true;
      observe('launcher-force-stop',['shell','am','force-stop','--user','0',launcher]);
      report.forceStopSucceeded=true;
    }
    verifyAvd('after-owned-avd');
    if(assertEligible(snapshot('after')).launcherAnr)throw new Error('Launcher ANR remains after preparation');
    report.ready=true;
  }catch(error){report.errors.push(error.stack);if(error.anrEvidence)report.anrEvidence=error.anrEvidence;
    // Retain an after snapshot on failures when ownership is still provable.
    // It is diagnostic only: the original failure can never become success.
    if(report.forceStopAttempted&&!report.after&&owner&&report.ownershipVerified)try{verifyAvd('failure-owned-avd');snapshot('after');assertEligible(report.after);}catch(afterError){report.errors.push(afterError.stack);}
  }finally{
    report.completedAtUtc=new Date().toISOString();
    // Raw dumps live in separate files; the receipt records their exact paths.
    for(const phase of ['before','preAction','after'])if(report[phase])report[phase]={focus:report[phase].focus,files:report.commands.filter(row=>row.name.startsWith(phase+'-')).map(row=>row.name+'.txt')};
    writeFileSync(receipt,JSON.stringify(report,null,2));
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const report=prepareOwnedLauncher({adbPath:process.env.ADB_PATH,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,source:process.env.ANDROID_QA_SOURCE,emulatorPid:Number(process.env.ANDROID_QA_EMULATOR_PID),output:'artifacts/android-native-isolated/launcher-preparation'});
    console.log(JSON.stringify(report));if(!report.ready)process.exitCode=1;
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
