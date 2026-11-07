import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE,verifyConfiguration as pinnedConfiguration,inspectOriginalWorkload} from '../android-host-profile/contract.mjs';
export {SOURCE,TREE,TOOLS,OBSERVER,APK_SHA,CERT_SHA,SCHEMA_SHA,SDK_REFERENCE_SHA,CONFIG,OBSERVER_BLOBS,ORIGINAL_STAGES,compareSdkBinaries,readSdkReference,verifyCertificate,verifyObserverFiles,runOriginalStages} from '../android-host-profile/contract.mjs';
export const BRANCH='codex/android-swangle-compatibility-2d4-20261107';
export const ARM=Object.freeze({id:'SWANGLE',transport:'asg',gpu:'swangle'});
export function requireInvocation(env,event){
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  event??=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.created,true);assert.equal(event.deleted,false);assert.equal(event.forced,false);assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.ref,env.GITHUB_REF);assert.equal(event.repository?.full_name,env.GITHUB_REPOSITORY);
}
export function verifyConfiguration(config){return {...pinnedConfiguration(config),renderer:'swangle: ANGLE with SwiftShader; must verify actual selection'};}
export function emulatorArguments(avd){
  assert.match(avd,/^sogrim_ci_\d+_1_swangle$/);
  return ['-avd',avd,'-port','5582','-no-window','-no-snapshot','-no-audio','-no-boot-anim','-gpu','swangle','-feature','GLDirectMem,HasSharedSlotsHostMemoryAllocator','-verbose','-memory','4096','-cores','2'];
}
export async function runOnce(execute){
  try{const result=await execute(ARM);for(const [key,value] of Object.entries(ARM))assert.equal(result[key],value,'Wrong single compatibility arm');assert.equal(result.source,SOURCE);return result;}
  catch(error){return {...ARM,source:SOURCE,valid:false,targetAnr:null,targetAnrHistoryAvailable:false,commandFailure:true,error:error.stack};}
}
export function inspectWorkload(evidence){
  const result=inspectOriginalWorkload(evidence),proof=evidence.rendererProof;
  const first=proof?.before?.libraries?.owner,last=proof?.after?.libraries?.owner;
  const rendererVerified=[proof?.before,proof?.after].every(p=>p?.verified===true&&p.gpu==='swangle'&&p.rendererRoute==='ANGLE+SwiftShader'&&p.loadedLibrariesVerified===true)&&Number.isSafeInteger(first?.pid)&&first.pid>1&&/^[1-9]\d*$/.test(first.startTicks||'')&&first.pid===last?.pid&&first.startTicks===last?.startTicks;
  return {...result,...ARM,rendererVerified,rendererProof:proof,valid:result.valid&&rendererVerified,clean:result.clean&&rendererVerified};
}
export function summarizeCompatibility(workload){
  const diagnosticOutcome=!workload?.valid?'INVALID_DIAGNOSTIC_ENVIRONMENT':workload.targetAnr?'SWANGLE_WORKLOAD_FAILED_ANR':workload.clean?'SWANGLE_COMPATIBILITY_COMPLETED_NO_ANR':'SWANGLE_WORKLOAD_FAILED';
  return {compatibilityOnly:true,diagnosticOnly:true,diagnosticOutcome,technicalExitCode:workload?.clean?0:1,workload,renderer:'ANGLE+SwiftShader',bpfExecuted:false,originalSourceGate:'FAILED',nativeAcceptance:false,releaseAcceptance:false,causalRendererComparisonPerformed:false,applicationExonerated:false,anrCauseProven:false,guestDetailedChromiumTracingAvailable:false,guestOriginalTraceRetained:true};
}
