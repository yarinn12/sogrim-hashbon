import assert from 'node:assert/strict';
export const SOURCE='7d6e13f561578bc8001f789046e1275b8a166a39';
export const TREE='0641036614db318b59ed0a356e86da5623eef474';
// The PR merge used this tools commit. Its tree is byte-identical to SOURCE.
export const TOOLS='17c28d3fc7097709baa8da1b572e2fd895e4cd5b';
export const BRANCH='codex/android-transport-diagnostic-7d6-20261106';
export const APK_SHA='1f874e1088d817a4f4e4acd52f05e674a9852e25ebd8db8bdd03ec909e966516';
export const CERT_SHA='a548cfb5e193dfb0880914c9a81f012d10da81fd27f606ce1b038f4a2452342c';
export const SCHEMA_SHA='13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d';
export const ARMS=Object.freeze([{id:'A1',transport:'asg'},{id:'B1',transport:'pipe'},{id:'A2',transport:'asg'}].map(Object.freeze));
export function verifyCertificate(text){
  assert.deepEqual([...text.matchAll(/^Signer #\d+ certificate SHA-256 digest: (\S+)\r?$/gm)].map(r=>r[1]),[CERT_SHA],'Require exact single original Debug signer');
  return {verified:true,sha256:CERT_SHA};
}
export function requireInvocation(env){
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');
  assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');
  assert.match(env.GITHUB_RUN_ID||'',/^\d+$/);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
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
  const technicalExitCode=!arms.length||arms.some(a=>!a.valid||a.commandFailure||a.targetAnr)?1:0;
  let diagnosticOutcome='INCONCLUSIVE_INCOMPLETE';
  const first=arms[0];
  if(!first?.valid)diagnosticOutcome='INVALID_ARM';
  else if(!first.matchesOriginal)diagnosticOutcome=first.targetAnr||first.commandFailure?'INCONCLUSIVE_DIFFERENT_FAILURE':'INCONCLUSIVE_NO_BASELINE';
  else if(arms.some(a=>!a.valid))diagnosticOutcome='INVALID_ARM';
  else if(arms.length===3){
    const [,b,a]=arms;
    if(a.matchesOriginal&&b.clean)diagnosticOutcome='TRANSPORT_SENSITIVITY_OBSERVED';
    else if(b.targetAnr&&b.graphicsFocusAnr&&a.matchesOriginal)diagnosticOutcome='EXCLUSIVE_ASG_HYPOTHESIS_WEAKENED';
    else diagnosticOutcome='INCONCLUSIVE';
  }
  return {diagnosticOnly:true,nativeAcceptance:false,releaseAcceptance:false,originalSourceGate:'FAILED',
    diagnosticOutcome,technicalExitCode,hostDeadlockProven:false,applicationExonerated:false,arms};
}
export async function executeControlledArms(execute,onProgress=()=>{}){
  const results=[];
  for(const arm of ARMS){
    let result;
    try{result=await execute(arm);assert.equal(result.id,arm.id);assert.equal(result.transport,arm.transport);}
    catch(error){result={...arm,valid:false,commandFailure:true,targetAnr:false,error:error.stack};}
    results.push(result);await onProgress([...results]);
    if(!result.valid||(arm.id==='A1'&&!result.matchesOriginal))break;
  }
  return results;
}
export function inspectArm({id,transport,diagnostics,matrix,stacks,stageCodes,integrity}){
  const lines=diagnostics?.targetAppAnrLines||[],targetAnr=lines.length>0;
  const graphicsFocusAnr=targetAnr&&lines.some(s=>/Input dispatching timed out.*FocusEvent\(hasFocus=true\)/.test(s))&&
    /DrawFrameTask::drawFrame/.test(stacks)&&/WebViewFunctor::drawGl/.test(stacks);
  const failed=matrix?.results?.find(r=>r.scale===1.5&&r.orientation==='portrait');
  const matchesOriginal=transport==='asg'&&graphicsFocusAnr&&/AddressSpaceStream::/.test(stacks)&&/rcCreateSyncKHR_enc/.test(stacks)&&
    /Actual owned QA Activity foreground before rotation timed out/.test(failed?.error||'')&&failed?.state?.screen==='home'&&
    Number(failed?.state?.fontScale)===1.5&&failed?.rotationReceipt?.commandApplications===0;
  const valid=integrity===true&&diagnostics?.source===SOURCE&&diagnostics?.ownershipVerified===true&&
    diagnostics?.diagnosticsComplete===true&&diagnostics?.continuousLogCaptured===true;
  const commandFailure=stageCodes.some(c=>c.exitCode!==0||c.error||c.signal);
  const clean=valid&&!commandFailure&&!targetAnr&&diagnostics.anrHistoryReady===true;
  return {id,transport,valid,targetAnr,graphicsFocusAnr,matchesOriginal,clean,commandFailure,stageCodes,
    invalidReason:valid?null:'Required integrity, identity, complete trace or ANR evidence is absent'};
}
