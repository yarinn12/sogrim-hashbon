import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,openSync,closeSync,readdirSync,renameSync,statSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SOURCE,TREE,TOOLS,APK_SHA,CONFIG,OBSERVER_BLOBS,requireInvocation,verifyConfiguration,compareSdkBinaries,inspectOriginalWorkload,summarizeHostProfile,verifyCertificate,runOneProfile,runOriginalStages,readSdkReference,verifyObserverFiles} from './contract.mjs';
import {readOwner,guardedAdb,cleanupOwned} from './owned.mjs';
import {verifySchema,verifyTransport} from './transport.mjs';
import {captureLoadedSdk} from './loaded-sdk.mjs';
import {parseProcStat} from '../android-native-isolated/trace-diagnostics.mjs';
import {readAsgSdk,ASG_PROPERTIES} from '../android-native-isolated/gltransport.mjs';
import {createProfileRoot,inspectTool,runScopePreflight,startProfile,finishProfile} from './profiler.mjs';
import {captureModules} from './modules.mjs';
import {analyzeStoppedProfile} from './offline.mjs';
const here=dirname(fileURLToPath(import.meta.url)),control=resolve(here,'../../..');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function sha(path){const h=createHash('sha256');for await(const c of createReadStream(path))h.update(c);return h.digest('hex');}
function properties(text){const values={};for(const line of text.split(/\r?\n/)){if(!line.trim()||/^\s*[#;]/.test(line))continue;const at=line.indexOf('=');if(at<0)continue;const k=line.slice(0,at).trim();assert.ok(!Object.hasOwn(values,k),'Duplicate config key: '+k);values[k]=line.slice(at+1).trim();}return values;}
function resources(path){
  const report={atUtc:new Date().toISOString(),observations:{},unavailable:[]};
  for(const p of ['/proc/stat','/proc/meminfo','/proc/pressure/cpu','/proc/pressure/memory','/proc/pressure/io','/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/memory.max'])try{report.observations[p]=readFileSync(p,'utf8');}catch(e){report.unavailable.push({path:p,error:e.code});}
  report.processes=[];report.processScope='No foreign process inventory; aggregate host resources only';
  save(path,report);
}
async function manifest(root){const rows=[];async function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),'Refuse redirected diagnostic artifact');if(entry.isDirectory())await walk(path);else rows.push({path:path.slice(root.length+1).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await sha(path)});}}await walk(root);return rows;}

export async function runDiagnostic(env=process.env){
  requireInvocation(env);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
  const controlHead=cp.spawnSync('git',['rev-parse','HEAD'],{cwd:control,encoding:'utf8'});assert.equal(controlHead.status,0);assert.equal(controlHead.stdout.trim(),env.GITHUB_SHA,'Control checkout differs from reviewed event SHA');
  const app=resolve(env.GITHUB_WORKSPACE,'app'),sdk=resolve(env.ANDROID_HOME),native=join(app,'artifacts/android-native-isolated');
  const output=join(app,'artifacts/android-host-profile');
  if(existsSync(output))assert.deepEqual(readdirSync(output).sort(),['tool-install'],'Refuse prior diagnostic output');else mkdirSync(output);
  const top={profileOnly:true,diagnosticOnly:true,nativeAcceptance:false,releaseAcceptance:false,source:SOURCE,tools:TOOLS,tree:TREE,control:env.GITHUB_SHA,originalRun:42274817530,originalArtifact:13534285250,startedAtUtc:new Date().toISOString()};
  const observer=verifyObserverFiles(Object.fromEntries(Object.keys(OBSERVER_BLOBS).map(path=>[path,readFileSync(join(control,path))])));
  save(join(output,'observer-tools.json'),{...observer,control:env.GITHUB_SHA,applicationSource:SOURCE,originalWorkloadTools:TOOLS});
  const commands=[],audit=row=>{commands.push(row);appendFileSync(join(output,'control-commands.jsonl'),JSON.stringify(row)+'\n');};
  const adb=join(sdk,'platform-tools/adb'),profileContext=createProfileRoot({runnerTemp:env.RUNNER_TEMP,runId:env.GITHUB_RUN_ID,sdk}),armRoot=profileContext.options.avdHome;
  let profileTool,profilePreflight;
  try{profileTool=inspectTool(profileContext,join(output,'profiler-preparation'));profilePreflight=await runScopePreflight(profileContext,profileTool,join(output,'scope-preflight'));}
  catch(error){const invalid={...top,diagnosticOutcome:'INVALID_PROFILE_PREFLIGHT',technicalExitCode:1,error:error.stack,workloadExecuted:false,originalSourceGate:'FAILED',nativeAcceptance:false,releaseAcceptance:false};save(join(output,'diagnostic-result.json'),invalid);return invalid;}
  const baselineBinaries=readSdkReference(readFileSync(join(here,'reference-sdk-binaries.json')));
  const stock=Object.fromEntries(['fixture-provenance.json','apk-assets.json','qa-tools-source.txt','transport-original-apk-provenance.json'].map(f=>[f,readFileSync(join(native,f))]));
  const baseEnv={...profileContext.childEnv,ANDROID_QA_SOURCE:SOURCE,ANDROID_QA_DEVICE:'emulator-5582',ADB_PATH:adb,SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',NODE_OPTIONS:''};
  // A fresh server/key is prepared once, with the original unused-port guard.
  // Never kill a pre-existing ADB server or change the global Android homes.
  const result=await runOneProfile(async arm=>{
    mkdirSync(native,{recursive:true});for(const [name,bytes] of Object.entries(stock))writeFileSync(join(native,name),bytes);
    const avd=`sogrim_ci_${env.GITHUB_RUN_ID}_1_profile`,armEnv={...baseEnv,ANDROID_QA_AVD:avd};
    let owner,emulator,logcat,logcatIdentity,selection,verified=false,armError,cleanupComplete=false,stoppingLogcat=false;const stages=[],moduleSnapshots=[];let activeProfile=null,hostProfile=null;
    const snapshotModules=label=>{const snapshot=captureModules(owner,join(native,label),profileContext.childEnv);moduleSnapshots.push(snapshot);return snapshot;};
    const append=row=>appendFileSync(join(native,'owned-command-audit.jsonl'),JSON.stringify(row)+'\n');
    async function run(label,file,args,{input,cwd=app,extraEnv={},guard=false}={}){
      const row={arm:arm.id,label,file,args,startedAtUtc:new Date().toISOString()};
      try{if(guard)row.ownerBefore=readOwner(owner);}catch(error){Object.assign(row,{exitCode:null,error:error.message,executed:false,ownershipLost:true});stages.push(row);audit(row);save(join(native,'stage-exits.json'),stages);return row;}
      const log=join(native,label+'.log'),fd=openSync(log,'wx');let result;
      try{
        result=await new Promise(done=>{
          let child;try{child=cp.spawn(file,args,{cwd,env:{...armEnv,...extraEnv},stdio:[input===undefined?'ignore':'pipe',fd,fd],windowsHide:true});}
          catch(error){done({exitCode:null,error:error.message});return;}
          child.once('error',error=>done({exitCode:null,error:error.message}));child.once('close',(code,signal)=>done({exitCode:code,signal}));
          row.childPid=child.pid;if(input!==undefined)child.stdin.end(input);
        });
      }finally{closeSync(fd);}
      Object.assign(row,result,{completedAtUtc:new Date().toISOString(),log,executed:Number.isSafeInteger(row.childPid)&&row.childPid>1});
      try{if(guard)row.ownerAfter=readOwner(owner);}catch(error){row.error='Ownership lost after command: '+error.message;row.ownershipLost=true;}
      stages.push(row);audit(row);save(join(native,'stage-exits.json'),stages);return row;
    }
    const must=async(...args)=>{const r=await run(...args);assert.equal(r.exitCode,0,'Required command failed: '+r.label);assert.ok(!r.signal&&!r.error);return r;};
    function a(args,options={}){
      return guardedAdb(owner,['-s','emulator-5582',...args],{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:32*1024*1024,...options},(args,opts)=>cp.spawnSync(adb,args,{...opts,env:armEnv}),{record:append});
    }
    function checkedAdb(args,options){const r=a(args,options);assert.equal(r.status,0,'ADB failed: '+args.join(' '));assert.ok(!r.error&&!r.signal);return r.stdout;}
    // Only the reviewed observer tools run from the control checkout. Original
    // app/workload scripts and all2037 application checkout bytes stay unchanged.
    const scriptFor=name=>join(name==='trace-diagnostics'?control:app,'scripts/qa/android-native-isolated',name+'.mjs');
    const node=(name,label=name,args=[],extra={})=>must(label,process.execPath,[scriptFor(name),...args],{...extra,guard:Boolean(owner)});
    function nodeAuditEnv(){return {ANDROID_QA_EMULATOR_PID:String(owner.pid),ANDROID_TRANSPORT_OWNER_FILE:join(native,'diagnostic-owner.json'),NODE_OPTIONS:'--import='+pathToFileURL(join(here,'preload.mjs')).href};}
    try{
      resources(join(native,'resources-before.json'));
      await must('source-recheck','python3',[join(here,'artifact.py'),'verify-source',app]);
      await must('sdk-recheck','python3',[join(here,'artifact.py'),'verify-sdk',sdk]);
      await must('sdk-binaries-before','python3',[join(here,'artifact.py'),'fingerprint-sdk',sdk]);
      const binaryBefore=json(join(native,'sdk-binaries-before.log'));
      save(join(native,'sdk-binary-identity.json'),{before:binaryBefore,comparedToRecordedSdk:compareSdkBinaries(baselineBinaries,binaryBefore),referenceRun:42266716697,historical2d4BinaryComparisonProven:false});
      assert.equal(await sha(join(app,'android/app/build/outputs/apk/debug/app-debug.apk')),APK_SHA);
      const cert=readFileSync(join(app,'original-debug-certificate.txt'),'utf8');verifyCertificate(cert);writeFileSync(join(native,'debug-certificate.txt'),cert);
      assert.equal(readFileSync(join(native,'qa-tools-source.txt'),'utf8').trim(),TOOLS);
      const source=cp.spawnSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'});assert.equal(source.status,0);assert.equal(source.stdout.trim(),SOURCE);
      verifySchema(readFileSync(join(sdk,'emulator/lib/hardware-properties.ini')));
      const avdmanager=resolve(env.ANDROID_QA_AVDMANAGER);assert.ok(avdmanager.startsWith(join(sdk,'cmdline-tools')+'/'),'Foreign avdmanager');
      await must('avd-create',avdmanager,['create','avd','-n',avd,'-k','system-images;android-36.1;google_apis_playstore;x86_64','-d','pixel_6'],{input:'no\n'});
      const configPath=join(armRoot,avd+'.avd/config.ini'),config=properties(readFileSync(configPath,'utf8'));
      Object.assign(config,CONFIG);save(join(native,'configuration-contract.json'),verifyConfiguration(config));
      writeFileSync(configPath,Object.entries(config).map(([k,v])=>k+' = '+v).join('\n')+'\n');writeFileSync(join(native,'avd-config.ini'),readFileSync(configPath));
      await node('renderer-capabilities','renderer-snapshot',['snapshot']);
      save(join(native,'transport-sdk.json'),{source:SOURCE,device:'emulator-5582',avd,requestedTransport:'asg',prepared:true,verified:false,profileOnly:true,sdk:readAsgSdk(sdk)});
      await node('adb-key-preflight');
      assert.ok(statSync('/dev/kvm').isCharacterDevice(),'Missing existing KVM device');
      const emulatorArgs=['-avd',avd,'-port','5582','-no-window','-no-snapshot','-no-audio','-no-boot-anim','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-verbose','-memory','4096','-cores','2'];
      const fd=openSync(join(native,'emulator.log'),'wx');
      try{emulator=cp.spawn(join(sdk,'emulator/emulator'),emulatorArgs,{env:profileContext.childEnv,stdio:['ignore',fd,fd]});emulator.on('error',error=>audit({arm:arm.id,label:'emulator-error',error:error.message}));}finally{closeSync(fd);}
      assert.ok(Number.isSafeInteger(emulator.pid)&&emulator.pid>1,'Emulator did not return an actual PID');
      const actual=parseProcStat(readFileSync('/proc/'+emulator.pid+'/stat','utf8'));
      owner={pid:emulator.pid,startTicks:actual.startTicks,avd,sdk,audit:join(native,'owned-command-audit.jsonl')};
      readOwner(owner);save(join(native,'diagnostic-owner.json'),owner);writeFileSync(join(native,'emulator.pid'),String(owner.pid)+'\n');
      audit({arm:arm.id,label:'emulator-launch',file:join(sdk,'emulator/emulator'),args:emulatorArgs,owner:readOwner(owner)});
      // The boot bounds are the original 240s wait plus 180 one-second probes.
      checkedAdb(['wait-for-device'],{timeout:240000});let booted=false;
      for(let n=0;n<180;n++){const r=a(['shell','getprop','sys.boot_completed']);if(r.status===0&&String(r.stdout).trim()==='1'){booted=true;break;}await delay(1000);}
      assert.ok(booted,'Owned emulator did not boot within original bound');
      assert.equal(checkedAdb(['emu','avd','name']).split(/\r?\n/)[0].trim(),avd,'Foreign AVD');
      const loadedSdk=await captureLoadedSdk(owner,binaryBefore,baselineBinaries,{onSnapshot:snapshot=>{
        writeFileSync(join(native,'loaded-sdk-exe.txt'),snapshot.rawExe+'\n');writeFileSync(join(native,'loaded-sdk-maps.txt'),snapshot.rawMaps);
        save(join(native,'loaded-sdk-snapshot.json'),{ownerBefore:snapshot.ownerBefore,ownerAfter:snapshot.snapshotOwnerAfter,identityValidation:'pending subsequent SDK file checks'});
      }});
      const {rawExe,rawMaps,...loadedReceipt}=loadedSdk;save(join(native,'loaded-sdk-identity.json'),loadedReceipt);
      const extraEnv=nodeAuditEnv();
      await node('network-isolation','network-isolation',[],{extraEnv});
      checkedAdb(['shell','settings','put','secure','show_ime_with_hard_keyboard','1']);
      await node('launcher-preparation','launcher-preparation',[],{extraEnv});
      checkedAdb(['install',join(app,'android/app/build/outputs/apk/debug/app-debug.apk')]);
      writeFileSync(join(native,'guest-meminfo.txt'),checkedAdb(['shell','cat','/proc/meminfo']));
      await node('emulator-health','health-before',[],{extraEnv:{...extraEnv,ANDROID_QA_HEALTH_PHASE:'before'}});
      await node('renderer-capabilities','renderer-verify',['verify'],{extraEnv});
      const guest=Object.fromEntries(ASG_PROPERTIES.map(k=>[k,checkedAdb(['shell','getprop',k]).trim()]));
      selection=verifyTransport(readFileSync(join(native,'emulator.log'),'utf8'),guest,'asg');
      save(join(native,'diagnostic-effective-transport.json'),{...selection,source:SOURCE,avd,diagnosticOnly:true,nativeAcceptance:false,owner:readOwner(owner)});verified=true;
      // Retain the original continuous history from before the first cold launch.
      const logFd=openSync(join(native,'logcat-live.log'),'wx'),logArgs=['-s','emulator-5582','logcat','-b','all','-v','threadtime'];
      try{const before=readOwner(owner);logcat=cp.spawn(adb,logArgs,{env:armEnv,stdio:['ignore',logFd,logFd]});logcat.on('error',error=>audit({arm:arm.id,label:'logcat-error',error:error.message}));
        logcat.once('close',(exitCode,signal)=>{append({action:'logcat-closed',pid:logcat.pid,exitCode,signal,expectedStop:stoppingLogcat});if(!stoppingLogcat)armError||='Continuous logcat ended before finalization';});
        logcatIdentity={...parseProcStat(readFileSync('/proc/'+logcat.pid+'/stat','utf8')),command:[adb,...logArgs]};append({args:logArgs,executed:true,async:true,before,after:readOwner(owner),child:logcatIdentity});
      }finally{closeSync(logFd);}
      writeFileSync(join(native,'logcat-live.pid'),String(logcat.pid)+'\n');
      await node('trace-diagnostics','trace-start',['start'],{extraEnv});
      snapshotModules('modules-before-profile');
      try{activeProfile=await startProfile(profileContext,profileTool,owner,join(native,'host-profile'),{onHandle:handle=>{activeProfile=handle;}});}
      catch(error){activeProfile=error.profileHandle;throw error;}
      // Run every original check once even after a workload failure. The original
      // acceptance script retains its matrix (including hold coldstarts), pages,
      // journey/IME/persistence sequencing and every original deadline.
      await runOriginalStages(name=>{
        if(activeProfile.scopeErrors.length||activeProfile.child.exitCode!==null||activeProfile.child.signalCode!==null)return {label:name,exitCode:null,executed:false,error:'Owned profiler scope ended before original workload finished'};
        snapshotModules('modules-before-'+name);
        return run(name,process.execPath,[scriptFor(name==='health-after'?'emulator-health':name)],{guard:true,extraEnv:name==='health-after'?{...extraEnv,ANDROID_QA_HEALTH_PHASE:'after'}:extraEnv});});
      await must('source-after','python3',[join(here,'artifact.py'),'verify-source',app]);
      await must('sdk-after','python3',[join(here,'artifact.py'),'verify-sdk',sdk]);
    }catch(error){
      armError=error.stack;save(join(native,'arm-error.json'),{error:armError});
    }finally{
      if(owner){
        // Always finalize capture and the full-history ANR gate, even on failure.
        try{
          readOwner(owner);const extraEnv=nodeAuditEnv();
          await run('trace-finish',process.execPath,[scriptFor('trace-diagnostics'),'finish'],{guard:true,extraEnv:{...extraEnv,ANDROID_QA_JOB_STATUS:armError||stages.some(s=>s.exitCode!==0)?'failure':'success'}});
          await run('anr-diagnostics',process.execPath,[join(app,'scripts/qa/android-native-isolated/anr-diagnostics.mjs')],{guard:true,extraEnv:{...extraEnv,ANDROID_QA_JOB_STATUS:armError||stages.some(s=>s.exitCode!==0)?'failure':'success'}});
        }catch(error){armError||=error.stack;save(join(native,'finalize-error.json'),{error:error.stack});}
        if(activeProfile){
        try{snapshotModules('modules-after-workload');}
        catch(error){armError||=error.stack;save(join(native,'module-finalize-error.json'),{error:error.message});}
        try{
          hostProfile=await finishProfile(activeProfile);hostProfile.preflight=profilePreflight;
          save(join(native,'host-profile/profile-result.json'),hostProfile);
          if(!hostProfile.cleanupVerified)throw new Error('Owned profiler cleanup not verified');
          snapshotModules('modules-after-profiler-stop');
        }catch(error){armError||=error.stack;save(join(native,'profile-finalize-error.json'),{error:error.message});}
        }
        try{
          const receipt=await cleanupOwned(owner,{logcat,logcatIdentity,env:armEnv,run:cp.spawnSync,record:append,onStoppingLogcat:()=>{stoppingLogcat=true;}});
          cleanupComplete=true;save(join(native,'owned-cleanup.json'),receipt);
        }catch(error){armError||=error.stack;save(join(native,'cleanup-error.json'),{error:error.stack});emulator?.unref();logcat?.unref();}
      }
      resources(join(native,'resources-after.json'));
      try{
        await must('sdk-binaries-after','python3',[join(here,'artifact.py'),'fingerprint-sdk',sdk]);
        const binaryAfter=json(join(native,'sdk-binaries-after.log'));
        const binaryReceipt=json(join(native,'sdk-binary-identity.json'));
        save(join(native,'sdk-binary-identity.json'),{...binaryReceipt,after:binaryAfter,afterComparedToRecordedSdk:compareSdkBinaries(baselineBinaries,binaryAfter)});
      }catch(error){armError||=error.stack;save(join(native,'sdk-binary-error.json'),{error:error.stack});}
    }
    if(hostProfile){
      try{hostProfile.offlineAnalysis=analyzeStoppedProfile({profile:hostProfile,snapshots:moduleSnapshots,workloadStopped:cleanupComplete,output:join(native,'offline-symbols'),env:profileContext.childEnv});}
      catch(error){hostProfile.offlineAnalysis={ready:false,executed:false,error:error.message};save(join(native,'offline-error.json'),hostProfile.offlineAnalysis);}
      save(join(native,'host-profile/profile-result.json'),hostProfile);
    }
    let result;
    try{
      const diagnostics=json(join(native,'anr-diagnostics/anr-diagnostics.json')),trace=json(join(native,'trace-diagnostics/trace-diagnostics.json'));
      const traceMatches=trace.trace?.sha256===await sha(join(native,'trace-diagnostics/guest.pftrace'));
      const integrity=!armError&&verified&&cleanupComplete&&trace.captureComplete===true&&trace.guestTransportComplete===true&&trace.hostObservationIntegrity===true&&trace.hostCaptureWindowComplete===true&&traceMatches;
      const matrix=json(join(native,'acceptance/matrix/matrix.json')),pages=json(join(native,'acceptance/pages/pages.json')),journey=json(join(native,'acceptance/journey/journey.json')),acceptance=json(join(native,'acceptance/acceptance.json'));
      const font=json(join(native,'font-regression/font-regression.json')),geometry=json(join(native,'geometry-regression/geometry-regression.json')),healthBefore=json(join(native,'emulator-health-before.json')),healthAfter=json(join(native,'emulator-health-after.json'));
      result=inspectOriginalWorkload({selection,diagnostics,matrix,pages,journey,acceptance,font,geometry,healthBefore,healthAfter,stageCodes:stages,integrity});
    }catch(error){
      let targetAnr=null,targetAnrHistoryAvailable=false;
      try{const history=json(join(native,'anr-diagnostics/anr-diagnostics.json'));if(Array.isArray(history.targetAppAnrLines)){targetAnr=history.targetAppAnrLines.length>0;targetAnrHistoryAvailable=true;}}catch(historyError){audit({arm:arm.id,label:'incomplete-anr-history',error:historyError.message});}
      result={...arm,source:SOURCE,valid:false,targetAnr,targetAnrHistoryAvailable,commandFailure:true,error:armError||error.stack,stageCodes:stages};
    }
    result.hostProfile=hostProfile;
    save(join(native,'profile-arm-result.json'),result);
    const destination=join(output,arm.id);renameSync(native,destination);save(join(destination,'artifact-manifest.json'),await manifest(destination));
    return result;
  });
  const verdict={...top,...summarizeHostProfile(result,result.hostProfile),completedAtUtc:new Date().toISOString(),requiresPostRunTraceAnalysis:true,requiresPostRunProfileAnalysis:true};
  save(join(output,'diagnostic-result.json'),verdict);return verdict;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runDiagnostic().then(result=>{console.log(JSON.stringify(result));process.exitCode=result.technicalExitCode;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
