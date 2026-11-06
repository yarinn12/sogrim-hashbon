import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,openSync,closeSync,readdirSync,renameSync,statSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SOURCE,TREE,TOOLS,APK_SHA,requireInvocation,compareConfiguration,inspectArm,summarizeArms,verifyCertificate,executeControlledArms} from './contract.mjs';
import {readOwner,guardedAdb,cleanupOwned} from './owned.mjs';
import {verifySchema,verifyTransport} from './transport.mjs';
import {parseProcStat} from '../android-native-isolated/trace-diagnostics.mjs';
import {readAsgSdk,ASG_PROPERTIES} from '../android-native-isolated/gltransport.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function sha(path){const h=createHash('sha256');for await(const c of createReadStream(path))h.update(c);return h.digest('hex');}
function properties(text){const values={};for(const line of text.split(/\r?\n/)){if(!line.trim()||/^\s*[#;]/.test(line))continue;const at=line.indexOf('=');if(at<0)continue;const k=line.slice(0,at).trim();assert.ok(!Object.hasOwn(values,k),'Duplicate config key: '+k);values[k]=line.slice(at+1).trim();}return values;}
function resources(path){
  const report={atUtc:new Date().toISOString(),observations:{},unavailable:[]};
  for(const p of ['/proc/stat','/proc/meminfo','/proc/pressure/cpu','/proc/pressure/memory','/proc/pressure/io','/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/memory.max'])try{report.observations[p]=readFileSync(p,'utf8');}catch(e){report.unavailable.push({path:p,error:e.code});}
  report.processes=[];
  for(const name of readdirSync('/proc').filter(x=>/^\d+$/.test(x)))try{report.processes.push(parseProcStat(readFileSync('/proc/'+name+'/stat','utf8')));}catch(e){report.unavailable.push({pid:name,error:e.code||e.message});}
  save(path,report);
}
async function manifest(root){const rows=[];async function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),'Refuse redirected diagnostic artifact');if(entry.isDirectory())await walk(path);else rows.push({path:path.slice(root.length+1).replaceAll('\\','/'),bytes:statSync(path).size,sha256:await sha(path)});}}await walk(root);return rows;}

export async function runDiagnostic(env=process.env){
  requireInvocation(env);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
  const app=resolve(env.GITHUB_WORKSPACE,'app'),sdk=resolve(env.ANDROID_HOME),native=join(app,'artifacts/android-native-isolated');
  const output=join(app,'artifacts/android-transport-diagnostic');mkdirSync(output,{recursive:false});
  const top={diagnosticOnly:true,nativeAcceptance:false,releaseAcceptance:false,source:SOURCE,tools:TOOLS,tree:TREE,control:env.GITHUB_SHA,originalRun:42215206346,originalArtifact:13501922018,startedAtUtc:new Date().toISOString(),arms:[]};
  const commands=[],audit=row=>{commands.push(row);appendFileSync(join(output,'control-commands.jsonl'),JSON.stringify(row)+'\n');};
  const adb=join(sdk,'platform-tools/adb'),armRoot=join(env.RUNNER_TEMP,'android-transport-avds');
  assert.ok(!existsSync(armRoot),'Refuse existing AVD home');mkdirSync(armRoot);
  let baselineConfig,sharedKeyReceipt;
  const stock=Object.fromEntries(['fixture-provenance.json','apk-assets.json','qa-tools-source.txt','transport-original-apk-provenance.json'].map(f=>[f,readFileSync(join(native,f))]));
  const baseEnv={...env,ANDROID_QA_SOURCE:SOURCE,ANDROID_QA_DEVICE:'emulator-5582',ADB_PATH:adb,ANDROID_AVD_HOME:armRoot,
    ANDROID_USER_HOME:join(env.RUNNER_TEMP,'android-native-home'),ANDROID_EMULATOR_HOME:join(env.RUNNER_TEMP,'android-native-home'),ADB_VENDOR_KEYS:join(env.RUNNER_TEMP,'android-native-home/adbkey'),ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',NODE_OPTIONS:''};
  // A fresh server/key is prepared once, with the original unused-port guard.
  // Never kill a pre-existing ADB server or change the global Android homes.
  top.arms=await executeControlledArms(async arm=>{
    mkdirSync(native,{recursive:true});for(const [name,bytes] of Object.entries(stock))writeFileSync(join(native,name),bytes);
    const avd=`sogrim_ci_${env.GITHUB_RUN_ID}_1_${arm.id.toLowerCase()}`,armEnv={...baseEnv,ANDROID_QA_AVD:avd};
    let owner,emulator,logcat,logcatIdentity,verified=false,armError,cleanupComplete=false,stoppingLogcat=false;const stages=[];
    const append=row=>appendFileSync(join(native,'owned-command-audit.jsonl'),JSON.stringify(row)+'\n');
    async function run(label,file,args,{input,cwd=app,extraEnv={},guard=false}={}){
      const row={arm:arm.id,label,file,args,startedAtUtc:new Date().toISOString()};
      try{if(guard)row.ownerBefore=readOwner(owner);}catch(error){Object.assign(row,{exitCode:null,error:error.message,executed:false});stages.push(row);audit(row);save(join(native,'stage-exits.json'),stages);return row;}
      const log=join(native,label+'.log'),fd=openSync(log,'wx');let result;
      try{
        result=await new Promise(done=>{
          let child;try{child=cp.spawn(file,args,{cwd,env:{...armEnv,...extraEnv},stdio:[input===undefined?'ignore':'pipe',fd,fd],windowsHide:true});}
          catch(error){done({exitCode:null,error:error.message});return;}
          child.once('error',error=>done({exitCode:null,error:error.message}));child.once('close',(code,signal)=>done({exitCode:code,signal}));
          row.childPid=child.pid;if(input!==undefined)child.stdin.end(input);
        });
      }finally{closeSync(fd);}
      Object.assign(row,result,{completedAtUtc:new Date().toISOString(),log});
      try{if(guard)row.ownerAfter=readOwner(owner);}catch(error){row.error='Ownership lost after command: '+error.message;}
      stages.push(row);audit(row);save(join(native,'stage-exits.json'),stages);return row;
    }
    const must=async(...args)=>{const r=await run(...args);assert.equal(r.exitCode,0,'Required command failed: '+r.label);assert.ok(!r.signal&&!r.error);return r;};
    function a(args,options={}){
      return guardedAdb(owner,['-s','emulator-5582',...args],{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:32*1024*1024,...options},(args,opts)=>cp.spawnSync(adb,args,{...opts,env:armEnv}),{record:append});
    }
    function checkedAdb(args,options){const r=a(args,options);assert.equal(r.status,0,'ADB failed: '+args.join(' '));assert.ok(!r.error&&!r.signal);return r.stdout;}
    const node=(name,label=name,args=[],extra={})=>must(label,process.execPath,[join(app,'scripts/qa/android-native-isolated',name+'.mjs'),...args],{...extra,guard:Boolean(owner)});
    function nodeAuditEnv(){return {ANDROID_QA_EMULATOR_PID:String(owner.pid),ANDROID_TRANSPORT_OWNER_FILE:join(native,'diagnostic-owner.json'),NODE_OPTIONS:'--import='+pathToFileURL(join(here,'preload.mjs')).href};}
    try{
      resources(join(native,'resources-before.json'));
      await must('source-recheck','python3',[join(here,'artifact.py'),'verify-source',app]);
      await must('sdk-recheck','python3',[join(here,'artifact.py'),'verify-sdk',sdk]);
      assert.equal(await sha(join(app,'android/app/build/outputs/apk/debug/app-debug.apk')),APK_SHA);
      const cert=readFileSync(join(app,'original-debug-certificate.txt'),'utf8');verifyCertificate(cert);writeFileSync(join(native,'debug-certificate.txt'),cert);
      assert.equal(readFileSync(join(native,'qa-tools-source.txt'),'utf8').trim(),TOOLS);
      const source=cp.spawnSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'});assert.equal(source.status,0);assert.equal(source.stdout.trim(),SOURCE);
      verifySchema(readFileSync(join(sdk,'emulator/lib/hardware-properties.ini')));
      const avdmanager=resolve(env.ANDROID_QA_AVDMANAGER);assert.ok(avdmanager.startsWith(join(sdk,'cmdline-tools')+'/'),'Foreign avdmanager');
      await must('avd-create',avdmanager,['create','avd','-n',avd,'-k','system-images;android-36.1;google_apis_playstore;x86_64','-d','pixel_6'],{input:'no\n'});
      const configPath=join(armRoot,avd+'.avd/config.ini'),config=properties(readFileSync(configPath,'utf8'));
      Object.assign(config,{'hw.cpu.ncore':'2','hw.ramSize':'4096','hw.lcd.width':'1080','hw.lcd.height':'2400','hw.lcd.density':'420','hw.keyboard':'yes','hw.camera.back':'none','hw.camera.front':'none','hw.gltransport':arm.transport});
      if(!baselineConfig)baselineConfig={...config};save(join(native,'configuration-diff.json'),compareConfiguration(baselineConfig,config,arm.transport));
      writeFileSync(configPath,Object.entries(config).map(([k,v])=>k+' = '+v).join('\n')+'\n');writeFileSync(join(native,'avd-config.ini'),readFileSync(configPath));
      await node('renderer-capabilities','renderer-snapshot',['snapshot']);
      if(arm.transport==='asg')await node('gltransport','transport-snapshot',['snapshot']);
      else save(join(native,'transport-sdk.json'),{source:SOURCE,device:'emulator-5582',avd,requestedTransport:'pipe',prepared:true,verified:false,diagnosticOnly:true,sdk:readAsgSdk(sdk)});
      if(arm.id==='A1'){
        await node('adb-key-preflight');sharedKeyReceipt=readFileSync(join(native,'adb-key-preflight.json'));
      }else writeFileSync(join(native,'shared-adb-key-preflight.json'),sharedKeyReceipt);
      assert.ok(statSync('/dev/kvm').isCharacterDevice(),'Missing existing KVM device');
      const emulatorArgs=['-avd',avd,'-port','5582','-no-window','-no-snapshot','-no-audio','-no-boot-anim','-gpu','swiftshader','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-verbose','-memory','4096','-cores','2'];
      const fd=openSync(join(native,'emulator.log'),'wx');
      try{emulator=cp.spawn(join(sdk,'emulator/emulator'),emulatorArgs,{env:armEnv,stdio:['ignore',fd,fd]});emulator.on('error',error=>audit({arm:arm.id,label:'emulator-error',error:error.message}));}finally{closeSync(fd);}
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
      const extraEnv=nodeAuditEnv();
      await node('network-isolation','network-isolation',[],{extraEnv});
      checkedAdb(['shell','settings','put','secure','show_ime_with_hard_keyboard','1']);
      await node('launcher-preparation','launcher-preparation',[],{extraEnv});
      checkedAdb(['install',join(app,'android/app/build/outputs/apk/debug/app-debug.apk')]);
      writeFileSync(join(native,'guest-meminfo.txt'),checkedAdb(['shell','cat','/proc/meminfo']));
      await node('emulator-health','health-before',[],{extraEnv:{...extraEnv,ANDROID_QA_HEALTH_PHASE:'before'}});
      await node('renderer-capabilities','renderer-verify',['verify'],{extraEnv});
      if(arm.transport==='asg')await node('gltransport','transport-verify',['verify'],{extraEnv});
      const guest=Object.fromEntries(ASG_PROPERTIES.map(k=>[k,checkedAdb(['shell','getprop',k]).trim()]));
      const selection=verifyTransport(readFileSync(join(native,'emulator.log'),'utf8'),guest,arm.transport);
      save(join(native,'diagnostic-effective-transport.json'),{...selection,source:SOURCE,avd,diagnosticOnly:true,nativeAcceptance:false,owner:readOwner(owner)});verified=true;
      // Retain the original continuous history from before the first cold launch.
      const logFd=openSync(join(native,'logcat-live.log'),'wx'),logArgs=['-s','emulator-5582','logcat','-b','all','-v','threadtime'];
      try{const before=readOwner(owner);logcat=cp.spawn(adb,logArgs,{env:armEnv,stdio:['ignore',logFd,logFd]});logcat.on('error',error=>audit({arm:arm.id,label:'logcat-error',error:error.message}));
        logcat.once('close',(exitCode,signal)=>{append({action:'logcat-closed',pid:logcat.pid,exitCode,signal,expectedStop:stoppingLogcat});if(!stoppingLogcat)armError||='Continuous logcat ended before finalization';});
        logcatIdentity={...parseProcStat(readFileSync('/proc/'+logcat.pid+'/stat','utf8')),command:[adb,...logArgs]};append({args:logArgs,executed:true,async:true,before,after:readOwner(owner),child:logcatIdentity});
      }finally{closeSync(logFd);}
      writeFileSync(join(native,'logcat-live.pid'),String(logcat.pid)+'\n');
      await node('trace-diagnostics','trace-start',['start'],{extraEnv});
      await node('font-regression','font-regression',[],{extraEnv});
      // A failing original matrix does not prevent its original pages/journey:
      // acceptance.mjs owns that sequencing and preserves each child exit.
      const acceptance=await run('acceptance',process.execPath,[join(app,'scripts/qa/android-native-isolated/acceptance.mjs')],{guard:true,extraEnv});
      if(acceptance.exitCode===0&&!acceptance.error&&!acceptance.signal){
        await node('geometry-regression','geometry-regression',[],{extraEnv});
        await node('emulator-health','health-after',[],{extraEnv:{...extraEnv,ANDROID_QA_HEALTH_PHASE:'after'}});
      }else save(join(native,'original-conditional-skips.json'),{geometry:'prior acceptance step failed',healthAfter:'prior acceptance step failed'});
      await must('source-after','python3',[join(here,'artifact.py'),'verify-source',app]);
      await must('sdk-after','python3',[join(here,'artifact.py'),'verify-sdk',sdk]);
    }catch(error){
      armError=error.stack;save(join(native,'arm-error.json'),{error:armError});
    }finally{
      if(owner){
        // Always finalize capture and the full-history ANR gate, even on failure.
        try{
          readOwner(owner);const extraEnv=nodeAuditEnv();
          await run('trace-finish',process.execPath,[join(app,'scripts/qa/android-native-isolated/trace-diagnostics.mjs'),'finish'],{guard:true,extraEnv:{...extraEnv,ANDROID_QA_JOB_STATUS:armError||stages.some(s=>s.exitCode!==0)?'failure':'success'}});
          await run('anr-diagnostics',process.execPath,[join(app,'scripts/qa/android-native-isolated/anr-diagnostics.mjs')],{guard:true,extraEnv:{...extraEnv,ANDROID_QA_JOB_STATUS:armError||stages.some(s=>s.exitCode!==0)?'failure':'success'}});
        }catch(error){armError||=error.stack;save(join(native,'finalize-error.json'),{error:error.stack});}
        try{
          const receipt=await cleanupOwned(owner,{logcat,logcatIdentity,env:armEnv,run:cp.spawnSync,record:append,onStoppingLogcat:()=>{stoppingLogcat=true;}});
          cleanupComplete=true;save(join(native,'owned-cleanup.json'),receipt);
        }catch(error){armError||=error.stack;save(join(native,'cleanup-error.json'),{error:error.stack});emulator?.unref();logcat?.unref();}
      }
      resources(join(native,'resources-after.json'));
    }
    let result;
    try{
      const diagnostics=json(join(native,'anr-diagnostics/anr-diagnostics.json')),trace=json(join(native,'trace-diagnostics/trace-diagnostics.json'));
      const traceMatches=trace.trace?.sha256===await sha(join(native,'trace-diagnostics/guest.pftrace'));
      const integrity=!armError&&verified&&cleanupComplete&&trace.captureComplete===true&&trace.guestTransportComplete===true&&trace.hostObservationIntegrity===true&&trace.hostCaptureWindowComplete===true&&traceMatches;
      const matrix=json(join(native,'acceptance/matrix/matrix.json')),stacks=readFileSync(join(native,'anr-diagnostics/dropbox-data-app-anr.txt'),'utf8');
      result=inspectArm({...arm,diagnostics,matrix,stacks,stageCodes:stages,integrity});
    }catch(error){result={...arm,valid:false,targetAnr:false,commandFailure:true,error:armError||error.stack,stageCodes:stages};}
    save(join(native,'arm-result.json'),result);
    const destination=join(output,arm.id);renameSync(native,destination);save(join(destination,'artifact-manifest.json'),await manifest(destination));
    return result;
  },arms=>save(join(output,'diagnostic-progress.json'),{...top,...summarizeArms(arms)}));
  const verdict={...top,...summarizeArms(top.arms),completedAtUtc:new Date().toISOString(),requiresPostRunTraceAnalysis:true};
  save(join(output,'diagnostic-result.json'),verdict);return verdict;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runDiagnostic().then(result=>{console.log(JSON.stringify(result));process.exitCode=result.technicalExitCode;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
