import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPagesArm} from './pages-fingerprint.mjs';
export {compareSdkBinaries} from './sdk-identity.mjs';
export const SOURCE='d7675a31fffa93699a1de65c9f786ab1ff619e30';
export const TREE='ce1ba6f3413f65e42612d82084dc40573b789486';
// Original qa-tools-source.txt pins the PR merge; its whole tree equals SOURCE.
export const TOOLS='1bc682b1d7b80e18d2b7701889eedf63832254e3';
export const BRANCH='codex/android-transport-diagnostic-d767-20261106';
export const APK_SHA='06d986835539c851041c7aab1752a2abf0749fdf79e112a38034851951e597cf';
export const CERT_SHA='1439eb44eee35946f4199a79d02946e5de18de64196e0829c5942d3bae69c91b';
export const SCHEMA_SHA='13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d';
export const ARMS=Object.freeze([{id:'A1',transport:'asg'},{id:'B1',transport:'pipe'},{id:'A2',transport:'asg'}].map(Object.freeze));
export function verifyCertificate(text){
  assert.deepEqual([...text.matchAll(/^Signer #\d+ certificate SHA-256 digest: (\S+)\r?$/gm)].map(r=>r[1]),[CERT_SHA],'Require exact single original Debug signer');
  return {verified:true,sha256:CERT_SHA};
}
export function requireInvocation(env,event){
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');
  assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');
  assert.match(env.GITHUB_RUN_ID||'',/^\d+$/);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  event??=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.created,true,'Require first branch creation');assert.equal(event.deleted,false);assert.equal(event.forced,false);
  assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.ref,env.GITHUB_REF);
  assert.equal(event.repository?.full_name,env.GITHUB_REPOSITORY);
}
export function compareConfiguration(baseline,current,transport){
  const identity=new Set(['AvdId','avd.ini.displayname']);
  for(const key of new Set([...Object.keys(baseline),...Object.keys(current)])){
    if(identity.has(key))continue;
    assert.equal(current[key],key==='hw.gltransport'?transport:baseline[key],'Uncontrolled AVD setting: '+key);
  }
  assert.equal(baseline['hw.gltransport'],'asg');assert.equal(current['hw.gltransport'],transport);
  return {verified:true,onlyTreatment:'hw.gltransport',identityFields:[...identity]};
}
export function summarizeArms(arms){
  const ordered=arms.length>0&&arms.length<=3&&arms.every((a,i)=>a.id===ARMS[i].id&&a.transport===ARMS[i].transport&&a.source===SOURCE);
  let diagnosticOutcome='INCONCLUSIVE_INCOMPLETE';
  const first=arms[0];
  if(!ordered||!first?.valid||(!first.matchesOriginal&&arms.length!==1))diagnosticOutcome='INVALID_ARM';
  else if(!first.matchesOriginal)diagnosticOutcome=first.targetAnr||first.commandFailure?'INCONCLUSIVE_DIFFERENT_FAILURE':'INCONCLUSIVE_NO_BASELINE';
  else if(arms.some(a=>!a.valid))diagnosticOutcome='INVALID_ARM';
  else if(arms.length===3){
    const [,b,a]=arms;
    if(a.matchesOriginal&&b.clean)diagnosticOutcome='TRANSPORT_SENSITIVITY_OBSERVED';
    else if(b.targetAnr&&b.matchesFailureSignature&&a.matchesOriginal)diagnosticOutcome='EXCLUSIVE_ASG_HYPOTHESIS_WEAKENED';
    else diagnosticOutcome='INCONCLUSIVE';
  }
  const technicalExitCode=diagnosticOutcome==='INVALID_ARM'||!arms.length||arms.some(a=>!a.valid||a.commandFailure||a.targetAnr)?1:0;
  return {diagnosticOnly:true,nativeAcceptance:false,releaseAcceptance:false,originalSourceGate:'FAILED',
    diagnosticOutcome,technicalExitCode,hostDeadlockProven:false,applicationExonerated:false,arms};
}
export async function executeControlledArms(execute,onProgress=()=>{}){
  const results=[];
  for(const arm of ARMS){
    let result;
    try{result=await execute(arm);assert.equal(result.id,arm.id);assert.equal(result.transport,arm.transport);assert.equal(result.source,SOURCE);}
    catch(error){result={...arm,source:SOURCE,valid:false,commandFailure:true,targetAnr:false,error:error.stack};}
    results.push(result);await onProgress([...results]);
    if(!result.valid||(arm.id==='A1'&&!result.matchesOriginal))break;
  }
  return results;
}
export function inspectArm(input){
  return inspectPagesArm(input,{source:SOURCE,tree:TREE});
}
