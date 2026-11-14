import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {
 APP_SHA,TREE,FIXTURE_SHA,BRANCH,WORKFLOW,ORDER,PHASES,DEVICE_TYPE,sha,requireEnvelope,
 requireCheckouts,requireBaseline,requireFileMap,inventory,requireProductsSame,selectSdk,
 ownedDevice,armVerdict,finishArm,startupMetrics,inspectDefaultEvidence,observerCoverage,
 expectedPublicMap,requirePublic,aggregate,nextArm
} from '../scripts/qa/ios-parity/observer-footprint-contract.mjs';

const toolsSha='a'.repeat(40);
const baseline=JSON.parse(readFileSync(new URL('../scripts/qa/ios-parity/observer-footprint-qa475-baseline.json',import.meta.url),'utf8'));
const envelope=()=>({
 IOS475_OBSERVER_FOOTPRINT:'reviewed-diagnostic-only',GITHUB_REPOSITORY:'yarinn12/sogrim-hashbon',
 GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+BRANCH,
 GITHUB_WORKFLOW_REF:'yarinn12/sogrim-hashbon/'+WORKFLOW+'@refs/heads/'+BRANCH,
 GITHUB_RUN_NUMBER:'1',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'1234',GITHUB_SHA:toolsSha,
 SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD:'1'
});
const id=i=>'00000000-0000-0000-0000-'+String(i).padStart(12,'0');
const owners=()=>ORDER.map((mode,i)=>({mode,trial:i+1,udid:id(i+1),name:'owned-'+(i+1),runtime:'com.apple.CoreSimulator.SimRuntime.iOS-26-5'}));
const good=mode=>({mode,bootValid:true,sdkStable:true,productsStable:true,captureValid:true,initialWait:'passed',testExit:0,
 cleanupVerified:true,errors:[],observer:mode==='off'?{started:false}:{started:true,closed:true,reportPresent:true,coverageValid:true}});
function temporary(body){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ios-footprint-contract-')));
 try{return body(root);}finally{
  const absolute=resolve(root);
  assert.equal(dirname(absolute),realpathSync(tmpdir()));
  // Delete only the exact freshly created owned temp directory, never a computed parent.
  assert.match(root.split(/[\\/]/).at(-1),/^ios-footprint-contract-/);
  rmSync(root,{recursive:true,force:false});
 }
}
function evidence(count=8){
 const session='cold',startup=[
  {event:'capacitorDidLoad-enter',time:100},
  {event:'web-stage',stage:'script-injected',monotonicMs:7831,time:107.83,epochMs:107830},
  {event:'web-stage',stage:'startup-milestone',milestone:'auth-ready',startMs:25521,monotonicMs:37448,time:137.448},
  {event:'web-stage',stage:'startup-milestone',milestone:'first-screen-rendered',startMs:26942,monotonicMs:37448,time:137.449},
  {event:'web-stage',stage:'startup-milestone',milestone:'splash-dismissed',startMs:37460,monotonicMs:37540,time:137.54},
  {event:'web-stage',stage:'home-wait-ready',monotonicMs:37451,epochMs:137451,time:137.451}
 ].map(r=>({...r,sourceSha:APP_SHA,sourceTree:TREE,fixtureSha:FIXTURE_SHA,fixtureTree:TREE,session}));
 const records=PHASES.slice(0,count).map((phase,i)=>({
  phase,index:i+1,captureSession:session,nativeShell:true,platform:'ios',appUrl:'capacitor://localhost',errors:[],
  visualCapture:{phase,splashAbsent:true,splashMarkMs:37460,capturedAtMs:46000+i}
 }));
 const status=[{event:'published',time:146},...records.flatMap((r,i)=>[
  {event:'captureReceived',phase:r.phase,index:r.index,time:145+i},
  {event:'captureWritten',index:r.index,time:145.1+i},
  {event:'captureAckCallback',index:r.index,error:'',time:145.2+i}
 ])].map(r=>({...r,session,sourceSha:APP_SHA,sourceTree:TREE}));
 const report={sourceSha:APP_SHA,sourceTree:TREE,controller:'SogrimParityBridgeViewController',bridgeAvailable:true,preferredContentSizeCategory:'UICTContentSizeCategoryL',records};
 const images=Object.fromEntries(records.map(r=>['native-parity-'+r.phase+'.png',{bytes:1200,signature:'89504e470d0a1a0a'}]));
 return {report,startup,status,images};
}
const inspect=(e,log='NATIVE_STATUS_MISSING: count=1\nXCTAssertTrue failed')=>inspectDefaultEvidence(e.report,e.startup,e.status,log,e.images);
test('inactive envelope denies dispatch, wrong branch/workflow/repo, retry, malformed ID and private env',()=>{
 assert.equal(requireEnvelope(envelope()).toolsSha,toolsSha);
 for(const [key,value]of [
  ['IOS475_OBSERVER_FOOTPRINT','inactive-preparation'],['TEST_RUNNER_QA_STATUS_PUBLICATION','dedupe'],['QA_STATUS_PUBLICATION','control'],['GITHUB_REPOSITORY','other/repo'],
  ['GITHUB_EVENT_NAME','workflow_dispatch'],['GITHUB_REF','refs/heads/main'],['GITHUB_WORKFLOW_REF','forged'],
  ['GITHUB_RUN_NUMBER','2'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_RUN_ID','0'],['GITHUB_SHA','bad'],['SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD','0']
 ])assert.throws(()=>requireEnvelope({...envelope(),[key]:value}),key);
});
test('baseline is exact original 50/214/18, not merely matching counts',()=>{
 requireBaseline(baseline,baseline);
 for(const key of ['source','www','qaFixtures']){
  const copy=structuredClone(baseline),p=Object.keys(copy[key])[0];copy[key][p]='0'.repeat(64);
  assert.throws(()=>requireBaseline(copy,baseline));
  delete copy[key][p];assert.throws(()=>requireBaseline(copy,baseline));
 }
 for(const key of ['sourceSha','sourceTree','fixtureSha','fixtureTree'])assert.throws(()=>requireBaseline({...baseline,[key]:toolsSha},baseline));
 assert.equal(Object.keys(expectedPublicMap(baseline)).length,218);
});
test('three checkout roots bind independently and deny dirty fixture/tools or wrong tree',()=>temporary(root=>{
 const app=join(root,'app'),fixture=join(root,'fixture'),tools=join(root,'tools');
 for(const p of [app,fixture,tools])mkdirSync(p);
 let badRoot='',badCommand='',badValue='';
 const git=(where,args)=>{
  const cmd=args.join(' ');if(where===badRoot&&cmd===badCommand)return badValue;
  if(cmd==='rev-parse --show-toplevel')return where;
  if(cmd==='rev-parse HEAD')return where===app?APP_SHA:where===fixture?FIXTURE_SHA:toolsSha;
  if(cmd==='rev-parse HEAD^{tree}')return TREE;
  if(cmd.startsWith('status '))return '';
  throw Error('Unexpected git read');
 };
 requireCheckouts({app,fixture,tools,toolsSha,git});
 assert.throws(()=>requireCheckouts({app,fixture:app,tools,toolsSha,git}));
 for(const [r,cmd,value]of [[app,'rev-parse HEAD',toolsSha],[fixture,'rev-parse HEAD^{tree}',toolsSha],[fixture,'status --porcelain --untracked-files=all','?? foreign'],[tools,'status --porcelain --untracked-files=all',' M helper']]){
  badRoot=r;badCommand=cmd;badValue=value;assert.throws(()=>requireCheckouts({app,fixture,tools,toolsSha,git}));
 }
}));
test('actual file bytes and closed public inventory reject changed, missing and extra assets',()=>temporary(root=>{
 mkdirSync(join(root,'sub'));writeFileSync(join(root,'sub','a'),'canonical\n');
 requireFileMap(root,{'sub/a':sha('canonical\n')});
 assert.throws(()=>requireFileMap(root,{'../outside':'a'.repeat(64)}));
 assert.throws(()=>requireFileMap(root,{'sub/a':sha('canonical\r\n')}));
 const original=inventory(root);writeFileSync(join(root,'sub','a'),'stale\n');
 assert.throws(()=>requireProductsSame(inventory(root),original));
 writeFileSync(join(root,'sub','a'),'canonical\n');requireProductsSame(inventory(root),original);
 writeFileSync(join(root,'new-binary'),'extra');assert.throws(()=>requireProductsSame(inventory(root),original));
 assert.throws(()=>requirePublic(root,baseline)); // old/generated public directories cannot pass a count-only comparison.
}));
test('SDK selector accepts only exact iOS26.5/iPhone16 and rejects fallbacks or ambiguity',()=>{
 const rt={isAvailable:true,identifier:'com.apple.CoreSimulator.SimRuntime.iOS-26-5',version:'26.5'},type={identifier:DEVICE_TYPE,name:'iPhone 16'};
 assert.equal(selectSdk([rt],[type]).runtimeVersion,'26.5');
 for(const rs of [[],[{...rt,version:'26.4'}],[rt,rt],[{...rt,isAvailable:false}]])assert.throws(()=>selectSdk(rs,[type]));
 assert.throws(()=>selectSdk([rt],[{identifier:'iPhone15',name:'iPhone 15'}]));
});
test('owned device checks cannot adopt by name or shutdown a foreign UDID/runtime/type',()=>{
 const owner=owners()[0],d={udid:owner.udid,name:owner.name,state:'Shutdown',deviceTypeIdentifier:DEVICE_TYPE};
 assert.equal(ownedDevice({[owner.runtime]:[d]},owner).state,'Shutdown');
 for(const map of [{other:[d]},{[owner.runtime]:[{...d,udid:id(9)}]},{[owner.runtime]:[{...d,name:'foreign'}]},{[owner.runtime]:[{...d,deviceTypeIdentifier:'wrong'}]},{[owner.runtime]:[d,d]}])assert.throws(()=>ownedDevice(map,owner));
});
test('real next-arm guard requires four distinct fresh identities and exact ABBA without retry',()=>{
 const os=owners();let rows=[];
 for(let i=1;i<=4;i++){assert.equal(nextArm(rows,os,i).mode,ORDER[i-1]);rows.push({trial:i,mode:ORDER[i-1]});}
 assert.throws(()=>nextArm(rows,os,4));
 assert.throws(()=>nextArm([],os,2));
 const reused=owners();reused[3].udid=reused[0].udid;assert.throws(()=>nextArm([],reused,1));
 const reordered=owners();reordered[1].mode='on';assert.throws(()=>nextArm([],reordered,1));
});
test('actual finalization protocol preserves test failure and attempts collection/validation/cleanup after errors',async()=>{
 const calls=[],saved=[],rows=[],os=owners();
 for(let i=1;i<=4;i++){
  const owner=nextArm(rows,os,i);
  const row={trial:i,mode:owner.mode,...good(owner.mode),testExit:i===1?65:0,initialWait:i===1?'failed':'passed',rawPrefix:'original-'+i};
  let failure=null;
  try{await finishArm(row,{
   collect:async()=>{calls.push('collect'+i);if(i===2)throw Error('container lookup timed out');},
   inspect:async()=>{calls.push('inspect'+i);if(i===2)throw Error('no capture prefix');},
   after:async()=>{calls.push('after'+i);},cleanup:async()=>{calls.push('cleanup'+i);row.cleanupVerified=true;},
   persist:async r=>{calls.push('save'+i);saved.push(structuredClone(r));}
  });}catch(e){failure=e;}
  assert.equal(Boolean(failure),i===1||i===2,'Only negative/incomplete arms fail after persistence');
  if(failure){assert.match(failure.message,/failed after evidence persisted/);assert.equal(saved.length,i);}
  rows.push(row);
 }
 const result=aggregate(rows);
 assert.deepEqual(rows.map(r=>r.mode),ORDER);assert.equal(saved.length,4);
 assert.equal(rows[0].comparisonEligible,true);assert.equal(rows[0].testPassed,false);
 assert.equal(rows[0].rawPrefix,'original-1');assert.equal(rows[1].comparisonEligible,false);
 assert.match(rows[1].errors.join('\n'),/container lookup timed out/);
 assert.deepEqual(calls.slice(5,10),['collect2','inspect2','after2','cleanup2','save2']);
 assert.equal(result.allArmsComparable,false);assert.equal(result.nativeAcceptance,false);
});
test('actual finalization protocol retains post-build drift, failed owned cleanup and interruption',async()=>{
 const row={trial:1,...good('on')};
 await assert.rejects(()=>finishArm(row,{
  interrupted:true,collect:async()=>{},inspect:async()=>{},
  after:async()=>{throw Error('compiled products changed');},
  cleanup:async()=>{throw Error('ownership mismatch');},persist:async()=>{}
 }),/failed after evidence persisted/);
 assert.equal(row.productsStable,false);assert.equal(row.sdkStable,false);
 assert.equal(row.cleanupVerified,false);assert.equal(row.comparisonEligible,false);
 assert.match(row.errors.join('\n'),/compiled products changed/);
 assert.match(row.errors.join('\n'),/ownership mismatch/);
 assert.match(row.errors.join('\n'),/Interrupted/);
});
test('boot/capture/SDK/products/cleanup/observer failures never become comparable',()=>{
 for(const mode of ['on','off']){
  assert.equal(armVerdict(good(mode)).comparisonEligible,true);
  for(const k of ['bootValid','captureValid','sdkStable','productsStable','cleanupVerified'])
   assert.equal(armVerdict({...good(mode),[k]:false}).comparisonEligible,false,k);
  assert.equal(armVerdict({...good(mode),errors:['original error']}).comparisonEligible,false);
  assert.equal(armVerdict({...good(mode),initialWait:'unknown'}).comparisonEligible,false);
  assert.equal(armVerdict({...good(mode),testExit:null}).comparisonEligible,false);
 }
 for(const k of ['closed','reportPresent','coverageValid'])assert.equal(armVerdict({...good('on'),observer:{...good('on').observer,[k]:false}}).comparisonEligible,false);
 assert.equal(armVerdict({...good('off'),observer:{started:true}}).comparisonEligible,false);
 assert.equal(armVerdict({...good('on'),initialWait:'failed',testExit:0}).comparisonEligible,false);
});
test('original late capture prefix remains a negative initial-wait observation; no timing relabel',()=>{
 const e=evidence(),r=inspect(e);
 assert.equal(r.initialWait,'failed');assert.equal(r.observedPhases.length,8);
 assert.equal(r.metrics.marks['auth-ready'].producerStartMs,25521);
 assert.equal(r.metrics.marks['auth-ready'].observerDeliveryMs,37448);
 assert.equal(r.metrics.marks['first-screen-rendered'].producerStartMs,26942);
 assert.equal(r.metrics.homePollIsFirstPhysicalFrameProof,false);
 assert.equal(r.metrics.firstScreenMarkIsPaintProof,false);
 assert.equal(r.nativeAcceptance,false);
 assert.equal(inspect(e,'No definitive first wait marker').initialWait,'unknown');
 assert.equal(inspect(evidence(9),'Later keyboard amount proves original initial assertion passed').initialWait,'passed');
});
test('capture prefix rejects corrupt/missing images, ACKs, provenance, index, visual mark or reordered stages',()=>{
 const mutations=[
  e=>delete e.images['native-parity-home.png'],
  e=>e.images['native-parity-home.png'].signature='0000',
  e=>e.images['native-parity-home.png'].bytes=10,
  e=>e.status.splice(e.status.findIndex(r=>r.event==='captureAckCallback'),1),
  e=>e.status.find(r=>r.event==='captureAckCallback').error='write failed',
  e=>e.status.find(r=>r.event==='captureWritten').time=999,
  e=>e.startup[0].fixtureSha=toolsSha,
  e=>e.startup[0].time=null,
  e=>e.startup.push({...e.startup[0],session:'foreign'}),
  e=>e.status.push({...e.status[0],session:'foreign'}),
  e=>e.report.records[0].index=5,
  e=>e.report.records[0].visualCapture.splashMarkMs=0,
  e=>e.report.records[0].visualCapture.splashAbsent=false,
  e=>e.report.records.reverse(),
  e=>e.report.records[0].captureSession='foreign',
  e=>e.report.preferredContentSizeCategory='UICTContentSizeCategoryAccessibilityXL',
  e=>e.report.controller='FakeBridge',
  e=>e.report.records[0].nativeShell=false
 ];
 for(const mutate of mutations){const e=evidence();mutate(e);assert.throws(()=>inspect(e));}
});
test('observer treatment requires original identity and lifetime spanning native cold start/publication',()=>{
 const e=evidence(),r=inspect(e),owner=owners()[0];
 const report={udid:owner.udid,bundleId:'com.sogrimhashbon.app',sourceSha:APP_SHA,sourceTree:TREE,startedWall:90,finishedWall:200,status:'unavailable',samples:[]};
 assert.equal(observerCoverage(report,owner,r.metrics),true);
 for(const patch of [{udid:id(8)},{sourceSha:toolsSha},{sourceTree:toolsSha},{bundleId:'other'},{startedWall:110},{finishedWall:140},{startedWall:null}])
  assert.throws(()=>observerCoverage({...report,...patch},owner,r.metrics));
 // A retained raw timeout/unavailable report is an ON treatment, not proof of a successful sample or its exact time.
 assert.equal(report.status,'unavailable');
});
test('aggregate retains every invalid arm and diagnostic-only scope',()=>{
 const rows=ORDER.map((mode,i)=>({trial:i+1,mode,...armVerdict(good(mode))}));
 rows[1].comparisonEligible=false;rows[1].errors=['raw boot failure'];
 const r=aggregate(rows);assert.equal(r.rows.length,4);assert.equal(r.rows[1].errors[0],'raw boot failure');
 assert.equal(r.allArmsComparable,false);assert.equal(r.defaultOnly,true);assert.equal(r.distributionAllowed,false);
 assert.throws(()=>aggregate(rows.slice(1)));assert.throws(()=>aggregate([...rows].reverse()));
});

test('actual summary requires four distinct confirmed create receipts and preserves partial preflight',()=>{
 const rows=ORDER.map((mode,i)=>({trial:i+1,mode,...armVerdict(good(mode))}));
 const created=owners().map(o=>({...o,deviceType:DEVICE_TYPE,creationProof:{
  receipt:`commands/000${o.trial}-owned-create.json`,exit:0,responseSha256:sha(o.udid+'\n'),
  verified:{utc:'2026-10-15T00:00:00Z',monotonicNs:'123'},
  device:{udid:o.udid,name:o.name,state:'Shutdown',deviceTypeIdentifier:DEVICE_TYPE}
 }}));
 assert.equal(aggregate(rows,created).sameHostFourFreshSimulators,true);
 for(let n=0;n<4;n++){
  const r=aggregate(rows,created.slice(0,n));
  assert.equal(r.sameHostFourFreshSimulators,false,'Partial preflight cannot claim four creations');
  assert.equal(r.verifiedFreshSimulatorCount,n);assert.equal(r.rows.length,4);
 }
 for(const mutate of [
  os=>delete os[3].creationProof,
  os=>os[3].creationProof.exit=1,
  os=>os[3].creationProof.device.name='foreign',
  os=>os[3].creationProof.device.state='Booted',
  os=>os[3].creationProof.receipt='missing-receipt',
  os=>os[3].creationProof.verified.utc='unknown',
  os=>{os[3].udid=os[0].udid;os[3].creationProof.device.udid=os[0].udid;}
 ]){
  const os=structuredClone(created);mutate(os);
  assert.equal(aggregate(rows,os).sameHostFourFreshSimulators,false);
  assert.equal(aggregate(rows,os).verifiedFreshSimulatorCount,3);
 }
});

test('one-shot workflow has no dispatch, secret access, distribution or alternate-host matrix',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/ios475-observer-footprint-abba-20261016.yml',import.meta.url),'utf8');
 assert.match(workflow,/if: \$\{\{ github\.run_number == 1 && github\.run_attempt == 1 \}\}/);
 assert.match(workflow,/IOS475_OBSERVER_FOOTPRINT: reviewed-diagnostic-only/);
 const deployment=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(deployment.git.deploymentEnabled[BRANCH],false,'Diagnostic branch cannot create a web preview');
 assert.match(workflow,/runs-on: macos-26/);assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/workflow_dispatch|secrets\.|contents: write|matrix:|macos.*large|upload.*testflight/i);
 assert.match(workflow,new RegExp(APP_SHA));assert.match(workflow,new RegExp(FIXTURE_SHA));
 assert.equal((workflow.match(/run-observer-footprint\.mjs arm [1-4]/g)??[]).length,4);
 assert.match(workflow,/if: \$\{\{ always\(\) \}\}[\s\S]*actions\/upload-artifact@v6/);
});
