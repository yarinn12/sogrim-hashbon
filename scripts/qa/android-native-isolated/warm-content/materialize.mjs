import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {APP_SOURCE,APP_TREE} from './apk-members.mjs';
import {instrumentDriver,sha} from '../pages-restart-materialize.mjs';
const here=dirname(fileURLToPath(import.meta.url));
function once(source,needle,replacement){if(source.split(needle).length!==2)throw new Error('Frozen warm-content anchor missing or ambiguous');return source.replace(needle,replacement);}
export function instrumentWarmDriver(original,telemetryUrl){
  let text=instrumentDriver(original,telemetryUrl);
  text=once(text,'export async function launch() {','export async function launch(onWarmPage) {');
  text=once(text,"  catch { adb(['shell', 'am', 'start', '-n', `${packageName}/com.sogrimhashbon.app.MainActivity`]); }", "  catch(error) { if(process.env.ANDROID_WARM_CONTENT_TARGET)throw error; adb(['shell', 'am', 'start', '-n', `${packageName}/com.sogrimhashbon.app.MainActivity`]); }");
  text=once(text,"  const cdp = await connect(); await cdp.command('Runtime.enable');", "  const cdp = await connect(); if(process.env.ANDROID_WARM_CONTENT_TARGET)onWarmPage?.(cdp); await cdp.command('Runtime.enable');");
  text=once(text,"Boolean(document.querySelector('#app')?.dataset.screen && !document.querySelector('#app-splash'))", "(globalThis.__warmMinimalControl===true ? false : Boolean(document.querySelector('#app')?.dataset.screen && !document.querySelector('#app-splash')))");
  // Choose at the host, not from an untrusted page global. Warm-up remains the
  // exact original product expression; only the B target gets minimal readiness.
  text=once(text,"  await waitFor(() => cdp.evaluate(`(globalThis.__warmMinimalControl===true ? false : Boolean(document.querySelector('#app')?.dataset.screen && !document.querySelector('#app-splash')))`), 'Application screen', 30000);", "  const warmControl=process.env.ANDROID_WARM_CONTENT_TARGET==='B';\n  await waitFor(() => cdp.evaluate(warmControl ? `document.readyState==='complete' && Boolean(document.querySelector('[data-diagnostic-control=\"minimal-webview\"]'))` : `Boolean(document.querySelector('#app')?.dataset.screen && !document.querySelector('#app-splash'))`),warmControl?'Minimal control screen':'Application screen',30000);");
  text=once(text,'await cdp.evaluate(`${cardInputTraceInstallExpression}; document.fonts.ready.then(() => true)`);',"await cdp.evaluate(warmControl?'document.fonts.ready.then(() => true)':`${cardInputTraceInstallExpression}; document.fonts.ready.then(() => true)`);\n  record('warm-content-variant-dom-ready',{variant:warmControl?'B':'A',nativeReadinessComparable:false});");
  return text;
}
export function instrumentWarmMatrix(original,targetUrl){
  let text=`import {runWarmTarget,matrixCleanupBoundary} from ${JSON.stringify(targetUrl)};\n`+original.replaceAll('\r\n','\n');
  const loop="for(const scale of [1,1.5,2])for(const [orientation,rotation] of [['portrait',0],['landscape',1]]){";
  text=once(text,loop,'warmReplay: '+loop);
  const cut='      const oriented=await launchForOwnedOrientation({launch,adb,waitFor,orientation,rotation,timeout:15000,onPage:value=>{page=value;}});row.rotationReceipt=oriented.receipt;';
  text=once(text,cut,"      if(scale===1&&orientation==='landscape'){row.warmContentCut=true;await runWarmTarget({adb,launch,waitFor,results,onPage:value=>{page=value;}});break warmReplay;}\n"+cut);
  text=once(text,"}finally{\n  page?.close();for(const [key,value] of Object.entries(original))adb(","}finally{\n  matrixCleanupBoundary('start',original);page?.close();for(const [key,value] of Object.entries(original))adb(");
  text=once(text,"  writeFileSync(resolve(out,'matrix.json'),JSON.stringify({provenance,original,results},null,2));process.exitCode=matrixExitCode(results);", "  matrixCleanupBoundary('complete',original);\n  writeFileSync(resolve(out,'matrix.json'),JSON.stringify({provenance,original,results},null,2));process.exitCode=matrixExitCode(results);");
  return text;
}
export function materializeWarmHarness({root,output},git=args=>execFileSync('git',['-C',root,...args])){
  if(git(['rev-parse','HEAD']).toString().trim()!==APP_SOURCE||git(['rev-parse','HEAD^{tree}']).toString().trim()!==APP_TREE)throw new Error('Require frozen c14 HEAD/tree');
  const changed=git(['diff','--name-only','HEAD']).toString().trim().split(/\r?\n/).filter(Boolean),generated=new Set(['android/app/capacitor.build.gradle','android/capacitor.settings.gradle','ios/App/CapApp-SPM/Package.swift']);
  if(changed.some(p=>!generated.has(p)))throw new Error('Unexpected application source changes');
  const prefix='scripts/qa/android-native-isolated/',paths=git(['ls-tree','-r','--name-only',APP_SOURCE,'--',prefix]).toString().trim().split(/\r?\n/);
  if(paths.length!==37||paths.some(p=>!p.startsWith(prefix)||p.slice(prefix.length).includes('/')))throw new Error('Require original 37 flat c14 helpers');
  const dest=join(output,'generated-harness');mkdirSync(dest,{recursive:true});const bindings=[];
  for(const path of paths){const name=path.slice(prefix.length),original=git(['show',APP_SOURCE+':'+path]);let bytes=original;
    if(name==='driver.mjs')bytes=Buffer.from(instrumentWarmDriver(original.toString(),pathToFileURL(join(here,'../pages-restart-telemetry.mjs')).href));
    if(name==='matrix.mjs')bytes=Buffer.from(instrumentWarmMatrix(original.toString(),pathToFileURL(join(here,'target.mjs')).href));
    writeFileSync(join(dest,name),bytes,{flag:'wx'});bindings.push({path,originalSha256:sha(original),localRawSha256:sha(readFileSync(join(root,path))),generatedSha256:sha(bytes),instrumented:bytes!==original});
  }
  writeFileSync(join(output,'harness-bindings.json'),JSON.stringify({source:APP_SOURCE,tree:APP_TREE,bindings,nativeAcceptance:false},null,2),{flag:'wx'});return dest;
}
