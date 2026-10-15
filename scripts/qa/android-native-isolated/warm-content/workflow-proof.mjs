import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync,statSync,lstatSync,mkdirSync,existsSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {APP_SOURCE,APP_TREE} from './apk-members.mjs';
import {verifyPairFiles} from './target.mjs';
import {readAsgSdk} from '../gltransport.mjs';
import {observedSpawnSync} from '../pages-restart-telemetry.mjs';
const here=dirname(fileURLToPath(import.meta.url)),toolsRoot=resolve(here,'../../../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:'pipe',timeout:10000,windowsHide:true}).trim();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sourceFiles=['android/app/capacitor.build.gradle','android/capacitor.settings.gradle','ios/App/CapApp-SPM/Package.swift'];
export function actualFile(path,{inside}={}){
  if(!isAbsolute(path))throw new Error('Require absolute actual file');
  const real=realpathSync(path);if(lstatSync(path).isSymbolicLink()||!statSync(real).isFile())throw new Error('Refuse symlink/non-file proof input');
  if(inside){const rel=relative(realpathSync(inside),real);if(rel===''||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw new Error('Actual file escapes the declared owned root');}
  const before=statSync(real);if(!before.size)throw new Error('Require nonempty actual proof input');
  const fd=openSync(real,'r'),digest=createHash('sha256'),chunk=Buffer.allocUnsafe(1024*1024);let bytes=0;
  try{let n;while((n=readSync(fd,chunk,0,chunk.length,null))>0){digest.update(chunk.subarray(0,n));bytes+=n;}}finally{closeSync(fd);}
  const after=statSync(real);if(bytes!==before.size||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error('Actual proof input changed during hashing');
  return {path:real,bytes,sha256:digest.digest('hex')};
}
export function requireOneShot(env){
  if(env.GITHUB_REPOSITORY!=='yarinn12/sogrim-hashbon'||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF!=='refs/heads/codex/android-warm-content-abba-20261016'||env.GITHUB_WORKFLOW_REF!=='yarinn12/sogrim-hashbon/.github/workflows/android-warm-content-abba-20261016.yml@refs/heads/codex/android-warm-content-abba-20261016'||env.GITHUB_RUN_NUMBER!=='1'||env.GITHUB_RUN_ATTEMPT!=='1'||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw new Error('Require exact one-shot workflow identity');
  return true;
}
export function validateActualSdk(sdkHome,{run=spawnSync}={}){
  if(!isAbsolute(sdkHome))throw new Error('Require absolute installed Android SDK');
  const root=realpathSync(sdkHome),paths={adb:join(root,'platform-tools/adb'),emulator:join(root,'emulator/emulator'),aapt:join(root,'build-tools/36.1.0/aapt'),apksigner:join(root,'build-tools/36.1.0/apksigner'),signerJar:join(root,'build-tools/36.1.0/lib/apksigner.jar')};
  const files={};for(const[k,p]of Object.entries(paths)){
    files[k]=actualFile(p,{inside:root});const bytes=readFileSync(p);
    if(['adb','emulator','aapt'].includes(k)&&!bytes.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])))throw new Error('Actual Linux SDK ELF binary required: '+k);
    if(k==='apksigner'&&!bytes.subarray(0,2).equals(Buffer.from('#!')))throw new Error('Actual SDK apksigner launcher required');
    if(k==='signerJar'&&!bytes.subarray(0,2).equals(Buffer.from('PK')))throw new Error('Actual SDK signer JAR required');
    if(k!=='signerJar'&&(statSync(p).mode&0o111)===0)throw new Error('Actual SDK tool is not executable: '+k);
  }
  const sdk=readAsgSdk(root),versions={},imageRoot=join(root,'system-images/android-36.1/google_apis_playstore/x86_64'),imageFiles={};
  for(const name of ['kernel-ranchu','ramdisk.img','system.img','vendor.img'])imageFiles[name]=actualFile(join(imageRoot,name),{inside:root});
  const platformJar=actualFile(join(root,'platforms/android-36/android.jar'),{inside:root});
  for(const[k,args]of [['adb',['version']],['emulator',['-version']],['apksigner',['version']]]){
    const r=observedSpawnSync(run,paths[k],args,{encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024});
    if(r.status!==0||r.signal||r.error||!String(r.stdout).trim())throw new Error('Actual SDK version command failed: '+k);
    const raw=String(r.stdout),pattern=k==='adb'?/Android Debug Bridge version\s+([\d.]+)/:k==='emulator'?/Android emulator version\s+([\d.]+)/:/^(\d+(?:\.\d+)+)\s*$/;
    const match=pattern.exec(raw);if(!match)throw new Error('Actual SDK version protocol differs: '+k);
    // Raw stdout/stderr are already retained in the command journal. Compare
    // stable versions and actual file hashes, not SDK crash-log temporary paths.
    versions[k]=match[1];
  }
  return {root,paths,files,sdk,versions,imageFiles,platformJar};
}
export function requireStableProof(current,expected){
  for(const key of ['source','tree','toolsSource','toolsTree','inputFiles','sdk','pairHashes','signerSha256','canonicalA'])if(!equal(current[key],expected[key]))throw new Error('Frozen warm-content proof changed: '+key);
  return true;
}
export function requireAppCheckout(root){
  const source=git(root,'rev-parse','HEAD'),tree=git(root,'rev-parse','HEAD^{tree}');if(source!==APP_SOURCE||tree!==APP_TREE)throw new Error('Actual application HEAD/tree must be frozen c14');
  const changed=git(root,'diff','--name-only','HEAD').split(/\r?\n/).filter(Boolean);if(changed.some(p=>!sourceFiles.includes(p)))throw new Error('Unexpected tracked application changes');
  return {source,tree,generatedChanges:changed};
}
function requireTools(env){
  if(realpathSync(env.GITHUB_WORKSPACE)!==realpathSync(toolsRoot)||git(toolsRoot,'rev-parse','HEAD')!==env.GITHUB_SHA||env.GITHUB_SHA===APP_SOURCE)throw new Error('Actual separate tools checkout differs from guarded workflow');
  const paths=git(toolsRoot,'ls-tree','-r','--name-only','HEAD','--','scripts/qa/android-native-isolated').split(/\r?\n/).filter(Boolean);
  for(const path of paths){const canonical=execFileSync('git',['-C',toolsRoot,'show','HEAD:'+path]);if(!readFileSync(join(toolsRoot,path)).equals(canonical))throw new Error('Actual tools bytes differ from immutable Git blob: '+path);}
  const originals=git(toolsRoot,'ls-tree','-r','--name-only',APP_SOURCE,'--','scripts/qa/android-native-isolated').split(/\r?\n/).filter(Boolean);if(originals.length!==37)throw new Error('Require original 37 c14 helpers');
  for(const path of originals)if(git(toolsRoot,'rev-parse','HEAD:'+path)!==git(toolsRoot,'rev-parse',APP_SOURCE+':'+path))throw new Error('Original c14 helper changed in tools');
  return {toolsSource:env.GITHUB_SHA,toolsTree:git(toolsRoot,'rev-parse','HEAD^{tree}')};
}
export function bindWorkflowInputs(env,{run=spawnSync,platform=process.platform}={}){
  if(platform!=='linux'||env.ANDROID_WARM_CONTENT_RUN!=='reviewed-diagnostic-only'||env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD!=='1'||env.ANDROID_QA_DEVICE!=='emulator-5582'||env.ANDROID_QA_SOURCE!==APP_SOURCE)throw new Error('Require guarded isolated Linux warm-content workflow');
  requireOneShot(env);
  const tools=requireTools(env),build=realpathSync(env.ANDROID_WARM_BUILD_ROOT),app=requireAppCheckout(process.cwd());requireAppCheckout(build);
  const pairRoot=join(build,'artifacts/android-native-isolated/warm-content-apks');
  const expected={ANDROID_WARM_PAIR_MANIFEST:join(pairRoot,'manifest.json'),ANDROID_WARM_PRODUCT_AUDIT:join(build,'artifacts/android-native-isolated/apk-assets.json'),ANDROID_WARM_FIXTURE_RECEIPT:join(build,'artifacts/android-native-isolated/fixture-provenance.json'),ANDROID_WARM_CONTROL_INDEX:join(here,'control-index.html')};
  const inputFiles={};for(const[k,path]of Object.entries(expected)){
    if(resolve(env[k]||'')!==resolve(path))throw new Error('Require actual canonical proof input path: '+k);
    inputFiles[k]=actualFile(path,{inside:k==='ANDROID_WARM_CONTROL_INDEX'?toolsRoot:build});
  }
  const sdk=validateActualSdk(env.ANDROID_HOME,{run});
  if(realpathSync(env.ADB_PATH)!==sdk.paths.adb||realpathSync(env.APKSIGNER_PATH)!==sdk.paths.apksigner)throw new Error('ADB/signer must be actual tools from this SDK');
  const declared=JSON.parse(readFileSync(expected.ANDROID_WARM_PAIR_MANIFEST,'utf8'));
  for(const[k,n]of [['A','product.apk'],['B','control.apk']]){
    const path=join(pairRoot,n);if(resolve(declared.variants?.[k]?.path||'')!==path)throw new Error('Require actual original one-build pair APK path');
    inputFiles[k]=actualFile(path,{inside:pairRoot});
  }
  const pair=verifyPairFiles(env,{run});
  const localApk=actualFile(join(process.cwd(),'android/app/build/outputs/apk/debug/app-debug.apk'),{inside:process.cwd()});
  if(localApk.sha256!==pair.pairHashes.A)throw new Error('Actual canonical local APK must be the original A warm-up APK');
  const python=env.SOGRIM_TEST_PYTHON||'python3',args=[join(here,'canonical-apk.py'),build,inputFiles.A.path,expected.ANDROID_WARM_PRODUCT_AUDIT,expected.ANDROID_WARM_FIXTURE_RECEIPT];
  const canonical=observedSpawnSync(run,python,args,{encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024,windowsHide:true});
  if(canonical.status!==0||canonical.signal||canonical.error)throw new Error('Actual canonical A Git/APK audit failed: '+canonical.stderr);
  const canonicalA=JSON.parse(canonical.stdout);if(canonicalA.ready!==true||canonicalA.actualApkSha256!==pair.pairHashes.A||canonicalA.source!==APP_SOURCE||canonicalA.tree!==APP_TREE||canonicalA.assets!==215||canonicalA.canonicalGitAssets!==204||canonicalA.fonts!==13)throw new Error('Canonical actual APK proof differs');
  const badging=observedSpawnSync(run,sdk.paths.aapt,['dump','badging',inputFiles.A.path],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
  if(badging.status!==0||badging.error||badging.signal||!badging.stdout.includes("package: name='com.sogrimhashbon.app.debug' versionCode='190' versionName='4.58-debug'"))throw new Error('Actual canonical Debug package/version proof differs');
  return {...app,...tools,inputFiles,sdk,pairHashes:pair.pairHashes,signerSha256:pair.signerSha256,canonicalA,localApk,nativeAcceptance:false};
}
async function main(){
  const [mode,output]=process.argv.slice(2);if(!['master','arm-before','arm-after','final'].includes(mode)||!output||!isAbsolute(output))throw new Error('Require declared proof phase and absolute fresh output');
  if(existsSync(output))throw new Error('Refuse proof overwrite/retry');mkdirSync(dirname(output),{recursive:true});process.env.ANDROID_RESTART_COMMAND_EVIDENCE=output+'.commands';
  const report={mode,atUtc:new Date().toISOString(),ready:false,nativeAcceptance:false};
  try{Object.assign(report,bindWorkflowInputs(process.env));if(mode!=='master'){const expected=JSON.parse(readFileSync(process.env.ANDROID_WARM_MASTER_PROOF,'utf8'));if(expected.ready!==true||expected.mode!=='master')throw new Error('Original successful master proof required');requireStableProof(report,expected);}report.ready=true;}
  catch(error){report.error=String(error.stack||error);process.exitCode=1;}
  finally{writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({mode,ready:report.ready,error:report.error,nativeAcceptance:false}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
