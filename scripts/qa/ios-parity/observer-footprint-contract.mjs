import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,readdirSync,realpathSync,readlinkSync} from 'node:fs';
import {resolve,relative,sep,join,isAbsolute} from 'node:path';

export const APP_SHA='8b8bfa6da7fc88e7e846c894d26b59120c871468';
export const TREE='11c02930f0312b030b90f78d104ded8acfad60f0';
export const FIXTURE_SHA='5115472ada3f5661d4aa81a23d9a38eb6529b44f';
export const BRANCH='codex/ios475-observer-footprint-abba-20261016';
export const WORKFLOW='.github/workflows/ios475-observer-footprint-abba-20261016.yml';
export const ORDER=Object.freeze(['on','off','off','on']);
export const DEVICE_TYPE='com.apple.CoreSimulator.SimDeviceType.iPhone-16';
export const RUNTIME_VERSION='26.5';
export const PHASES=Object.freeze(['home','expenses','summary','transfers','notes','note-opened','profile','keyboard-ready','keyboard-amount','keyboard-name','saved','resumed','restored']);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const stamp=()=>({utc:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString()});
const uuid=/^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/;
const same=(a,b)=>resolve(a)===resolve(b);
export function requireEnvelope(e){
 assert.equal(e.IOS475_OBSERVER_FOOTPRINT,'reviewed-diagnostic-only','Inactive preparation');
 assert.equal(e.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');assert.equal(e.GITHUB_EVENT_NAME,'push');
 assert.equal(e.GITHUB_REF,'refs/heads/'+BRANCH);
 assert.equal(e.GITHUB_WORKFLOW_REF,e.GITHUB_REPOSITORY+'/'+WORKFLOW+'@'+e.GITHUB_REF);
 assert.equal(e.GITHUB_RUN_NUMBER,'1');assert.equal(e.GITHUB_RUN_ATTEMPT,'1');
 assert.match(e.GITHUB_RUN_ID??'',/^[1-9][0-9]*$/);assert.match(e.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
 assert.equal(e.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD,'1');
 for(const key of ['QA_STATUS_PUBLICATION','TEST_RUNNER_QA_STATUS_PUBLICATION'])assert.ok(!e[key],'No status-publication experiment override');
 return {run:e.GITHUB_RUN_ID,attempt:1,toolsSha:e.GITHUB_SHA};
}
export function requireCheckouts({app,fixture,tools,toolsSha,git}){
 const roots=[app,fixture,tools].map(p=>realpathSync(p));
 assert.equal(new Set(roots).size,3,'Three separate checkouts');
 for(const [root,expected] of [[roots[0],APP_SHA],[roots[1],FIXTURE_SHA],[roots[2],toolsSha]]){
  assert.ok(same(git(root,['rev-parse','--show-toplevel']),root));
  assert.equal(git(root,['rev-parse','HEAD']),expected);
  if(root!==roots[2])assert.equal(git(root,['rev-parse','HEAD^{tree}']),TREE);
 }
 for(const root of [roots[1],roots[2]])assert.equal(git(root,['status','--porcelain','--untracked-files=all']),'','Changed tools/fixture checkout');
 return {app:roots[0],fixture:roots[1],tools:roots[2],toolsSha};
}
export function requireBaseline(m,b){
 for(const [key,value]of Object.entries({sourceSha:APP_SHA,sourceTree:TREE,fixtureSha:FIXTURE_SHA,fixtureTree:TREE}))assert.equal(m[key],value,key);
 for(const [key,count]of [['source',50],['www',214],['qaFixtures',18]]){
  assert.equal(Object.keys(m[key]??{}).length,count,key);
  assert.deepEqual(m[key],b[key],key+' differs from original QA475');
 }
}
export function requireFileMap(root,map){
 for(const [p,h]of Object.entries(map)){
  assert.ok(p&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..'));
  assert.match(h,/^[a-f0-9]{64}$/);
  const full=join(root,p);assert.ok(lstatSync(full).isFile()&&!lstatSync(full).isSymbolicLink());
  assert.equal(realpathSync(full),full);assert.equal(sha(readFileSync(full)),h,p);
 }
}
export function inventory(root){
 root=realpathSync(root);const out={};
 function walk(dir){for(const name of readdirSync(dir).sort()){
  const p=join(dir,name),s=lstatSync(p),key=relative(root,p).split(sep).join('/');
  if(s.isSymbolicLink()){
   const target=realpathSync(p),rel=relative(root,target);
   assert.ok(!isAbsolute(rel)&&rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!resolve(target).startsWith(root+sep+'..'));
   out[key]={link:readlinkSync(p)};
  }else if(s.isDirectory())walk(p);
  else {assert.ok(s.isFile());out[key]={bytes:s.size,sha256:sha(readFileSync(p))};}
 }}
 walk(root);assert.ok(Object.keys(out).length>0);return out;
}
export function requireProductsSame(current,original){assert.deepEqual(current,original,'Compiled products changed; arm invalid');}
export function selectSdk(runtimes,types){
 const rows=runtimes.filter(r=>r.isAvailable===true&&r.version===RUNTIME_VERSION&&r.identifier.includes('.iOS-'));
 assert.equal(rows.length,1,'Require exact available iOS26.5 runtime');
 const devices=types.filter(d=>d.identifier===DEVICE_TYPE&&d.name==='iPhone 16');assert.equal(devices.length,1);
 return {runtime:rows[0].identifier,runtimeVersion:rows[0].version,deviceType:DEVICE_TYPE};
}
export function ownedDevice(deviceRows,owner){
 assert.match(owner.udid??'',uuid);const matches=[];
 for(const [runtime,rows]of Object.entries(deviceRows))for(const row of rows)if(row.udid===owner.udid)matches.push({runtime,...row});
 assert.equal(matches.length,1,'Owned simulator missing/ambiguous');const d=matches[0];
 assert.equal(d.name,owner.name);assert.equal(d.runtime,owner.runtime);
 if(d.deviceTypeIdentifier!==undefined)assert.equal(d.deviceTypeIdentifier,DEVICE_TYPE);
 return d;
}
export function armVerdict(r){
 const setup=r.bootValid===true&&r.sdkStable===true&&r.productsStable===true;
 const capture=r.captureValid===true&&['passed','failed'].includes(r.initialWait)&&Number.isInteger(r.testExit)&&r.testExit>=0&&!(r.testExit===0&&r.initialWait==='failed');
 const observer=r.mode==='off'?r.observer?.started===false:r.observer?.started===true&&r.observer?.closed===true&&r.observer?.reportPresent===true&&r.observer?.coverageValid===true;
 return {comparisonEligible:setup&&capture&&observer&&r.cleanupVerified===true&&(r.errors??[]).length===0,
  testPassed:r.testExit===0,initialWait:r.initialWait??'unknown',
  nativeAcceptance:false,sourceAccepted:false,distributionAllowed:false};
}
export function startupMetrics(startup,status){
 const provenance=r=>Number.isFinite(r.time)&&r.time>0&&r.sourceSha===APP_SHA&&r.sourceTree===TREE&&r.fixtureSha===FIXTURE_SHA&&r.fixtureTree===TREE;
 assert.ok(startup.length&&startup.every(provenance),'Startup source/fixture mismatch');
 const session=startup[0].session;assert.ok(startup.every(r=>r.session===session));
 const s=status.filter(r=>r.session===session);assert.ok(s.length&&s.every(r=>Number.isFinite(r.time)&&r.time>0&&r.sourceSha===APP_SHA&&r.sourceTree===TREE));
 const marks={},events={};
 for(const r of startup){
  if(r.event==='web-stage'&&r.stage==='startup-milestone'){
   if(marks[r.milestone])continue;
   assert.ok(Number.isFinite(r.startMs)&&Number.isFinite(r.monotonicMs));
   marks[r.milestone]={producerStartMs:r.startMs,observerDeliveryMs:r.monotonicMs,nativeReceiptEpoch:r.time};
  }
  if(r.event==='web-stage'&&!events[r.stage])events[r.stage]={producerMonotonicMs:r.monotonicMs,producerEpochMs:r.epochMs,nativeReceiptEpoch:r.time};
 }
 const published=s.find(r=>r.event==='published');
 return {session,marks,events,firstNativePublicationEpoch:published?.time??null,
  firstNativeStartupEpoch:startup[0].time,producerVsObserverSeparated:true,firstScreenMarkIsPaintProof:false,homePollIsFirstPhysicalFrameProof:false};
}
export function inspectDefaultEvidence(report,startups,statuses,testLog,images){
 assert.equal(report.sourceSha,APP_SHA);assert.equal(report.sourceTree,TREE);
 assert.equal(report.controller,'SogrimParityBridgeViewController');assert.equal(report.bridgeAvailable,true);
 assert.equal(report.preferredContentSizeCategory,'UICTContentSizeCategoryL');
 const phases=report.records.map(r=>r.phase);assert.ok(phases.length>0&&phases.length<=PHASES.length);
 assert.deepEqual(phases,PHASES.slice(0,phases.length));
 const first=report.records[0],session=first.captureSession;
 const startup=startups.filter(r=>r.session===session);const status=statuses.filter(r=>r.session===session);
 const metrics=startupMetrics(startup,status);

 assert.ok(images&&typeof images==='object','Capture image inventory required');
 const sessions=new Set(report.records.map(r=>r.captureSession));
 assert.deepEqual([...new Set(startups.map(r=>r.session))].sort(),[...sessions].sort(),'Foreign startup session');
 assert.deepEqual([...new Set(statuses.map(r=>r.session))].sort(),[...sessions].sort(),'Foreign status session');
 assert.equal(sessions.size,phases.includes('restored')?2:1);
 for(let i=0;i<report.records.length;i++){
  const record=report.records[i];assert.equal(record.index,i+1);
  if(record.phase!=='restored')assert.equal(record.captureSession,session);
  else assert.notEqual(record.captureSession,session);
  assert.equal(record.nativeShell,true);assert.equal(record.platform,'ios');
  assert.equal(record.appUrl,'capacitor://localhost');assert.deepEqual(record.errors,[]);
  const sr=statuses.filter(r=>r.session===record.captureSession);
  const jr=startups.filter(r=>r.session===record.captureSession);
  startupMetrics(jr,sr);
  const received=sr.filter(r=>r.event==='captureReceived'&&r.index===record.index);
  const written=sr.filter(r=>r.event==='captureWritten'&&r.index===record.index);
  const ack=sr.filter(r=>r.event==='captureAckCallback'&&r.index===record.index);
  assert.equal(received.length,1);assert.equal(written.length,1);assert.equal(ack.length,1);
  assert.equal(received[0].phase,record.phase);assert.equal(ack[0].error,'');
  assert.ok(received[0].time<=written[0].time&&written[0].time<=ack[0].time);
  const witness=record.visualCapture;
  assert.equal(witness?.phase,record.phase);assert.equal(witness?.splashAbsent,true);
  const mark=jr.find(r=>r.event==='web-stage'&&r.stage==='startup-milestone'&&r.milestone==='splash-dismissed');
  assert.ok(mark&&Number.isFinite(witness.splashMarkMs)&&Number.isFinite(witness.capturedAtMs));
  assert.ok(Math.abs(witness.splashMarkMs-mark.startMs)<=0.5&&witness.splashMarkMs<=witness.capturedAtMs);
  const image=images['native-parity-'+record.phase+'.png'];
  assert.ok(image&&image.bytes>1000&&image.signature==='89504e470d0a1a0a','Missing/corrupt original capture');
 }
 for(const captureSession of sessions){
  const expected=report.records.filter(r=>r.captureSession===captureSession).length;
  for(const event of ['captureReceived','captureWritten','captureAckCallback'])
   assert.equal(statuses.filter(r=>r.session===captureSession&&r.event===event).length,expected);
 }

 const received=status.find(r=>r.event==='captureReceived'&&r.index===1&&r.phase==='home');
 const ack=status.find(r=>r.event==='captureAckCallback'&&r.index===1&&r.error==='');
 assert.ok(received&&ack&&metrics.firstNativePublicationEpoch!==null,'Incomplete initial home capture/ACK/publication');
 const failedInitial=/NATIVE_STATUS_MISSING:/.test(testLog)&&/XCTAssertTrue failed/.test(testLog);
 const complete=/NATIVE_PARITY_XCTEST_SUCCESS:/.test(testLog)||phases.includes('keyboard-amount');
 return {captureValid:true,initialWait:failedInitial?'failed':complete?'passed':'unknown',
  observedPhases:phases,metrics,fullTwoModeValidatorRun:false,nativeAcceptance:false};
}

export function observerCoverage(report,owner,metrics){
 assert.equal(report.udid,owner.udid);assert.equal(report.bundleId,'com.sogrimhashbon.app');
 assert.equal(report.sourceSha,APP_SHA);assert.equal(report.sourceTree,TREE);
 assert.ok(Number.isFinite(report.startedWall)&&Number.isFinite(report.finishedWall));
 const first=metrics.firstNativeStartupEpoch;
 const pub=metrics.firstNativePublicationEpoch;
 assert.ok(Number.isFinite(first)&&Number.isFinite(pub),'Missing native interval endpoints');
 assert.ok(report.startedWall<=first&&report.finishedWall>=pub,'Observer did not cover cold-start publication interval');
 return true;
}
export function expectedPublicMap(b){
 const expected={...b.www};
 for(const name of ['startup-diagnostics','synthetic-service','input-trace','journey'])
  expected['ios-parity-'+name+'.js']=b.qaFixtures[name+'.js'];
 assert.equal(Object.keys(expected).length,218);
 return expected;
}
export function requirePublic(root,b){
 const expected=expectedPublicMap(b),actual=inventory(root);
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),'Unexpected public assets');
 requireFileMap(root,expected);
 return actual;
}
function verifiedFreshSimulatorCount(owners){
 const identities=new Set();
 for(const [index,owner]of owners.entries()){
  try{
   assert.equal(owner.trial,index+1);assert.equal(owner.mode,ORDER[index]);
   assert.equal(owner.deviceType,DEVICE_TYPE);assert.match(owner.udid??'',uuid);
   const proof=owner.creationProof;assert.equal(proof.exit,0);
   assert.match(proof.receipt,/^commands\/[0-9]+-owned-create\.json$/);
   assert.match(proof.responseSha256,/^[a-f0-9]{64}$/);
   assert.ok(Number.isFinite(Date.parse(proof.verified.utc)));
   assert.match(proof.verified.monotonicNs,/^[1-9][0-9]*$/);
   const d=ownedDevice({[owner.runtime]:[proof.device]},owner);
   assert.equal(d.state,'Shutdown');
   identities.add(owner.udid);
  }catch{} // A partial or unverified create is retained, never counted as complete.
 }
 return identities.size;
}
export function aggregate(rows,owners=[]){
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.mode),ORDER);
 assert.deepEqual(rows.map(r=>r.trial),[1,2,3,4]);
 const createdCount=verifiedFreshSimulatorCount(owners);
 return {order:[...ORDER],rows,allArmsComparable:rows.every(r=>r.comparisonEligible===true),
  verifiedFreshSimulatorCount:createdCount,sameHostFourFreshSimulators:owners.length===4&&createdCount===4,
 diagnosticOnly:true,defaultOnly:true,fullTwoModeValidatorRun:false,nativeAcceptance:false,sourceAccepted:false,distributionAllowed:false};
}

export function nextArm(rows,owners,index){
 assert.ok(Number.isInteger(index)&&index>=1&&index<=4);
 assert.equal(rows.length,index-1,'Fixed order; retry or skipped arm forbidden');
 assert.equal(owners.length,4);assert.equal(new Set(owners.map(o=>o.udid)).size,4);
 for(let i=0;i<4;i++){assert.equal(owners[i].trial,i+1);assert.equal(owners[i].mode,ORDER[i]);assert.match(owners[i].udid??'',uuid);}
 assert.deepEqual(rows.map(r=>r.mode),ORDER.slice(0,index-1));
 assert.deepEqual(rows.map(r=>r.trial),Array.from({length:index-1},(_,i)=>i+1));
 return owners[index-1];
}

export async function finishArm(row,hooks){
 for(const stage of ['collect','inspect','after','cleanup']){
  try{await hooks[stage]();}
  catch(e){
   row.errors.push(stage+': '+String(e.stack??e));
   if(stage==='inspect')row.captureValid=false;
   if(stage==='after'){row.sdkStable=false;row.productsStable=false;}
   if(stage==='cleanup')row.cleanupVerified=false;
  }
 }
 if(hooks.interrupted)row.errors.push('Interrupted by outer process/workflow budget');
 row.end=stamp();Object.assign(row,armVerdict(row));await hooks.persist(row);
 // Preserve a valid negative observation, then fail this CI arm transparently.
 // The workflow continues with the other fresh arms; raw testExit stays unchanged.
 assert.ok(row.comparisonEligible&&row.testExit===0,
  `Arm ${row.trial} failed after evidence persisted: XCTest=${row.testExit}, comparable=${row.comparisonEligible}`);
 return row;
}
