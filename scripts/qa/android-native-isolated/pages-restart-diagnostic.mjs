import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,readdirSync,statSync} from 'node:fs';
import {join,resolve,isAbsolute,relative,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SOURCE,TREE,sha,instrumentDriver,instrumentPages,validatePrelude,diagnosticOutcome,assessClosedLog} from './pages-restart-materialize.mjs';
import {armScale} from './pages-restart-target.mjs';
import {stamp,boundedGuestClockAnchor,CLOCK_PROBE,createTelemetry} from './pages-restart-telemetry.mjs';
import {verifyOwnedAsg,readAsgSdk} from './gltransport.mjs';
import {startOwnedTrace,finishOwnedTrace} from './trace-diagnostics.mjs';
import {collectOwnedAnrDiagnostics} from './anr-diagnostics.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export function requireConfiguration(env,platform=process.platform){
  if(env.ANDROID_PAGES_RESTART_RUN!=='reviewed-diagnostic-only')throw new Error('Preparation only: explicit reviewed diagnostic invocation is required');
  if(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD!=='1')throw new Error('Original isolated private-environment guard is required');
  if(platform!=='linux')throw new Error('Actual owned Linux host/v5 capture required');
  if(!isAbsolute(env.ANDROID_RESTART_SOURCE_ROOT||''))throw new Error('Require absolute separate frozen source checkout');
  if(env.ANDROID_QA_SOURCE!==SOURCE||env.ANDROID_QA_DEVICE!=='emulator-5582'||!/^sogrim_ci_[a-z0-9_]+$/.test(env.ANDROID_QA_AVD||'')||!env.ADB_PATH||!env.ANDROID_HOME)throw new Error('Require c14 source and exact owned emulator/SDK configuration');
  armScale(env.ANDROID_RESTART_ARM);
  const root=resolve(env.ANDROID_RESTART_SOURCE_ROOT),output=resolve(root,'artifacts/android-native-isolated',`pages-restart-${env.ANDROID_RESTART_ARM}`);
  if(existsSync(output))throw new Error('Refuse overwrite/retry of diagnostic arm output');
  if(existsSync(join(root,'artifacts/android-native-isolated/trace-diagnostics/trace-start.json')))throw new Error('Require a fresh arm with no prior trace session');
  return {root,output,arm:env.ANDROID_RESTART_ARM,adbPath:env.ADB_PATH,device:env.ANDROID_QA_DEVICE,avd:env.ANDROID_QA_AVD,source:SOURCE};
}

export function materializeHarness({root,output},git=args=>execFileSync('git',['-C',root,...args])){
  if(git(['rev-parse','HEAD']).toString().trim()!==SOURCE||git(['rev-parse','HEAD^{tree}']).toString().trim()!==TREE)throw new Error('Frozen source HEAD/tree differs from c14');
  const changed=git(['diff','--name-only','HEAD']).toString().trim().split(/\r?\n/).filter(Boolean);
  const generated=new Set(['android/app/capacitor.build.gradle','android/capacitor.settings.gradle','ios/App/CapApp-SPM/Package.swift']);
  if(changed.some(path=>!generated.has(path)))throw new Error('Source checkout has unexpected changes');
  const prefix='scripts/qa/android-native-isolated/';
  const paths=git(['ls-tree','-r','--name-only',SOURCE,'--',prefix]).toString().trim().split(/\r?\n/);
  if(paths.length!==37||paths.some(path=>!path.startsWith(prefix)||path.slice(prefix.length).includes('/')))throw new Error('Require original 37 flat c14 harness files');
  const destination=join(output,'generated-harness');mkdirSync(destination,{recursive:true});const bindings=[];
  const telemetry=pathToFileURL(join(here,'pages-restart-telemetry.mjs')).href,target=pathToFileURL(join(here,'pages-restart-target.mjs')).href;
  for(const path of paths){
    const original=git(['show',`${SOURCE}:${path}`]),name=path.slice(prefix.length);
    // Always execute canonical Git blob bytes. Local CRLF conversion is recorded,
    // not copied; the tracked-diff guard above rejects actual source changes.
    const localRawSha256=sha(readFileSync(join(root,path)));
    let bytes=original;
    if(name==='driver.mjs')bytes=Buffer.from(instrumentDriver(original.toString('utf8'),telemetry));
    if(name==='pages.mjs')bytes=Buffer.from(instrumentPages(original.toString('utf8'),target,telemetry));
    writeFileSync(join(destination,name),bytes,{flag:'wx'});
    bindings.push({path,originalSha256:sha(original),localRawSha256,generatedSha256:sha(bytes),instrumented:name==='driver.mjs'||name==='pages.mjs'});
  }
  writeFileSync(join(output,'harness-bindings.json'),JSON.stringify({source:SOURCE,tree:TREE,bindings,originalSourceUnchanged:true,diagnosticOnly:true},null,2));return destination;
}

async function main(){
  const options=requireConfiguration(process.env);mkdirSync(options.output,{recursive:true});
  const {root,output,arm}=options,artifactRoot=join(root,'artifacts/android-native-isolated'),traceOutput=join(artifactRoot,'trace-diagnostics'),report={source:SOURCE,tree:TREE,arm,finalScale:armScale(arm),diagnosticOnly:true,nativeAcceptance:false,releaseAuthorized:false,startedAtUtc:new Date().toISOString(),errors:[],stages:[],anchors:[]};
  const telemetry=createTelemetry(join(output,'controller-commands'));
  const adb=args=>{const result=telemetry.observedSpawnSync(spawnSync,options.adbPath,['-s',options.device,...args],{encoding:'utf8',timeout:20000,maxBuffer:20*1024*1024});if(result.error||result.status!==0)throw new Error('Diagnostic controller ADB command failed');return result.stdout;};
  function anchor(label){const before=stamp(),raw=adb([...CLOCK_PROBE]),after=stamp();report.anchors.push({label,...boundedGuestClockAnchor(before,after,raw)});}
  let logcat,logFd,logError,logClosed;
  try{
    const harness=materializeHarness(options);
    const owner=adb(['emu','avd','name']).split(/\r?\n/)[0].trim();if(owner!==options.avd)throw new Error('Refuse unrelated AVD');report.ownershipVerified=true;
    options.emulatorPid=Number(readFileSync(join(root,'artifacts/android-native-isolated/emulator.pid'),'utf8').trim());
    report.setupReports={};
    for(const name of ['effective-renderer','effective-transport','emulator-health-before']){
      const file=join(artifactRoot,name+'.json'),bytes=readFileSync(file),value=JSON.parse(bytes);
      if(value.source!==SOURCE||value.device!==options.device||value.avd!==options.avd||(name==='emulator-health-before'?value.healthy!==true:value.verified!==true))throw new Error('Original setup readback missing/mismatched: '+name);
      report.setupReports[name]={bytes:bytes.length,sha256:sha(bytes)};
    }
    const renderer=JSON.parse(readFileSync(join(artifactRoot,'effective-renderer.json')));
    if(renderer.requestedGpu!=='swiftshader'||renderer.backend!=='gfxstream'||renderer.glesMode!=='swiftshader'||renderer.vulkanActive!==0)throw new Error('Original effective renderer differs');
    const priorTransport=JSON.parse(readFileSync(join(artifactRoot,'effective-transport.json'))),sdk=readAsgSdk(process.env.ANDROID_HOME);
    if(JSON.stringify(priorTransport.sdk)!==JSON.stringify(sdk))throw new Error('Original ASG SDK/schema differs');
    report.transportReadbacks=[];
    report.ownedAsg=verifyOwnedAsg({...options,sdkHome:process.env.ANDROID_HOME,log:readFileSync(join(artifactRoot,'emulator.log'),'utf8')},{run:(...args)=>telemetry.observedSpawnSync(spawnSync,...args),onRecord:row=>report.transportReadbacks.push(row)});
    const ownerArgs=report.ownedAsg.owner.command;
    for(const [flag,value]of [['-cores','2'],['-memory','4096']])if(ownerArgs.filter(arg=>arg===flag).length!==1||ownerArgs[ownerArgs.indexOf(flag)+1]!==value)throw new Error('Original emulator resources differ: '+flag);
    // Keep the original trace location used by unmodified matrix hold-failure capture.
    const traceOptions={...options,output:traceOutput};
    report.toolCommit=execFileSync('git',['-C',resolve(here,'../../..'),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    report.apk={bytes:statSync(join(root,'android/app/build/outputs/apk/debug/app-debug.apk')).size,sha256:sha(readFileSync(join(root,'android/app/build/outputs/apk/debug/app-debug.apk')))};
    logFd=openSync(join(output,'logcat-live.log'),'wx');
    logcat=spawn(options.adbPath,['-s',options.device,'logcat','-b','all','-v','threadtime'],{stdio:['ignore',logFd,logFd],windowsHide:true});
    logClosed=new Promise(done=>logcat.once('close',()=>done(true)));
    logcat.on('error',error=>{logError=String(error);});logcat.on('exit',(code,signal)=>{if(!report.stoppingLogcat)logError=`Continuous logcat exited early: ${code}/${signal}`;});
    const started=await startOwnedTrace(traceOptions);if(!started.captureStarted)throw new Error('Original trace/v5 observer did not start');
    anchor('before-matrix');
    for(const stage of ['font-regression','matrix','pages']){
      const stageOutput=join(output,stage);mkdirSync(stageOutput,{recursive:true});
      anchor(`before-${stage}-child`);
      const before=stamp(),result=spawnSync(process.execPath,[join(harness,stage+'.mjs')],{cwd:root,env:{...process.env,ANDROID_QA_OUTPUT:stageOutput,ANDROID_RESTART_COMMAND_EVIDENCE:join(output,`${stage}-commands`),ANDROID_RESTART_TARGET_OUTPUT:output},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:20*1024*1024}),after=stamp();
      writeFileSync(join(output,stage+'.stdout.txt'),result.stdout||'');writeFileSync(join(output,stage+'.stderr.txt'),result.stderr||'');
      report.stages.push({stage,before,after,exitCode:result.status,error:result.error?String(result.error):null});
      anchor(`after-${stage}-child`);
      if(result.error||stage!=='pages'&&result.status!==0||stage==='pages'&&result.status!==1)throw new Error('Unexpected diagnostic child exit; truncated pages must retain strict original nonzero completeness gate');
      if(stage==='font-regression'&&JSON.parse(readFileSync(join(stageOutput,'font-regression.json'),'utf8')).ready!==true)throw new Error('Original font fault controls failed');
    }
    const matrix=JSON.parse(readFileSync(join(output,'matrix/matrix.json'),'utf8')),pages=JSON.parse(readFileSync(join(output,'pages/pages.json'),'utf8'));
    report.prelude=validatePrelude(matrix,pages);if(!report.prelude.matrixPassed||!report.prelude.pagesPassed)throw new Error('Original matrix or exact four-case pages prelude failed');
    report.target=JSON.parse(readFileSync(join(output,'target.json'),'utf8'));
    report.cleanup=JSON.parse(readFileSync(join(output,'cleanup.json'),'utf8'));
  }catch(error){report.errors.push(String(error.stack||error));}
  finally{
    const traceOptions={...options,output:traceOutput};
    if(existsSync(join(traceOptions.output,'trace-start.json'))){try{report.trace=await finishOwnedTrace(traceOptions);}catch(error){report.errors.push(String(error));}}
    if(report.ownershipVerified&&logcat){try{report.anr=collectOwnedAnrDiagnostics({...options,output:join(output,'anr-diagnostics'),jobStatus:'failure'});}catch(error){report.errors.push(String(error));}}
    report.stoppingLogcat=true;
    if(logcat){logcat.kill();report.logcatClosed=await Promise.race([logClosed,new Promise(done=>setTimeout(()=>done(false),5000).unref())]);if(!report.logcatClosed)report.errors.push('Owned logcat close was not acknowledged; evidence may still change');}
    if(logFd!==undefined)closeSync(logFd);if(logError)report.errors.push(logError);
    report.closedLog=assessClosedLog(join(output,'logcat-live.log'),report.logcatClosed);
    Object.assign(report,diagnosticOutcome(report));
    report.completedAtUtc=new Date().toISOString();writeFileSync(join(output,'diagnostic-report.json'),JSON.stringify(report,null,2));
    const files=[];function inventory(directory){for(const name of readdirSync(directory)){const file=join(directory,name);if(statSync(file).isDirectory())inventory(file);else files.push({path:relative(artifactRoot,file).replaceAll('\\','/'),bytes:statSync(file).size,sha256:sha(readFileSync(file))});}}inventory(artifactRoot);
    writeFileSync(join(output,'diagnostic-manifest.json'),JSON.stringify({artifactRoot,files,excludes:[`pages-restart-${arm}/diagnostic-manifest.json`],diagnosticOnly:true,nativeAcceptance:false},null,2));
    process.exitCode=report.exitCode;
    console.log(JSON.stringify({output,diagnosticComplete:report.diagnosticComplete,anrObserved:report.anrObserved,nativeAcceptance:false,errors:report.errors}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
