import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseProcStat} from './trace-diagnostics.mjs';
import {readRendererSdk} from './renderer-capabilities.mjs';
import {readAsgSdk,ASG_PROPERTIES} from './gltransport.mjs';
import {assertSwangleRenderer,selectionRecord} from '../android-swangle-compatibility/renderer.mjs';
import {captureLoadedSdk} from '../android-swangle-compatibility/loaded-sdk.mjs';
import {readSdkReference,compareSdkBinaries} from '../android-swangle-compatibility/contract.mjs';
import {verifyTransport} from '../android-swangle-compatibility/transport.mjs';
import {guardedAdb} from '../android-swangle-compatibility/owned.mjs';

const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const reference=()=>readSdkReference(readFileSync(new URL('../android-swangle-compatibility/reference-sdk-binaries.json',import.meta.url)));
export function requireSourceIdentity(env,appHead,toolsHead,recordedTools){
  assert.ok(/^[a-f0-9]{40}$/.test(env.ANDROID_QA_SOURCE||''),'Require exact application source');
  assert.ok(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''),'Require exact QA tools source');
  assert.equal(appHead,env.ANDROID_QA_SOURCE,'Application checkout differs');
  assert.equal(toolsHead,env.GITHUB_SHA,'QA tools checkout differs');assert.equal(recordedTools,toolsHead,'QA tools receipt differs');
  assert.equal(env.ANDROID_QA_DEVICE,'emulator-5582');assert.match(env.ANDROID_QA_AVD||'',/^sogrim_ci_\d+_\d+$/);
  assert.ok(isAbsolute(env.ANDROID_HOME||''),'Require explicit SDK');
  assert.equal(env.ADB_PATH,join(resolve(env.ANDROID_HOME),'platform-tools/adb'));
  return {source:appHead,toolsSource:toolsHead,device:env.ANDROID_QA_DEVICE,avd:env.ANDROID_QA_AVD,sdk:resolve(env.ANDROID_HOME),requestedGpu:'swangle'};
}
export function readNativeSwangleOwner(context,{read=readFileSync}={}){
  assert.ok(Number.isSafeInteger(context.pid)&&context.pid>1);assert.match(context.avd||'',/^sogrim_ci_\d+_\d+$/);assert.ok(isAbsolute(context.sdk));
  const stat=()=>parseProcStat(read('/proc/'+context.pid+'/stat','utf8'));
  const before=stat(),command=read('/proc/'+context.pid+'/cmdline','utf8').split('\0').filter(Boolean),after=stat();
  assert.equal(before.pid,context.pid);assert.equal(after.pid,context.pid);assert.equal(after.startTicks,before.startTicks,'Emulator PID changed during observation');
  if(context.startTicks!==undefined)assert.equal(before.startTicks,context.startTicks,'Refuse reused emulator PID');
  assert.ok([join(context.sdk,'emulator/emulator'),join(context.sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64-headless')].includes(command[0]),'Foreign emulator executable');
  for(const [flag,value] of Object.entries({'-avd':context.avd,'-port':'5582','-gpu':'swangle','-feature':'GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory':'4096','-cores':'2'})){
    assert.equal(command.filter(v=>v===flag).length,1,'Missing/duplicate emulator option: '+flag);assert.equal(command[command.indexOf(flag)+1],value,'Unexpected emulator option: '+flag);
  }
  return {pid:context.pid,startTicks:before.startTicks,command};
}
function commandEnvironment(env){
  assert.ok(isAbsolute(env.RUNNER_TEMP||''),'Require private runner temporary root');
  const androidHome=join(env.RUNNER_TEMP,'android-native-home'),home=join(env.RUNNER_TEMP,'android-native-renderer-home');mkdirSync(home,{recursive:true,mode:0o700});
  for(const [key,value] of Object.entries({ANDROID_USER_HOME:androidHome,ANDROID_EMULATOR_HOME:androidHome,ADB_VENDOR_KEYS:join(androidHome,'adbkey'),ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037'}))assert.equal(env[key],value,'Unexpected owned ADB environment: '+key);
  return {PATH:env.PATH,HOME:home,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC',SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1',ANDROID_HOME:env.ANDROID_HOME,ANDROID_SDK_ROOT:env.ANDROID_HOME,ANDROID_USER_HOME:androidHome,ANDROID_EMULATOR_HOME:androidHome,ADB_VENDOR_KEYS:join(androidHome,'adbkey'),ANDROID_ADB_SERVER_PORT:'5037',ADB_SERVER_SOCKET:'tcp:5037'};
}
function requireRun(run,label){assert.ok(run.status===0&&!run.error&&!run.signal,label+' failed: '+String(run.stderr??run.error?.message??'').slice(0,2000));return String(run.stdout??'');}
function fingerprint(sdk,env){
  const file=fileURLToPath(new URL('../android-swangle-compatibility/artifact.py',import.meta.url)),options={encoding:'utf8',env,timeout:30000,maxBuffer:8*1024*1024,windowsHide:true};
  requireRun(spawnSync('python3',['-I','-B',file,'verify-sdk',sdk],options),'Official SDK configuration');
  return JSON.parse(requireRun(spawnSync('python3',['-I','-B',file,'fingerprint-sdk',sdk],options),'SDK fingerprint'));
}
function head(path,env){return requireRun(spawnSync('git',['-C',path,'rev-parse','HEAD'],{env,encoding:'utf8',windowsHide:true,timeout:10000}),'Git identity').trim();}
export function requireRendererPair(before,after){
  for(const proof of [before,after])assert.ok(proof?.verified===true&&proof.gpu==='swangle'&&proof.loadedLibrariesVerified===true,'Missing actual SwANGLE library proof');
  assert.deepEqual(after.libraries.owner,before.libraries.owner,'Renderer proof changed emulator identity');return true;
}
export async function runNativePhase(phase,env=process.env,{cwd=process.cwd(),getHead=head,getFingerprint=fingerprint,getRendererSdk=readRendererSdk,getAsgSdk=readAsgSdk,getOwner=readNativeSwangleOwner,capture=captureLoadedSdk,getReference=reference,getGuest}={}){
  assert.ok(['snapshot','pin-owner','verify','verify-after'].includes(phase),'Require explicit Native renderer phase');
  const out=resolve(cwd,'artifacts/android-native-isolated');mkdirSync(out,{recursive:true});const statePath=join(out,'native-swangle-state.json');
  let state,selected,transport;const report={phase,compatible:false,verified:false,startedAtUtc:new Date().toISOString()};
  try{
    const operational=commandEnvironment(env),identity=requireSourceIdentity(env,getHead(cwd,operational),getHead(env.GITHUB_WORKSPACE,operational),readFileSync(join(out,'qa-tools-source.txt'),'utf8').trim());Object.assign(report,identity);
    const expected=getReference(),sdk=getRendererSdk(identity.sdk),asg=getAsgSdk(identity.sdk);
    if(phase==='snapshot'){
      assert.ok(!existsSync(statePath),'Refuse prior renderer state');const inventory=getFingerprint(identity.sdk,operational);compareSdkBinaries(expected,inventory);
      state={identity,sdk,asg,inventory,prepared:true};report.prepared=true;save(join(out,'renderer-sdk.json'),{...identity,sdk,prepared:true});save(join(out,'transport-sdk.json'),{...identity,sdk:asg,prepared:true});
    }else{
      state=readJson(statePath);assert.equal(state.prepared,true);assert.ok(!state.failed,'Prior renderer phase failed');assert.deepEqual(state.identity,identity,'Renderer source/device identity changed');assert.deepEqual(state.sdk,sdk,'Renderer SDK changed');assert.deepEqual(state.asg,asg,'ASG SDK changed');
      const pid=Number(readFileSync(join(out,'emulator.pid'),'utf8').trim());assert.equal(pid,Number(env.ANDROID_QA_EMULATOR_PID));const context={pid,avd:identity.avd,sdk:identity.sdk,startTicks:state.owner?.startTicks};
      const owner=getOwner(context);
      if(phase==='pin-owner'){assert.ok(!state.owner,'Refuse replacement owner');state.owner=owner;report.ownerPinned=true;}
      else{
        assert.ok(state.owner,'Missing launch-time emulator identity');assert.equal(owner.pid,state.owner.pid);assert.equal(owner.startTicks,state.owner.startTicks);
        if(phase==='verify')assert.ok(!state.before,'Refuse repeated before-workload proof');else{assert.ok(state.before&&!state.after,'Require one before/after workload sequence');const afterSdk=getFingerprint(identity.sdk,operational);save(join(out,'swangle-sdk-after.json'),afterSdk);compareSdkBinaries(state.inventory,afterSdk);compareSdkBinaries(expected,afterSdk);report.sdkAfter={files:afterSdk.files.length,unchanged:true};}
        const loaded=await capture({...context,startTicks:state.owner.startTicks},state.inventory,expected,{owner:getOwner});const {rawExe,rawMaps,...loadedReceipt}=loaded;
        save(join(out,phase==='verify'?'loaded-sdk-identity.json':'loaded-sdk-after-identity.json'),loadedReceipt);
        const log=readFileSync(join(out,'emulator.log'),'utf8');selected=assertSwangleRenderer(log,loadedReceipt,expected,owner);
        const readGuest=getGuest??(ctx=>Object.fromEntries(ASG_PROPERTIES.map(key=>{
          const rows=[];const r=guardedAdb(ctx,['-s','emulator-5582','shell','getprop',key],{},args=>spawnSync(env.ADB_PATH,args,{env:operational,encoding:'utf8',timeout:20000,windowsHide:true}),{owner:getOwner,record:row=>rows.push(row)});
          save(join(out,'swangle-getprop-'+key+'.json'),rows);assert.ok(!r.stderr?.trim(),'ASG read returned stderr');return [key,requireRun(r,'ASG property '+key).trim()];
        })));
        transport=verifyTransport(log,readGuest({...context,startTicks:state.owner.startTicks}),loadedReceipt,expected,owner);
        assert.deepEqual(getOwner({...context,startTicks:state.owner.startTicks}),owner,'Owner changed after renderer checks');
        if(phase==='verify')state.before=selected;else{requireRendererPair(state.before,selected);state.after=selected;}
        Object.assign(report,{compatible:true,verified:true,renderer:selected,transport,owner});
      }
    }
    save(statePath,state);
  }catch(error){report.error=error.stack;if(state){state.failed=true;state.error=error.message;save(statePath,state);}}
  report.completedAtUtc=new Date().toISOString();
  const name=phase==='snapshot'?'swangle-preparation.json':phase==='pin-owner'?'swangle-owner.json':phase==='verify'?'renderer-capabilities.json':'renderer-after.json';save(join(out,name),report);
  if(phase==='verify'||phase==='verify-after'){
    save(join(out,phase==='verify'?'effective-renderer.json':'effective-renderer-after.json'),{source:report.source,toolsSource:report.toolsSource,...selectionRecord(selected,report.error)});
    save(join(out,phase==='verify'?'effective-transport.json':'effective-transport-after.json'),{source:report.source,toolsSource:report.toolsSource,...transport,verified:report.verified,error:report.error});
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runNativePhase(process.argv[2]).then(report=>{console.log(JSON.stringify({phase:report.phase,source:report.source,toolsSource:report.toolsSource,prepared:report.prepared,ownerPinned:report.ownerPinned,verified:report.verified,error:report.error}));if(report.error)process.exitCode=1;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
