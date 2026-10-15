import {execFile,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {auditDiagnosticApks,APP_SOURCE} from './apk-members.mjs';
import {foreground15sVerdict,hostCapacitySnapshot,requireDiagnosticManifest,requireFrozenEmulatorControls,runFixedTrials,webviewProviderIdentity} from './abba-contract.mjs';
import {assertHostOwner} from '../trace-diagnostics.mjs';
import {actualDefaultDisplayFocus} from '../orientation.mjs';
import {hasNoDefaultNetwork} from '../network-isolation.mjs';
import {DIAGNOSTIC_CONTRACT,requireDiagnosticMetadata} from '../diagnostic-contract.mjs';
import {HOST_COHORT_CONTRACT} from '../cohort-observation-coverage.mjs';

const execute=promisify(execFile),pkg='com.sogrimhashbon.app.debug',activity=`${pkg}/com.sogrimhashbon.app.MainActivity`;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const iso=()=>new Date().toISOString();
const hex40=/^[a-f0-9]{40}$/;

export function requireDiagnosticReceipts({manifest,network,collector,source,toolsSource,device,avd,emulatorPid}){
  requireDiagnosticManifest(manifest);
  if(source!==APP_SOURCE||!hex40.test(toolsSource||'')||!/^emulator-\d+$/.test(device||'')||!/^sogrim_ci_[a-z0-9_]+$/.test(avd||'')||!Number.isSafeInteger(emulatorPid)||emulatorPid<=1)
    throw new Error('Require exact app/tools source and explicitly owned CI AVD');
  if(network?.isolated!==true||network.device!==device||network.avd!==avd||network.pid!==emulatorPid||network.source!==source)
    throw new Error('Require original owned-AVD network isolation receipt');
  requireDiagnosticMetadata(collector,DIAGNOSTIC_CONTRACT.start);
  const owner=collector.hostOwner,ready=collector.hostObserver?.ready;
  requireDiagnosticMetadata(ready,DIAGNOSTIC_CONTRACT.host);
  if(HOST_COHORT_CONTRACT.version!==5||collector.captureStarted!==true||collector.guestTransportStarted!==true||
    collector.source!==source||collector.device!==device||collector.avd!==avd||collector.emulatorPid!==emulatorPid||
    !/^sogrim_ci_[a-z0-9_]+_[a-f0-9]{16}$/.test(collector.session||'')||
    owner?.pid!==emulatorPid||!/^[0-9]+$/.test(owner?.startTicks||'')||
    !Number.isSafeInteger(collector.hostObserver?.pid)||collector.hostObserver.pid<=1||
    ready.source!==source||ready.session!==collector.session||ready.owner?.pid!==owner.pid||ready.owner?.startTicks!==owner.startTicks||
    collector.errors?.length!==0||collector.guestTransportErrors?.length!==0||collector.hostObservationErrors?.length!==0)
    throw new Error('Require the actual owned v5 start and host readiness receipt');
  return owner;
}

export function toolsSourceFromCheckout(checkout,{run=execFileSync,expectedSha}={}){
  if(!checkout)throw new Error('Require separate QA tools checkout');
  const sha=String(run('git',['-C',resolve(checkout),'rev-parse','HEAD'],{encoding:'utf8',timeout:10000,windowsHide:true})).trim();
  if(!hex40.test(sha)||expectedSha&&sha!==expectedSha)throw new Error('QA tools checkout SHA differs from workflow guard');
  return sha;
}

export function requireLiveCollector({collector,output,clock=Date.now,exists=existsSync,stat=statSync,signal=process.kill}){
  const observerPid=collector.hostObserver?.pid,journal=resolve(output,'host-scheduling.jsonl');
  try{
    if(exists(resolve(output,'host-summary.json')))throw new Error('Host cohort observer already stopped');
    if(!Number.isSafeInteger(observerPid)||observerPid<=1)throw new Error('Host cohort observer PID unavailable');
    signal(observerPid,0);
    const info=stat(journal);
    if(!info.isFile()||info.size<=0||info.size>=64*1024*1024||!Number.isFinite(info.mtimeMs)||clock()-info.mtimeMs>5000)
      throw new Error('Host cohort journal is stopped, stale or at its cap');
    return{observerPid,journalBytes:info.size,lastWriteAtUtc:new Date(info.mtimeMs).toISOString()};
  }catch(error){throw Object.assign(new Error('Owned v5 collector unavailable: '+error.message),{safetyStop:true});}
}

export function requireTrialOwner(ctx,{check=assertHostOwner}={}){
  try{
    const owned=check({emulatorPid:ctx.emulatorPid,avd:ctx.avd,device:ctx.device},{expectedStartTicks:ctx.owner.startTicks});
    if(JSON.stringify(owned.command)!==JSON.stringify(ctx.ownerCommand))throw new Error('Owned emulator command changed');
    return owned;
  }catch(error){throw Object.assign(new Error('Owned emulator unavailable: '+error.message),{safetyStop:true});}
}

function appendBounded(path,value,limit=8*1024*1024){
  const line=JSON.stringify(value)+'\n',used=existsSync(path)?statSync(path).size:0;
  if(used+Buffer.byteLength(line)>limit)throw new Error('Diagnostic journal cap reached: '+path);
  appendFileSync(path,line);
}

class Cdp{
  constructor(url,signal){
    this.socket=new WebSocket(url);this.pending=new Map();this.nextId=0;
    this.ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Diagnostic CDP open timed out')),10000);
      this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      this.socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Diagnostic CDP socket failed'));},{once:true});
    });
    this.socket.addEventListener('message',event=>{
      let message;try{message=JSON.parse(String(event.data));}catch{return;}
      const pending=this.pending.get(message.id);if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(message.id);
      message.error?pending.reject(new Error(JSON.stringify(message.error))):pending.resolve(message.result);
    });
    signal.addEventListener('abort',()=>this.close(),{once:true});
  }
  async command(method,params={}){
    await this.ready;const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Diagnostic CDP '+method+' timed out'));},10000);
      this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression){const response=await this.command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error('Diagnostic CDP evaluation failed');return response.result.value;}
  close(){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Diagnostic CDP closed'));}this.pending.clear();this.socket.close();}
}

async function adbFactory({adbPath,device,signal}){
  return async(args,timeoutMs=20000)=>{
    if(signal?.aborted)throw new Error('Diagnostic trial budget exceeded');
    const {stdout}=await execute(adbPath,['-s',device,...args],{encoding:'utf8',timeout:timeoutMs,signal,windowsHide:true,maxBuffer:20*1024*1024});
    return stdout;
  };
}
async function connectWebView(adb,signal){
  const pid=(await adb(['shell','pidof',pkg],5000)).trim();if(!/^\d+$/.test(pid))throw new Error('Owned debug app PID unavailable');
  await adb(['forward','tcp:9232',`localabstract:webview_devtools_remote_${pid}`],5000);
  const response=await fetch('http://127.0.0.1:9232/json',{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  const pages=await response.json(),page=pages.find(value=>value.type==='page'&&/^https:\/\/localhost(?:\/|$)/.test(value.url));
  if(!page)throw new Error('Owned localhost WebView CDP page unavailable');
  const cdp=new Cdp(page.webSocketDebuggerUrl,signal);await cdp.command('Runtime.enable');return{cdp,pid};
}

async function clockAnchor(adb){
  const hostBeforeUtc=iso(),hostBeforeMonoNs=process.hrtime.bigint().toString();let guestUtcNs,guestUptime,error;
  try{guestUtcNs=(await adb(['shell','date','+%s%N'],5000)).trim();guestUptime=(await adb(['shell','cat','/proc/uptime'],5000)).trim();}
  catch(cause){error=cause.message;}
  return{hostBeforeUtc,hostBeforeMonoNs,guestUtcNs,guestUptime,hostAfterMonoNs:process.hrtime.bigint().toString(),hostAfterUtc:iso(),...(error?{unavailable:error}:{})};
}
async function guestGpuObservation(adb,pid){
  try{const raw=await adb(['shell','ps','-T','-p',String(pid)],5000);return{atUtc:iso(),pid,observedLines:raw.split(/\r?\n/).filter(line=>/Chrome_InProcGp|RenderThread|GPU/i.test(line)),roleProven:false};}
  catch(error){return{atUtc:iso(),pid,unavailable:error.message,roleProven:false};}
}
function ownedContext(env){
  for(const key of ['ANDROID_DIAGNOSTIC_APK_MANIFEST','ANDROID_DIAGNOSTIC_NETWORK_RECEIPT','ANDROID_DIAGNOSTIC_V5_START_RECEIPT'])if(!env[key])throw new Error('Require '+key);
  if(!hex40.test(env.GITHUB_SHA||''))throw new Error('Require actual QA tools checkout SHA from workflow');
  const source=env.ANDROID_DIAGNOSTIC_APP_SOURCE,toolsSource=toolsSourceFromCheckout(env.ANDROID_DIAGNOSTIC_TOOLS_CHECKOUT,{expectedSha:env.GITHUB_SHA}),device=env.ANDROID_QA_DEVICE,avd=env.ANDROID_QA_AVD,emulatorPid=Number(env.ANDROID_QA_EMULATOR_PID);
  const manifest=json(env.ANDROID_DIAGNOSTIC_APK_MANIFEST),network=json(env.ANDROID_DIAGNOSTIC_NETWORK_RECEIPT),collector=json(env.ANDROID_DIAGNOSTIC_V5_START_RECEIPT);
  const owner=requireDiagnosticReceipts({manifest,network,collector,source,toolsSource,device,avd,emulatorPid});
  const collectorOutput=dirname(resolve(env.ANDROID_DIAGNOSTIC_V5_START_RECEIPT));
  if(resolve(collector.output||'')!==collectorOutput)throw new Error('Owned v5 start receipt path differs from collector output');
  if(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD!=='1'||!env.ADB_PATH||!env.APKSIGNER_PATH||!env.ANDROID_DIAGNOSTIC_CONTROL_INDEX||!env.ANDROID_DIAGNOSTIC_OUTPUT)throw new Error('Require private env disabled and exact diagnostic tool/fixture paths');
  const fresh=auditDiagnosticApks({productApk:manifest.variants.A.path,controlApk:manifest.variants.B.path,controlIndex:env.ANDROID_DIAGNOSTIC_CONTROL_INDEX});
  if(fresh.variants.A.apkSha256!==manifest.variants.A.apkSha256||fresh.variants.B.apkSha256!==manifest.variants.B.apkSha256||JSON.stringify(fresh.changedMembers)!==JSON.stringify(manifest.changedMembers))throw new Error('Audited APK bytes changed before installation');
  return{source,toolsSource,device,avd,emulatorPid,owner,manifest,collector,collectorOutput,network,adbPath:env.ADB_PATH,apksignerPath:env.APKSIGNER_PATH,output:resolve(env.ANDROID_DIAGNOSTIC_OUTPUT)};
}

async function signerDigest(apksignerPath,apk){
  const {stdout}=await execute(apksignerPath,['verify','--print-certs',apk],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:1024*1024});
  const digests=[...stdout.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/g)].map(match=>match[1].toLowerCase());
  if(digests.length!==1)throw new Error('Require exactly one verified debug APK signer');return digests[0];
}

export async function executeTrial({trial,variant,budgetMs},ctx,captureError,{makeAdb=adbFactory,hostOwner=assertHostOwner,checkCollector=requireLiveCollector}={}){
  const events=[],focus=[],gpu=[];let cdp,guestPid,firstForegroundAtUtc=null,firstAnrAtUtc=null,foregroundWaitStarted=null,ready=null,nativeReadError=null;const started=Date.now(),signal=AbortSignal.timeout(budgetMs);
  const record=(kind,detail={})=>events.push({kind,atUtc:iso(),hostMonoNs:process.hrtime.bigint().toString(),...detail});
  const adb=await makeAdb({adbPath:ctx.adbPath,device:ctx.device,signal});
  const safe=()=>{requireTrialOwner(ctx,{check:hostOwner});checkCollector({collector:ctx.collector,output:ctx.collectorOutput});if(captureError())throw Object.assign(new Error('Capacity observation unavailable'),{safetyStop:true});};
  try{
    safe();
    const avd=(await adb(['emu','avd','name'],5000)).split(/\r?\n/)[0].trim();if(avd!==ctx.avd)throw Object.assign(new Error('Owned AVD changed'),{safetyStop:true});
    const webviewRaw=(await adb(['shell','dumpsys','webviewupdate'],5000)).trim(),webview=webviewProviderIdentity(webviewRaw),guestVcpus=(await adb(['shell','nproc'],5000)).trim();
    if(JSON.stringify(webview)!==JSON.stringify(ctx.webview)||guestVcpus!==ctx.guestVcpus)throw Object.assign(new Error('WebView provider or guest CPU count changed between trials'),{safetyStop:true});
    const airplane=(await adb(['shell','settings','get','global','airplane_mode_on'],5000)).trim(),connectivity=await adb(['shell','dumpsys','connectivity'],10000);
    if(airplane!=='1'||!hasNoDefaultNetwork(connectivity))throw Object.assign(new Error('Guest network isolation lost'),{safetyStop:true});
    const font=(await adb(['shell','settings','get','system','font_scale'],5000)).trim(),rotation=(await adb(['shell','wm','user-rotation'],5000)).trim(),accelerometer=(await adb(['shell','settings','get','system','accelerometer_rotation'],5000)).trim();
    if(font!=='1'||rotation!=='lock 0'||accelerometer!=='0')throw Object.assign(new Error('Scale/portrait posture changed before trial'),{safetyStop:true});
    const apk=ctx.manifest.variants[variant];record('trial-start',{trial,variant,apkSha256:apk.apkSha256,font,rotation,accelerometer,webviewProvider:webview,guestVcpus});
    const beforeAnr=await adb(['shell','dumpsys','activity','lastanr'],10000);writeFileSync(resolve(ctx.output,`trial-${trial}-lastanr-before.txt`),beforeAnr);
    safe();record('apk-install-request-start',{variant});
    await adb(['install','-r',apk.path],Math.min(60000,budgetMs));record('apk-install-completed',{variant});
    const paths=(await adb(['shell','pm','path',pkg],5000)).trim().split(/\r?\n/);
    if(paths.length!==1||!/^package:\/data\/app\/[^\s]+\/base\.apk$/.test(paths[0]))throw new Error('Installed debug APK path ambiguous');
    const installedPath=paths[0].slice(8),installedHash=(await adb(['shell','sha256sum',installedPath],20000)).trim().split(/\s+/)[0];
    if(installedHash!==apk.apkSha256)throw new Error('Installed debug APK bytes differ from audited variant');
    record('installed-source-verified',{path:installedPath,apkSha256:installedHash});
    safe();record('force-stop-request-start');await adb(['shell','am','force-stop',pkg],5000);record('force-stop-completed');
    safe();record('owned-app-clear-request-start');const cleared=(await adb(['shell','pm','clear',pkg],10000)).trim();if(cleared!=='Success')throw new Error('Owned synthetic debug app data was not cleared');record('owned-app-clear-completed');
    const beforeClock=await clockAnchor(adb);record('clock-anchor-before',{anchor:beforeClock});
    safe();record('activity-start-request-start');
    const launch=(await adb(['shell','am','start','-W','-n',activity],Math.min(60000,budgetMs))).trim();
    if(/Error|Exception|does not exist/i.test(launch))throw new Error('Owned debug Activity launch failed: '+launch);
    record('activity-start-completed',{launch});
    const connected=await connectWebView(adb,signal);cdp=connected.cdp;guestPid=connected.pid;
    const readReady=()=>cdp.evaluate(`(() => ({url:location.href,documentReadyState:document.readyState,productScreen:document.querySelector('#app')?.dataset.screen||null,splashPresent:Boolean(document.querySelector('#app-splash')),minimalControlPresent:Boolean(document.querySelector('[data-diagnostic-control="minimal-webview"]'))}))()`);
    const readyDeadline=Math.min(Date.now()+30000,started+budgetMs-25000);
    do{
      ready=await readReady();
      if(ready.url.startsWith('https://localhost')&&ready.documentReadyState==='complete'&&(variant==='A'?Boolean(ready.productScreen&&!ready.splashPresent):ready.minimalControlPresent))break;
      await delay(250);
    }while(Date.now()<readyDeadline);
    const commonReady=ready.url.startsWith('https://localhost')&&ready.documentReadyState==='complete',variantReady=variant==='A'?Boolean(ready.productScreen&&!ready.splashPresent):ready.minimalControlPresent;
    record('webview-ready-observation',{ready,commonReady,productNativeReady:variant==='A'?variantReady:null,controlFixtureReady:variant==='B'?variantReady:null});
    if(variant==='A'&&commonReady&&variantReady){await cdp.evaluate('document.fonts.ready.then(() => true)');record('product-fonts-ready');}
    if(commonReady&&variantReady){foregroundWaitStarted=Date.now();record('original-foreground-15s-window-start');}
    else record('variant-ready-unavailable',{originalForegroundDeadlineStarted:false});
    gpu.push(await guestGpuObservation(adb,guestPid));
    while(Date.now()<started+budgetMs-20000){
      safe();
      const raw=await adb(['shell','dumpsys','window','displays'],10000);let currentFocus,parseError;
      try{currentFocus=actualDefaultDisplayFocus(raw);}catch(error){parseError=error.message;}
      let nativeAndroid=null;
      if(variant==='A'&&!nativeReadError)try{nativeAndroid=await cdp.evaluate(`typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'`);}
      catch(error){nativeReadError=error.message;record('native-webview-status-unavailable',{reason:nativeReadError});}
      const observation={atUtc:iso(),elapsedMs:Date.now()-started,elapsedSinceForegroundWaitMs:foregroundWaitStarted===null?null:Date.now()-foregroundWaitStarted,focus:currentFocus||null,ownedActivityFocus:Boolean(currentFocus?.includes(activity)),nativeAndroid,...(parseError?{parseError}:{})};focus.push(observation);
      if(currentFocus?.includes(activity)&&!firstForegroundAtUtc){firstForegroundAtUtc=observation.atUtc;record('first-owned-foreground');}
      if(currentFocus?.includes(`Application Not Responding: ${pkg}`)&&!firstAnrAtUtc){firstAnrAtUtc=observation.atUtc;record('first-anr-focus');}
      if(focus.length%10===0)gpu.push(await guestGpuObservation(adb,guestPid));
      const remaining=started+budgetMs-20000-Date.now();if(remaining<=0)break;await delay(Math.min(1000,remaining));
    }
    const afterClock=await clockAnchor(adb);record('clock-anchor-after',{anchor:afterClock});
    const afterAnr=await adb(['shell','dumpsys','activity','lastanr'],10000);writeFileSync(resolve(ctx.output,`trial-${trial}-lastanr-after.txt`),afterAnr);
    safe();record('trial-stop');
    return{trial,variant,events,focus,gpu,installedApkSha256:installedHash,firstForegroundAtUtc,firstAnrAtUtc,foregroundOriginal15sSatisfied:variant==='A'?foreground15sVerdict(focus,foregroundWaitStarted):null,controlFocus15sSatisfied:variant==='B'?foreground15sVerdict(focus,foregroundWaitStarted,{requireNativeAndroid:false}):null,
      firstWebViewDraw:{status:'requires-guest-trace-correlation'},splashAndNativeReadyComparable:false,anrHistoryPreserved:true};
  }catch(error){
    if(!error.safetyStop&&!signal.aborted&&Date.now()-started<budgetMs-5000)try{
      const afterAnr=await adb(['shell','dumpsys','activity','lastanr'],5000);writeFileSync(resolve(ctx.output,`trial-${trial}-lastanr-after.txt`),afterAnr);record('failure-lastanr-preserved');
    }catch(cause){record('failure-lastanr-unavailable',{reason:cause.message});}
    error.evidence={trial,variant,events,focus,gpu,firstForegroundAtUtc,firstAnrAtUtc,foregroundOriginal15sSatisfied:variant==='A'?foreground15sVerdict(focus,foregroundWaitStarted):null,controlFocus15sSatisfied:variant==='B'?foreground15sVerdict(focus,foregroundWaitStarted,{requireNativeAndroid:false}):null,firstWebViewDraw:{status:'requires-guest-trace-correlation'},anrHistoryPreserved:true};
    throw error;
  }finally{cdp?.close();}
}

async function main(env=process.env){
  if(process.platform!=='linux')throw new Error('One-shot Native diagnostic runs only on the isolated Linux emulator runner');
  const ctx=ownedContext(env);if(existsSync(ctx.output))throw new Error('Refuse existing diagnostic output directory');mkdirSync(ctx.output,{recursive:false});
  const signerA=await signerDigest(ctx.apksignerPath,ctx.manifest.variants.A.path),signerB=await signerDigest(ctx.apksignerPath,ctx.manifest.variants.B.path);
  if(signerA!==signerB)throw new Error('Diagnostic APK signing identities differ');
  const owned=assertHostOwner({emulatorPid:ctx.emulatorPid,avd:ctx.avd,device:ctx.device},{expectedStartTicks:ctx.owner.startTicks});ctx.ownerCommand=requireFrozenEmulatorControls(owned.command);
  requireLiveCollector({collector:ctx.collector,output:ctx.collectorOutput});
  const preflightAdb=await adbFactory({adbPath:ctx.adbPath,device:ctx.device,signal:AbortSignal.timeout(20000)});
  ctx.webview=webviewProviderIdentity((await preflightAdb(['shell','dumpsys','webviewupdate'],5000)).trim());ctx.guestVcpus=(await preflightAdb(['shell','nproc'],5000)).trim();
  if(!/^[1-9]\d*$/.test(ctx.guestVcpus))throw new Error('Require actual guest CPU count');
  const capacityPath=resolve(ctx.output,'host-capacity.jsonl'),trialPath=resolve(ctx.output,'trials.jsonl'),errors=[];
  const sampleCapacity=()=>{try{appendBounded(capacityPath,hostCapacitySnapshot(),32*1024*1024);}catch(error){errors.push(error.message);}};
  sampleCapacity();const timer=setInterval(sampleCapacity,1000);
  let report;
  try{report=await runFixedTrials({runTrial:input=>executeTrial(input,ctx,()=>errors.length>0),append:row=>appendBounded(trialPath,row)});}
  finally{clearInterval(timer);sampleCapacity();}
  const final={...report,toolsSource:ctx.toolsSource,device:ctx.device,avd:ctx.avd,emulatorOwner:ctx.owner,emulatorCommand:ctx.ownerCommand,webviewProvider:ctx.webview,guestVcpus:ctx.guestVcpus,apkSignerSha256:signerA,apkManifestSha256:sha256(readFileSync(env.ANDROID_DIAGNOSTIC_APK_MANIFEST)),collectorStart:ctx.collector,
    captureErrors:errors,needsV5CollectorStopAndGuestTraceCorrelation:true,diagnosticComplete:false,firstDrawUnverified:true};
  writeFileSync(resolve(ctx.output,'one-shot.json'),JSON.stringify(final,null,2)+'\n');
  console.log(JSON.stringify({appSource:APP_SOURCE,toolsSource:ctx.toolsSource,order:final.order,rows:final.rows.map(row=>({trial:row.trial,variant:row.variant,status:row.status})),nativeAcceptance:false,diagnosticComplete:false}));
  if(errors.length||final.rows.some(row=>row.status!=='recorded'))process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
