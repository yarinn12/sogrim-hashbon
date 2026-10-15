// Inactive diagnostic orchestration. Never imports or modifies product/fixture code.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,readdirSync,lstatSync,realpathSync,copyFileSync,openSync,closeSync} from 'node:fs';
import {join,resolve,relative,sep,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {
 APP_SHA,TREE,FIXTURE_SHA,ORDER,PHASES,DEVICE_TYPE,sha,stamp,requireEnvelope,requireCheckouts,
 requireBaseline,requireFileMap,inventory,requireProductsSame,selectSdk,ownedDevice,armVerdict,
 inspectDefaultEvidence,observerCoverage,requirePublic,aggregate,nextArm,finishArm
} from './observer-footprint-contract.mjs';

const BUNDLE='com.sogrimhashbon.app';
const experiment='ios475-observer-footprint-abba';
const active=new Set();
let stopPath=null,interrupted=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 interrupted=true;
 if(stopPath)try{writeFileSync(stopPath,'');}catch{}
 for(const child of active)try{child.kill('SIGTERM');}catch{}
});
const err=e=>String(e?.stack??e);
function save(path,value){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'w'});renameSync(tmp,path);}
function read(path){return JSON.parse(readFileSync(path,'utf8'));}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();}
function inside(root,path){const rel=relative(realpathSync(root),realpathSync(path));assert.ok(rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel),'Path outside owned root');}
function context(){
 const envelope=requireEnvelope(process.env);
 assert.equal(process.platform,'darwin','Only reviewed SDK host; no emulation');
 const paths={app:process.env.IOS475_APP_ROOT,fixture:process.env.IOS475_FIXTURE_ROOT,tools:process.env.IOS475_TOOLS_ROOT};
 for(const p of Object.values(paths))assert.ok(p&&isAbsolute(p));
 const roots=requireCheckouts({...paths,toolsSha:envelope.toolsSha,git});
 assert.equal(fileURLToPath(import.meta.url),join(roots.tools,'scripts/qa/ios-parity/run-observer-footprint.mjs'));
 const workspace=realpathSync(process.env.GITHUB_WORKSPACE);
 const out=resolve(process.env.IOS475_EVIDENCE_ROOT??'');
 assert.equal(out,join(workspace,experiment),'Dedicated evidence sibling');
 for(const root of Object.values(paths))assert.notEqual(out,resolve(root));
 return {...roots,...envelope,out,workspace,host:{runner:process.env.RUNNER_NAME,os:process.env.RUNNER_OS,imageOS:process.env.ImageOS,imageVersion:process.env.ImageVersion,job:process.env.GITHUB_JOB},baseline:read(join(roots.tools,'scripts/qa/ios-parity/observer-footprint-qa475-baseline.json'))};
}
function statePath(c){return join(c.out,'state.json');}
function loadState(c){
 const s=read(statePath(c));
 for(const k of ['run','toolsSha','app','fixture','tools','out'])assert.equal(s[k],c[k],k);
 assert.equal(s.sourceSha,APP_SHA);assert.equal(s.sourceTree,TREE);assert.equal(s.fixtureSha,FIXTURE_SHA);
 assert.deepEqual(s.order,ORDER);
 return s;
}
function persist(c,s){save(statePath(c),s);}
function checkInputs(c){
 requireFileMap(c.app,c.baseline.source);
 requireFileMap(join(c.fixture,'scripts/qa/ios-parity'),c.baseline.qaFixtures);
 const fixtureFiles=readdirSync(join(c.fixture,'scripts/qa/ios-parity')).filter(p=>lstatSync(join(c.fixture,'scripts/qa/ios-parity',p)).isFile()).sort();
 assert.deepEqual(fixtureFiles,Object.keys(c.baseline.qaFixtures).sort(),'Closed original fixture directory');
}
async function command(c,s,label,program,args,{cwd=c.app,allowFailure=false,capture=false,outputDir=c.out}={}){
 assert.ok(!interrupted,'Interrupted: no further experiment commands');
 assert.match(label,/^[a-z0-9-]+$/);
 mkdirSync(join(c.out,'commands'),{recursive:true});mkdirSync(outputDir,{recursive:true});
 s.commandSequence=(s.commandSequence??0)+1;persist(c,s);
 const id=String(s.commandSequence).padStart(4,'0')+'-'+label;
 const log=join(outputDir,id+'.log'),receipt=join(c.out,'commands',id+'.json');
 const row={id,program,args,cwd,start:stamp(),log:relative(c.out,log),shell:false};
 save(receipt,row);
 const fd=openSync(log,'wx');let text='',overflow=false;
 let child;
 try{
  child=spawn(program,args,{cwd,env:{...process.env,APP_SHA,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',capture?'pipe':fd,fd]});
  active.add(child);row.pid=child.pid??null;save(receipt,row);
  if(capture)child.stdout.on('data',b=>{
   // Small simctl/SDK JSON only; never attach this listener to XCTest or observer.
   text+=b.toString('utf8');if(text.length>16*1024*1024){overflow=true;child.kill('SIGTERM');}
  });
  const result=await new Promise(resolveDone=>{
   let spawnError=null;
   child.once('error',e=>{spawnError=err(e);});
   child.once('close',(code,signal)=>resolveDone({code,signal,spawnError}));
  });
  Object.assign(row,result,{end:stamp(),captureOverflow:overflow});
  if(capture)writeFileSync(fd,text);
  save(receipt,row);
  if(result.spawnError||overflow||result.code!==0){
   if(!allowFailure)throw Error(label+' failed: '+JSON.stringify(result));
  }
  return {...result,text,log};
 }finally{if(child)active.delete(child);closeSync(fd);}
}
async function jsonCommand(c,s,label,args){const r=await command(c,s,label,'xcrun',args,{capture:true});return JSON.parse(r.text);}
async function sdkSnapshot(c,s){
 const xcode=await command(c,s,'sdk-xcode','xcodebuild',['-version'],{capture:true});
 assert.match(xcode.text,/^Xcode 26\.6(?:\r?\n|$)/);
 const selected=await command(c,s,'sdk-selected','xcode-select',['-p'],{capture:true});
 assert.equal(selected.text.trim(),'/Applications/Xcode_26.6.app/Contents/Developer');
 const sdk=await command(c,s,'sdk-version','xcrun',['--sdk','iphonesimulator','--show-sdk-version'],{capture:true});
 const os=await command(c,s,'sdk-os','sw_vers',[],{capture:true});assert.match(os.text,/ProductVersion:\s+26(?:\.|\s)/);
 const arch=await command(c,s,'sdk-arch','uname',['-m'],{capture:true});
 const runtimes=await jsonCommand(c,s,'sdk-runtimes',['simctl','list','runtimes','-j']);
 const types=await jsonCommand(c,s,'sdk-types',['simctl','list','devicetypes','-j']);
 return {xcode:xcode.text.trim(),selected:selected.text.trim(),sdk:sdk.text.trim(),os:os.text.trim(),arch:arch.text.trim(),...selectSdk(runtimes.runtimes,types.devicetypes)};
}
async function device(c,s,owner){const all=await jsonCommand(c,s,'owned-devices',['simctl','list','devices','-j']);return ownedDevice(all.devices,owner);}
async function shutdown(c,s,owner){
 const d=await device(c,s,owner);
 if(d.state==='Booted')await command(c,s,'owned-shutdown','xcrun',['simctl','shutdown',owner.udid]);
 for(let i=0;i<30;i++){
  if((await device(c,s,owner)).state==='Shutdown')return true;
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('Owned simulator did not reach Shutdown in original 30 polls');
}
async function cleanupOwned(c,s,owner){
 let requested=false;
 for(let i=0;i<30;i++){
  const d=await device(c,s,owner);
  if(d.state==='Shutdown')return true;
  if(d.state==='Booted'&&!requested){
   await command(c,s,'owned-final-shutdown','xcrun',['simctl','shutdown',owner.udid]);requested=true;
  }
  await new Promise(done=>setTimeout(done,1000));
 }
 throw Error('Verified owned cleanup did not reach Shutdown in 30 polls');
}
async function boot(c,s,owner){
 await shutdown(c,s,owner);
 await command(c,s,'owned-erase','xcrun',['simctl','erase',owner.udid]);
 assert.equal((await device(c,s,owner)).state,'Shutdown');
 await command(c,s,'owned-boot','xcrun',['simctl','boot',owner.udid]);
 await command(c,s,'owned-bootstatus','xcrun',['simctl','bootstatus',owner.udid,'-b']);
 assert.equal((await device(c,s,owner)).state,'Booted');
 return true;
}
async function preflight(c){
 assert.equal(git(c.app,['status','--porcelain','--untracked-files=all']),'','App must start pristine');
 checkInputs(c);mkdirSync(c.out,{recursive:false});
 const s={schemaVersion:1,experiment,...c,baseline:undefined,sourceSha:APP_SHA,sourceTree:TREE,fixtureSha:FIXTURE_SHA,
  created:stamp(),order:[...ORDER],owners:[],rows:[],commandSequence:0,diagnosticOnly:true,nativeAcceptance:false,sourceAccepted:false,distributionAllowed:false};
 persist(c,s);save(join(c.out,'qa475-baseline.json'),c.baseline);
 s.sdk=await sdkSnapshot(c,s);s.sdkSha256=sha(JSON.stringify(s.sdk));persist(c,s);
 for(let i=0;i<4;i++){
  const owner={trial:i+1,mode:ORDER[i],name:experiment+'-'+c.run+'-'+(i+1),runtime:s.sdk.runtime,deviceType:DEVICE_TYPE,creationRequested:stamp()};
  s.owners.push(owner);persist(c,s);
  const response=await command(c,s,'owned-create','xcrun',['simctl','create',owner.name,DEVICE_TYPE,owner.runtime],{capture:true});
  owner.udid=response.text.trim();owner.created=stamp();persist(c,s);
  assert.equal((await device(c,s,owner)).state,'Shutdown');
 }
 s.preflightComplete=true;persist(c,s);
}
function products(c){return join(c.app,'build/native-parity/derived/Build/Products');}
function preparedManifest(c){return read(join(c.app,'build/native-parity/package-manifest.json'));}
async function build(c,s){
 assert.equal(s.preflightComplete,true);assert.equal(s.buildStarted,undefined,'One build only');
 checkInputs(c);s.buildStarted=stamp();persist(c,s);
 const common=join(c.out,'common');mkdirSync(common);mkdirSync(join(c.app,'build/native-parity'),{recursive:true});
 const f=join(c.fixture,'scripts/qa/ios-parity');
 await command(c,s,'npm-ci','npm',['ci'],{outputDir:common});
 await command(c,s,'validator-controls','python3',[join(f,'test_validation.py')],{outputDir:common});
 await command(c,s,'original-observer-controls','python3',[join(f,'test_native_stall_monitor.py')],{outputDir:common});
 await command(c,s,'original-www','node',[join(f,'build-www.mjs')],{outputDir:common});
 await command(c,s,'capacitor-sync','npx',['cap','sync','ios'],{outputDir:common});
 await command(c,s,'native-finalize','node',['scripts/finalize-native-projects.mjs'],{outputDir:common});
 await command(c,s,'original-instrumentation','python3',[join(f,'prepare.py'),'prepare',c.app,APP_SHA],{outputDir:common});
 checkInputs(c);requireBaseline(preparedManifest(c),c.baseline);
 requirePublic(join(c.app,'ios/App/App/public'),c.baseline);
 copyFileSync(join(c.app,'build/native-parity/package-manifest.json'),join(common,'package-manifest.json'));
 for(const [src,name]of [['ios/App/App/AppDelegate.swift','instrumented-AppDelegate.swift'],['ios/App/ParityProbeUITests.swift','original-ParityProbeUITests.swift'],['ios/App/App.xcodeproj/project.pbxproj','instrumented-project.pbxproj']])
  copyFileSync(join(c.app,src),join(common,name));
 s.preparedInventory={source:c.baseline.source,fixtures:c.baseline.qaFixtures,public:inventory(join(c.app,'ios/App/App/public'))};
 save(join(common,'prepared-inputs.json'),s.preparedInventory);persist(c,s);
 await device(c,s,s.owners[0]);
 await command(c,s,'unsigned-build-once','xcodebuild',[
 '-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator',
 '-destination','platform=iOS Simulator,id='+s.owners[0].udid,'-derivedDataPath','build/native-parity/derived',
 'build-for-testing','CODE_SIGNING_ALLOWED=NO'],{outputDir:common});
 requirePublic(join(products(c),'Debug-iphonesimulator/App.app/public'),c.baseline);
 s.productInventory=inventory(products(c));s.productInventorySha256=sha(JSON.stringify(s.productInventory));
 save(join(common,'compiled-products.json'),s.productInventory);
 assert.deepEqual(await sdkSnapshot(c,s),s.sdk);
 s.buildComplete=stamp();persist(c,s);
}
function journal(path){
 const source=readFileSync(path,'utf8'),lines=source.split(/\r?\n/);
 if(lines.at(-1)==='')lines.pop();
 return lines.map(line=>JSON.parse(line)); // torn prefix invalidates comparison; raw bytes remain.
}
function readEvidence(c,s,row,out){
 const report=read(join(out,'native-parity.json'));
 const names=readdirSync(out);
 const startup=names.filter(n=>/^native-parity-startup-.*\.log$/.test(n)).flatMap(n=>journal(join(out,n)));
 const status=names.filter(n=>/^native-parity-status-.*\.log$/.test(n)).flatMap(n=>journal(join(out,n)));
 const images=Object.fromEntries(names.filter(n=>/^native-parity-.*\.png$/.test(n)).map(n=>{
  const b=readFileSync(join(out,n));return [n,{bytes:b.length,signature:b.subarray(0,8).toString('hex')}];
 }));
 const result=inspectDefaultEvidence(report,startup,status,readFileSync(join(out,'test.log'),'utf8'),images);
 if(row.testExit===0){
  assert.deepEqual(result.observedPhases,PHASES);
  assert.match(readFileSync(join(out,'test.log'),'utf8'),/NATIVE_PARITY_XCTEST_SUCCESS:/);
 }
 row.statusCounts=Object.fromEntries(['requested','callback','decoded','published','captureReceived','captureWritten','captureAckCallback'].map(k=>[k,status.filter(r=>r.event===k).length]));
 row.sessionCount=new Set(startup.map(r=>r.session)).size;
 return result;
}
async function collect(c,s,row,out,owner){
 const failures=[];
 const attempt=async fn=>{try{return await fn();}catch(e){failures.push(err(e));return null;}};
 const r=await attempt(()=>command(c,s,'evidence-container','xcrun',['simctl','get_app_container',owner.udid,BUNDLE,'data'],{capture:true,outputDir:out}));
 if(r){
  await attempt(async()=>{
   const container=realpathSync(r.text.trim());
   const deviceData=join(homedir(),'Library/Developer/CoreSimulator/Devices',owner.udid,'data');
   inside(deviceData,container);
   const rel=relative(realpathSync(deviceData),container).split(sep).join('/');
   assert.match(rel,/^Containers\/Data\/Application\/[A-Fa-f0-9-]{36}$/);
   const docs=join(container,'Documents');inside(container,docs);
   for(const n of readdirSync(docs).filter(n=>n.startsWith('native-parity'))){
    const p=join(docs,n);assert.ok(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());
    copyFileSync(p,join(out,n));
   }
  });
 }
 if(existsSync(join(out,'result.xcresult')))await attempt(()=>command(c,s,'evidence-attachments','xcrun',['xcresulttool','export','attachments','--path',join(out,'result.xcresult'),'--output-path',join(out,'system-screenshots')],{outputDir:out}));
 await attempt(()=>command(c,s,'evidence-screenshot','xcrun',['simctl','io',owner.udid,'screenshot',join(out,'final-simulator.png')],{outputDir:out}));
 await attempt(()=>command(c,s,'evidence-system-log','xcrun',['simctl','spawn',owner.udid,'log','show','--last','8m','--style','compact','--predicate','process == "App"'],{outputDir:out}));
 row.collectionErrors=failures;
}
function startObserver(c,s,row,out,owner){
 const dir=join(out,'observer');mkdirSync(dir);
 const script=join(c.fixture,'scripts/qa/ios-parity/native_stall_monitor.py');
 assert.equal(sha(readFileSync(script)),c.baseline.qaFixtures['native_stall_monitor.py']);
 const args=[script,'--udid',owner.udid,'--bundle-id',BUNDLE,'--manifest',join(c.app,'build/native-parity/package-manifest.json'),
 '--source-sha',APP_SHA,'--source-tree',TREE,'--output-dir',dir,'--stop-file',join(dir,'stop')];
 const receipt={started:true,closed:false,reportPresent:false,coverageValid:false,scriptSha256:sha(readFileSync(script)),args,startRequested:stamp()};
 row.observer=receipt;save(join(out,'observer-lifecycle.json'),receipt);
 const fd=openSync(join(dir,'observer.log'),'wx');
 const child=spawn('python3',args,{cwd:c.app,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',fd,fd]});
 active.add(child);receipt.pid=child.pid??null;receipt.spawnReturned=stamp();
 let spawnError=null;child.once('error',e=>{spawnError=err(e);});
 const completion=new Promise(done=>child.once('close',(code,signal)=>{
  active.delete(child);closeSync(fd);Object.assign(receipt,{closed:true,exit:code,signal,spawnError,end:stamp()});
  save(join(out,'observer-lifecycle.json'),receipt);done();
 }));
 stopPath=join(dir,'stop');
 return {async stop(){
  receipt.stopRequested=stamp();save(join(out,'observer-lifecycle.json'),receipt);
  writeFileSync(stopPath,'');stopPath=null;await completion;
  const reportPath=join(dir,'monitor-report.json');
  receipt.reportPresent=existsSync(reportPath);
  if(receipt.reportPresent){receipt.reportSha256=sha(readFileSync(reportPath));receipt.originalReport=read(reportPath);}
  save(join(out,'observer-lifecycle.json'),receipt);
 }};
}
async function arm(c,s,index){
 assert.equal(s.buildComplete!==undefined,true);
 const owner=nextArm(s.rows,s.owners,index);
 const out=join(c.out,'arm-'+index+'-'+owner.mode);mkdirSync(out);
 const row={trial:index,mode:owner.mode,owner,attempted:true,start:stamp(),errors:[],initialWait:'unknown',observer:{started:false,closed:false,reportPresent:false,coverageValid:false}};
 s.rows.push(row);persist(c,s);save(join(out,'row.json'),row);
 let monitor=null;
 try{
  checkInputs(c);requireBaseline(preparedManifest(c),c.baseline);
  row.sdkBefore=await sdkSnapshot(c,s);assert.deepEqual(row.sdkBefore,s.sdk);row.sdkStable=true;
  const beforeProducts=inventory(products(c));save(join(out,'products-before.json'),beforeProducts);
  row.productsBeforeSha256=sha(JSON.stringify(beforeProducts));
  requireProductsSame(beforeProducts,s.productInventory);row.productsStable=true;
  requirePublic(join(products(c),'Debug-iphonesimulator/App.app/public'),c.baseline);
  row.deviceBeforeBoot=await device(c,s,owner);row.bootValid=await boot(c,s,owner);row.deviceAfterBoot=await device(c,s,owner);
  if(owner.mode==='on')monitor=startObserver(c,s,row,out,owner);
  else save(join(out,'observer-lifecycle.json'),{started:false,mode:'off',externalObserver:false});
  const result=await command(c,s,'original-xctest','xcodebuild',[
   '-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Debug',
   '-destination','platform=iOS Simulator,id='+owner.udid,'-derivedDataPath','build/native-parity/derived',
   '-resultBundlePath',join(out,'result.xcresult'),'test-without-building','CODE_SIGNING_ALLOWED=NO'
  ],{allowFailure:true,outputDir:out});
  row.testExit=result.code;row.testSignal=result.signal;
  copyFileSync(result.log,join(out,'test.log'));
  if(result.spawnError||result.signal)row.errors.push('XCTest process: '+JSON.stringify(result));
 }catch(e){row.errors.push(err(e));}
 finally{
  if(monitor)try{await monitor.stop();}catch(e){row.errors.push('Observer close: '+err(e));}
  // A command interrupted by the outer workflow timeout invalidates this arm.
  const wasInterrupted=interrupted;interrupted=false;
  await finishArm(row,{
   interrupted:wasInterrupted,
   collect:async()=>{
    await device(c,s,owner);await collect(c,s,row,out,owner);
    if(row.collectionErrors.length)throw Error('Preservation command failures; all raw receipts retained');
   },
   inspect:async()=>{
    Object.assign(row,readEvidence(c,s,row,out));
    if(owner.mode==='on')row.observer.coverageValid=observerCoverage(row.observer.originalReport,owner,row.metrics);
   },
   after:async()=>{
    checkInputs(c);row.sdkAfter=await sdkSnapshot(c,s);assert.deepEqual(row.sdkAfter,s.sdk);
    const afterProducts=inventory(products(c));save(join(out,'products-after.json'),afterProducts);
    row.productsAfterSha256=sha(JSON.stringify(afterProducts));
    requireProductsSame(afterProducts,s.productInventory);
    requirePublic(join(products(c),'Debug-iphonesimulator/App.app/public'),c.baseline);
   },
   cleanup:async()=>{row.deviceBeforeShutdown=await device(c,s,owner);row.cleanupVerified=await cleanupOwned(c,s,owner);},
   persist:async()=>{save(join(out,'row.json'),row);persist(c,s);}
  });
 }
}
async function finalize(c,s){
 const closure=[];
 for(const owner of s.owners){
  if(!owner.udid){closure.push({owner,verified:false,reason:'No verified create response; no name-based adoption'});continue;}
  try{closure.push({owner,verified:await cleanupOwned(c,s,owner),time:stamp()});}
  catch(e){closure.push({owner,verified:false,error:err(e),time:stamp()});}
 }
 // Never turn an earlier invalid arm green after late cleanup.
 const rows=ORDER.map((mode,i)=>s.rows.find(r=>r.trial===i+1)??{
  trial:i+1,mode,attempted:false,comparisonEligible:false,initialWait:'unknown',
  errors:['Arm absent: prior build/preflight/outer cancellation; original failure preserved'],
  nativeAcceptance:false,sourceAccepted:false,distributionAllowed:false});
 s.finalized=stamp();persist(c,s);save(join(c.out,'closure.json'),closure);
 const summary={...aggregate(rows),sourceSha:APP_SHA,sourceTree:TREE,fixtureSha:FIXTURE_SHA,toolsSha:c.toolsSha,run:c.run,
  failedReferenceRun:38809205491,referenceStillFailed:true,buildOnce:s.buildComplete!==undefined,
  sameHostFourFreshSimulators:true,noCounterbalancedHostReplication:true,cleanupAllVerified:closure.length===4&&closure.every(r=>r.verified)};
 save(join(c.out,'summary.json'),summary);
 const files=inventory(c.out);delete files['artifact-inventory.json'];save(join(c.out,'artifact-inventory.json'),files);
}
async function main(){
 const [phase,arg,...rest]=process.argv.slice(2);assert.equal(rest.length,0);
 assert.ok(['preflight','build','arm','finalize'].includes(phase));
 assert.equal(phase==='arm',arg!==undefined,'Only arm accepts index');
 const c=context();
 if(phase==='preflight')return preflight(c);
 const s=loadState(c);
 if(phase==='build')return build(c,s);
 if(phase==='arm')return arm(c,s,Number(arg));
 return finalize(c,s);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error(err(e));process.exitCode=1;});
}
