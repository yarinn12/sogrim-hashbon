import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {auditDiagnosticApks} from './apk-members.mjs';
import {requirePair,validateWarmPrelude} from './contract.mjs';
import {assertNoTargetAppAnr} from '../anr-diagnostics.mjs';
import {actualDefaultDisplayFocus} from '../orientation.mjs';
import {record,observedSpawnSync,stamp,boundedGuestClockAnchor,CLOCK_PROBE} from '../pages-restart-telemetry.mjs';
const pkg='com.sogrimhashbon.app.debug',activity=pkg+'/com.sogrimhashbon.app.MainActivity';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifiedDebugSigner(raw){
  const matches=[...raw.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/g)];
  if(matches.length!==1||!/Signer #1 certificate DN:.*CN=Android Debug(?:,|$)/m.test(raw))throw new Error('Require one verified Android Debug signer');
  return matches[0][1].toLowerCase();
}
export function verifyPairFiles(env,{audit=auditDiagnosticApks,run=spawnSync}={}){
  for(const key of ['ANDROID_WARM_PAIR_MANIFEST','ANDROID_WARM_PRODUCT_AUDIT','ANDROID_WARM_FIXTURE_RECEIPT','ANDROID_WARM_CONTROL_INDEX','APKSIGNER_PATH'])if(!env[key])throw new Error('Require '+key);
  const manifest=requirePair(JSON.parse(readFileSync(env.ANDROID_WARM_PAIR_MANIFEST,'utf8')));
  const fresh=audit({productApk:manifest.variants.A.path,controlApk:manifest.variants.B.path,controlIndex:env.ANDROID_WARM_CONTROL_INDEX,productAudit:env.ANDROID_WARM_PRODUCT_AUDIT,fixtureReceipt:env.ANDROID_WARM_FIXTURE_RECEIPT,python:env.SOGRIM_TEST_PYTHON||'python3'});
  requirePair(fresh);
  if(['A','B'].some(k=>fresh.variants[k].apkSha256!==manifest.variants[k].apkSha256)||fresh.productAuditSha256!==manifest.productAuditSha256||fresh.fixtureReceiptSha256!==manifest.fixtureReceiptSha256)throw new Error('Pair APK bytes or original c14 lineage changed');
  const signer=[];
  for(const arm of ['A','B']){
    const r=observedSpawnSync(run,env.APKSIGNER_PATH,['verify','--print-certs',fresh.variants[arm].path],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
    if(r.error||r.signal||r.status!==0)throw new Error('Actual APK signature verification failed');
    signer.push(verifiedDebugSigner(r.stdout));
  }
  if(signer[0]!==signer[1])throw new Error('Product/control APK certificates differ');
  return {manifest:fresh,signerSha256:signer[0],pairHashes:{A:fresh.variants.A.apkSha256,B:fresh.variants.B.apkSha256}};
}
export function installedApk(adb,expected){
  const paths=adb(['shell','pm','path',pkg]).trim().split(/\r?\n/);
  if(paths.length!==1||!/^package:\/data\/app\/[^\s]+\/base\.apk$/.test(paths[0]))throw new Error('Installed debug APK path missing or ambiguous');
  const path=paths[0].slice(8),sha256=adb(['shell','sha256sum',path]).trim().split(/\s+/)[0];
  if(sha256!==expected)throw new Error('Actual installed APK differs from verified variant');
  return {path,sha256};
}
export function matrixCleanupBoundary(phase,original){
  const output=process.env.ANDROID_WARM_CONTENT_OUTPUT;if(!output||!['start','complete'].includes(phase))throw new Error('Require explicit original matrix cleanup boundary');
  const path=join(output,'cleanup.json'),commands=Object.entries(original).map(([k,v])=>v==='null'?['shell','settings','delete','system',k]:['shell','settings','put','system',k,v]);commands.push(['shell','wm','user-rotation','lock',original.user_rotation==='null'?'0':original.user_rotation]);
  const marker=record('warm-matrix-cleanup-'+phase,{scope:'original-matrix-cleanup',commands});
  if(phase==='start')writeFileSync(path,JSON.stringify({complete:false,commands,startMarker:marker},null,2),{flag:'wx'});
  else{const prior=JSON.parse(readFileSync(path,'utf8'));if(prior.complete||JSON.stringify(prior.commands)!==JSON.stringify(commands))throw new Error('Original cleanup missing/repeated/mismatched');writeFileSync(path,JSON.stringify({...prior,complete:true,completionMarker:marker},null,2));}
}
export async function runWarmTarget({adb,launch,waitFor,results,onPage},env=process.env,{verifyPair=verifyPairFiles}={}){
  const output=env.ANDROID_WARM_CONTENT_OUTPUT,variant=env.ANDROID_WARM_CONTENT_ARM;
  if(!output||!['A','B'].includes(variant))throw new Error('Require isolated warm-content target and declared arm');
  const target={variant,rotationRequested:false,holdRequested:false,pmClearRequested:false,installerConfoundRetained:true,productNativeReady:null,controlFixtureReady:null,foregroundBeforeRotationReached:false,clockAnchors:[],nativeAcceptance:false};
  let page;
  const pid=()=>{const raw=adb(['shell','pidof',pkg]).trim();if(!/^[1-9]\d*$/.test(raw))throw new Error('Require one actual owned debug app PID');return Number(raw);};
  const anchor=label=>{const before=stamp(),raw=adb([...CLOCK_PROBE]),after=stamp();const a={label,...boundedGuestClockAnchor(before,after,raw)};target.clockAnchors.push(a);record('warm-target-clock',a);return a;};
  try{
    // Matrix has already executed its original font_scale=1 command and 750ms
    // sleep. No remainder of the six-case matrix or pages runs after this cut.
    record('warm-cut-after-original-font-write-and-750ms',{variant,scale:1,requestedCase:'landscape',targetRotationWillNotBeSent:true});
    const font=JSON.parse(readFileSync(join(output,'font-regression/font-regression.json'),'utf8'));
    target.prelude=validateWarmPrelude(results,font);if(!target.prelude.valid)throw new Error('Warm prelude requires exactly original 100% portrait 36 checks/one hold');
    const prefix=readFileSync(join(output,'logcat-live.log')),snapshot=adb(['logcat','-b','all','-d','-v','threadtime']);
    writeFileSync(join(output,'prelude-open-log-prefix.log'),prefix,{flag:'wx'});writeFileSync(join(output,'prelude-logcat-snapshot.log'),snapshot,{flag:'wx'});
    target.preludeHistory={prefixBytes:prefix.length,prefixSha256:hash(prefix),snapshotSha256:hash(Buffer.from(snapshot))};
    assertNoTargetAppAnr(prefix.toString()+'\n'+snapshot);target.preludeHistoryReady=true;
    target.cutPosture={fontScale:adb(['shell','settings','get','system','font_scale']).trim(),rotation:adb(['shell','wm','user-rotation']).trim(),accelerometer:adb(['shell','settings','get','system','accelerometer_rotation']).trim()};
    if(target.cutPosture.fontScale!=='1'||target.cutPosture.rotation!=='lock 0'||target.cutPosture.accelerometer!=='0')throw new Error('Original warm font/portrait posture readback differs at cut');
    target.cutPostureVerified=true;
    const pair=verifyPair(env);target.pairHashes=pair.pairHashes;target.signerSha256=pair.signerSha256;target.pairVerified=true;
    writeFileSync(join(output,'fresh-pair-at-cut.json'),JSON.stringify(pair,null,2),{flag:'wx'});
    target.warmInstalled=installedApk(adb,pair.pairHashes.A);target.warmPid=pid();
    target.bootId=anchor('before-reinstall').bootId;
    const apk=pair.manifest.variants[variant];record('warm-symmetric-install-r-start',{variant,apkSha256:apk.apkSha256});
    const installed=adb(['install','-r',apk.path]);if(!/^Success\s*$/m.test(installed))throw new Error('Symmetric install-r did not acknowledge Success');
    target.installed=installedApk(adb,apk.apkSha256);target.installVerified=true;record('warm-symmetric-install-r-complete',target.installed);
    env.ANDROID_WARM_CONTENT_TARGET=variant;
    page=await launch(value=>{page=value;onPage?.(value);});onPage?.(page);target.newPid=pid();
    const deadline=Date.now()+15000;
    target.foregroundObservations=[];
    await waitFor(async()=>{
      const expression=variant==='A'?`({native:Capacitor.isNativePlatform(),platform:Capacitor.getPlatform(),ready:Boolean(document.querySelector('#app')?.dataset.screen&&!document.querySelector('#app-splash'))})`:`({ready:document.readyState==='complete'&&Boolean(document.querySelector('[data-diagnostic-control="minimal-webview"]'))})`;
      const readiness=await page.evaluate(expression),nativeDisplayRaw=adb(['shell','dumpsys','window','displays']),focus=actualDefaultDisplayFocus(nativeDisplayRaw);
      const observation={...stamp(),focus,nativeDisplayRaw,readiness};target.foregroundObservations.push(observation);
      return focus.includes(activity)&&readiness.ready&&(variant==='B'||readiness.native===true&&readiness.platform==='android');
    },'Actual owned QA Activity foreground before rotation',deadline-Date.now());
    target.foregroundBeforeRotationReached=true;
    if(variant==='A'){target.capabilities=await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()');target.productNativeReady=Math.abs(target.capabilities.fontScale-1)<.01;if(!target.productNativeReady)throw new Error('Product Native fontScale is not original 100%');}
    else target.controlFixtureReady=true;
  }catch(error){target.error=String(error.stack||error);if(error.anrEvidence)target.preludeAnrEvidence=error.anrEvidence;record('warm-target-error',{error:target.error});}
  finally{
    if(target.installVerified&&!target.newPid)try{target.newPid=pid();}catch(error){target.pidError=String(error);}
    try{anchor('after-target');}catch(error){target.clockError=String(error);}
    target.clockAnchorsComplete=target.clockAnchors.length===2&&target.clockAnchors[0].bootId===target.clockAnchors[1].bootId&&BigInt(target.clockAnchors[1].guestLoNs)>=BigInt(target.clockAnchors[0].guestLoNs);
    delete env.ANDROID_WARM_CONTENT_TARGET;
    page?.close();record('warm-target-observation-finished',{variant,newPid:target.newPid??null});writeFileSync(join(output,'target.json'),JSON.stringify(target,null,2),{flag:'wx'});
  }
  return target;
}
