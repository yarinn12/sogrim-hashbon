import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const requiredFeatures=['GlDirectMem','HasSharedSlotsHostMemoryAllocator'];
const iniFeatures=['GLDirectMem','HasSharedSlotsHostMemoryAllocator','GLDMA','GLDMA2'];

export function assertRendererCapabilities(log){
  if(typeof log!=='string')throw new Error('Require actual verbose emulator renderer evidence');
  const observations=Object.fromEntries(requiredFeatures.map(name=>[name,[]]));
  for(const line of log.split(/\r?\n/)){
    const row=/^\s*(?:DEBUG|VERBOSE)\s*\|\s*gfxstreamFeature:(GlDirectMem|HasSharedSlotsHostMemoryAllocator)\s*=\s*([01])\s*$/.exec(line);
    if(row)observations[row[1]].push(Number(row[2]));
  }
  const unsupported=requiredFeatures.filter(name=>observations[name].length!==1||observations[name][0]!==1);
  if(unsupported.length){
    const error=new Error(`Renderer did not acknowledge required DMA capabilities: ${unsupported.join(', ')}`);
    error.capabilities={compatible:false,observations};throw error;
  }
  return {compatible:true,observations};
}

function oneRendererLine(log,regex,label){
  const rows=[...log.matchAll(regex)];
  if(rows.length!==1)throw new Error(`Missing or ambiguous renderer evidence: ${label}`);
  return rows[0].slice(1);
}

// The adapter alone says SwiftShader in both measured arms. Require the actual
// selected GLES mode and renderer, while Vulkan remains inactive.
export function assertRendererSelection(log){
  if(typeof log!=='string')throw new Error('Require actual verbose emulator renderer evidence');
  const [backend]=oneRendererLine(log,/^INFO\s*\|\s*Graphics backend:\s*(\S+)\s*$/gm,'backend');
  const [vulkanMode,glesMode]=oneRendererLine(log,
    /^INFO\s*\|\s*emuglConfig_init: vulkan_mode_selected:(\S+) gles_mode_selected:(\S+)\s*$/gm,
    'selected modes');
  const [renderer]=oneRendererLine(log,/^DEBUG\s*\|\s*setCurrentRenderer:\s*(.+?)\s*$/gm,'current renderer');
  const [vulkanActive]=oneRendererLine(log,/^DEBUG\s*\|\s*gfxstreamFeature:Vulkan = ([01])\s*$/gm,
    'Vulkan activation');
  const [adapter]=oneRendererLine(log,/^INFO\s*\|\s*Graphics Adapter (?!Vendor)(.+?)\s*$/gm,'adapter');
  const [api]=oneRendererLine(log,/^INFO\s*\|\s*Graphics API Version (.+?)\s*$/gm,'API');
  const selection={backend,vulkanMode,glesMode,vulkanActive:Number(vulkanActive),adapter,api};
  if(backend!=='gfxstream'||vulkanMode!=='swiftshader'||glesMode!=='swiftshader'||
     renderer!=='swiftshader swiftshader gles:Swiftshader Indirect vulkan:Swiftshader Indirect'||
     vulkanActive!=='0'||!/SwiftShader/i.test(adapter)||
     !/OpenGL ES 3\.0.*SwiftShader/i.test(api)||
     !/Performing composition using CompositorGl\./.test(log)){
    const error=new Error('Actual GLES selection is not SwiftShader with inactive Vulkan');
    error.selection=selection;
    throw error;
  }
  return selection;
}

function iniValue(text,key){
  const values=text.split(/\r?\n/).map(line=>/^\s*([^#;=\s]+)\s*=\s*([^#;\r\n]+?)\s*$/.exec(line)).filter(row=>row&&row[1]===key).map(row=>row[2]);
  if(values.length>1)throw new Error(`Ambiguous SDK setting: ${key}`);
  return values[0]??null;
}

export function readRendererSdk(sdkHome){
  if(!sdkHome)throw new Error('Require explicit ANDROID_HOME');
  const files={hostFeatures:'emulator/lib/advancedFeatures.ini',hostVersion:'emulator/source.properties',guestFeatures:'system-images/android-36.1/google_apis_playstore/x86_64/advancedFeatures.ini',guestVersion:'system-images/android-36.1/google_apis_playstore/x86_64/source.properties'};
  const receipt={image:'system-images;android-36.1;google_apis_playstore;x86_64',files:{}};
  for(const [name,path] of Object.entries(files)){
    const bytes=readFileSync(resolve(sdkHome,path)),text=bytes.toString('utf8');
    receipt.files[name]={path,sha256:createHash('sha256').update(bytes).digest('hex')};
    if(name.endsWith('Features'))receipt.files[name].values=Object.fromEntries(iniFeatures.map(key=>[key,iniValue(text,key)]));
    else receipt.files[name].revision=iniValue(text,'Pkg.Revision');
  }
  if(receipt.files.guestFeatures.values.GLDirectMem!=='on')throw new Error('API36.1 guest must support GLDirectMem before enabling it on the host');
  for(const name of ['GLDirectMem','HasSharedSlotsHostMemoryAllocator'])if(!/^(on|off)$/.test(receipt.files.hostFeatures.values[name]||''))throw new Error(`Installed SDK does not declare supported feature ${name}`);
  if(!receipt.files.hostVersion.revision||!receipt.files.guestVersion.revision)throw new Error('Require actual host and guest SDK revisions');
  return receipt;
}

function main(){
  const phase=process.argv[2],out=resolve('artifacts/android-native-isolated');
  if(!/^(snapshot|verify)$/.test(phase||''))throw new Error('Require renderer snapshot or verify phase');
  const report={source:process.env.ANDROID_QA_SOURCE,device:process.env.ANDROID_QA_DEVICE,avd:process.env.ANDROID_QA_AVD,phase,compatible:false,startedAtUtc:new Date().toISOString()};
  const selected={source:report.source,device:report.device,avd:report.avd,requestedGpu:'swiftshader',verified:false};
  mkdirSync(out,{recursive:true});
  try{
    if(!/^[0-9a-f]{40}$/.test(report.source||'')||report.device!=='emulator-5582'||!/^sogrim_ci_[a-z0-9_]+$/.test(report.avd||''))throw new Error('Require exact source and explicit owned CI emulator identity');
    report.sdk=readRendererSdk(process.env.ANDROID_HOME);
    if(phase==='snapshot')report.prepared=true;
    else{
      const prior=JSON.parse(readFileSync(resolve(out,'renderer-sdk.json'),'utf8'));
      if(!prior.prepared||prior.source!==report.source||prior.device!==report.device||prior.avd!==report.avd||JSON.stringify(prior.sdk)!==JSON.stringify(report.sdk))throw new Error('Renderer SDK or exact source/owned AVD changed after preparation');
      const pid=Number(process.env.ANDROID_QA_EMULATOR_PID),savedPid=Number(readFileSync(resolve(out,'emulator.pid'),'utf8').trim());
      if(!Number.isSafeInteger(pid)||pid<=1||pid!==savedPid)throw new Error('Require the exact owned emulator launcher PID');
      process.kill(pid,0);report.pid=pid;
      const log=readFileSync(resolve(out,'emulator.log'),'utf8');
      Object.assign(report,assertRendererCapabilities(log));
      Object.assign(selected,assertRendererSelection(log),{verified:true});
      report.renderer=selected;
    }
  }catch(error){
    if(error.capabilities)Object.assign(report,error.capabilities);
    if(error.selection)Object.assign(selected,error.selection);
    report.error=error.stack;selected.error=error.message;console.error(error.message);process.exitCode=1;
  }
  finally{
    report.completedAtUtc=new Date().toISOString();
    writeFileSync(resolve(out,phase==='snapshot'?'renderer-sdk.json':'renderer-capabilities.json'),JSON.stringify(report,null,2));
    if(phase==='verify')writeFileSync(resolve(out,'effective-renderer.json'),JSON.stringify(selected,null,2));
    console.log(JSON.stringify(report));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
