import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export {compareSdkBinaries} from './sdk-identity.mjs';
import {compareSdkBinaries} from './sdk-identity.mjs';
export const SOURCE='2d4a973a197a2228fcd134f01d6763f500fd63bb';
export const TREE='6c8c8afe3315d3f86f96c4805aae23894a7aa210';
export const TOOLS='d0c7bd1040993d15e382e48865e21c72ca8b3236';
export const OBSERVER='4fcc1150a74f0165a8b54526a53018862fa53703';
export const BRANCH='codex/android-host-profile-runtime-2d4-20261107';
export const APK_SHA='42234fe6dfba53c22c36be34eca3c6f28b3a38bc365827a93386ca17df5095cb';
export const CERT_SHA='3da8a98ae4f748051a83ea0cce03adf20829fbc921b6dff9551ff7bfae4da8ae';
export const SCHEMA_SHA='13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d';
export const SDK_REFERENCE_SHA='babf74a9a7bd31fddf603126cb54250d14df5f9cb114fab38738852f7182a61a';
export const ARM=Object.freeze({id:'ASG',transport:'asg'});
export const OBSERVER_BLOBS=Object.freeze({
  'scripts/qa/android-native-isolated/cohort-observation-coverage.mjs':'64d13bba5ecd3f3bcd83a98e8ca9a5c047dc09e2',
  'scripts/qa/android-native-isolated/trace-diagnostics.mjs':'002c4c39bcf4a769a48736f8b156e68497ac7b6e'
});
export const ORIGINAL_STAGES=Object.freeze(['font-regression','acceptance','geometry-regression','health-after']);
export const CONFIG=Object.freeze({'hw.cpu.ncore':'2','hw.ramSize':'4096','hw.lcd.width':'1080','hw.lcd.height':'2400','hw.lcd.density':'420','hw.keyboard':'yes','hw.camera.back':'none','hw.camera.front':'none','hw.gltransport':'asg',
  'hw.gltransport.asg.writeBufferSize':'1048576','hw.gltransport.asg.writeStepSize':'4096','hw.gltransport.asg.dataRingSize':'32768','hw.gltransport.drawFlushInterval':'800'});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyCertificate(text){assert.deepEqual([...text.matchAll(/^Signer #\d+ certificate SHA-256 digest: (\S+)\r?$/gm)].map(r=>r[1]),[CERT_SHA],'Require exact single original Debug signer');return {verified:true,sha256:CERT_SHA};}
export function requireInvocation(env,event){
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  event??=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.created,true);assert.equal(event.deleted,false);assert.equal(event.forced,false);assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.ref,env.GITHUB_REF);assert.equal(event.repository?.full_name,env.GITHUB_REPOSITORY);
}
export function verifyConfiguration(config){
  for(const [key,value]of Object.entries(CONFIG))assert.equal(config[key],value,'Changed original ASG setting: '+key);
  assert.ok(/(?:^|\/)system-images\/android-36\.1\/google_apis_playstore\/x86_64\/?$/.test(config['image.sysdir.1']||''));
  return {verified:true,expected:CONFIG,transport:'asg',renderer:'original swiftshader',freshOwnedAvd:true,physicalHardwareIdentityProven:false};
}
export function readSdkReference(bytes){
  assert.equal(digest(bytes),SDK_REFERENCE_SHA);const report=JSON.parse(bytes);assert.equal(report.referenceRun,42266716697);assert.equal(report.referenceArtifact,13527881983);assert.equal(report.historical2d4BinaryComparisonProven,false);assert.equal(report.files.length,127);compareSdkBinaries(report,report);return report;
}
export function verifyObserverFiles(files){
  assert.deepEqual(Object.keys(files).sort(),Object.keys(OBSERVER_BLOBS).sort());
  for(const [path,bytes]of Object.entries(files))assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),OBSERVER_BLOBS[path],'Changed approved observer: '+path);
  return {approvedObserverCommit:OBSERVER,files:OBSERVER_BLOBS,verified:true,scope:'Original guest/host observer only; no new WebView tracing flags, provider or product changes'};
}
export async function runOneProfile(execute){
  try{const result=await execute(ARM);assert.equal(result.id,'ASG');assert.equal(result.transport,'asg');assert.equal(result.source,SOURCE);return result;}
  catch(error){return {...ARM,source:SOURCE,valid:false,targetAnr:null,targetAnrHistoryAvailable:false,commandFailure:true,error:error.stack};}
}
export async function runOriginalStages(execute){
  const results=[];for(const name of ORIGINAL_STAGES){const result=await execute(name);assert.equal(result.label,name);results.push(result);if(result.ownershipLost||result.executed===false)throw new Error('Owned original workload scope lost at '+name);}return results;
}
export function inspectOriginalWorkload(evidence){
  const {integrity,selection,diagnostics,matrix,pages,journey,acceptance,font,geometry,healthBefore,healthAfter,stageCodes}=evidence;
  const provenance=report=>report?.provenance?.sourceCommit===SOURCE&&report.provenance.sourceTree===TREE;
  const valid=integrity===true&&selection?.verified===true&&selection.transport==='asg'&&diagnostics?.source===SOURCE&&diagnostics.ownershipVerified===true&&diagnostics.diagnosticsComplete===true&&diagnostics.continuousLogCaptured===true&&Array.isArray(diagnostics.targetAppAnrLines)&&[matrix,pages,journey,acceptance,font,geometry].every(provenance);
  const targetAnr=Array.isArray(diagnostics?.targetAppAnrLines)?diagnostics.targetAppAnrLines.length>0:null;
  const stages=Array.isArray(stageCodes)?stageCodes:[],workloads=stages.filter(r=>ORIGINAL_STAGES.includes(r.label));
  const workloadComplete=workloads.length===4&&workloads.every((r,i)=>r.label===ORIGINAL_STAGES[i]);
  const commandFailure=!workloadComplete||stages.some(r=>r.exitCode!==0||r.signal||r.error||r.executed===false);
  const profiles=Array.isArray(matrix?.results)?matrix.results:[],expected=new Set([1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>scale+'/'+orientation))),seen=new Set();
  const matrixReady=profiles.length===6&&profiles.every(r=>{const key=r.scale+'/'+r.orientation;if(!expected.has(key)||seen.has(key))return false;seen.add(key);return !r.error&&Array.isArray(r.checks)&&r.checks.length===36&&r.checks.every(c=>c.ok===true);});
  const fullWorkload=matrixReady&&pages?.samples?.length===24&&pages?.checks?.length===325&&pages.checks.every(c=>c.ok===true)&&journey?.checks?.length===8&&journey.checks.every(c=>c.ok===true)&&Array.isArray(journey.exceptions)&&journey.exceptions.length===0&&font?.ready===true&&font.actualGuardResults?.root===false&&font.actualGuardResults?.rem===false&&font.actualGuardResults?.brand===false&&geometry?.ready===true&&geometry.checks?.length===4&&geometry.checks.every(c=>c.ok===true)&&acceptance?.ready===true&&healthBefore?.healthy===true&&healthAfter?.healthy===true&&healthBefore.source===SOURCE&&healthAfter.source===SOURCE;
  return {...ARM,source:SOURCE,valid,targetAnr,commandFailure,fullWorkload,workloadComplete,clean:valid&&fullWorkload&&diagnostics.anrHistoryReady===true&&targetAnr===false&&!commandFailure,stageCodes:stages};
}
export function summarizeHostProfile(workload,profile){
  const scopeReady=profile?.preflight?.ready===true&&profile?.ownershipVerified===true&&profile?.cleanupVerified===true&&profile?.scopeErrors?.length===0&&profile?.quality?.cleanTechnicalStop===true&&profile?.parsed?.totalSamples>0;
  const offlineAnalysisReady=profile?.offlineAnalysis?.ready===true;
  const diagnosticOutcome=!workload?.valid?'INVALID_DIAGNOSTIC_ENVIRONMENT':!scopeReady?'PROFILE_UNAVAILABLE_OR_FAILED':workload.targetAnr?'PROFILE_AVAILABLE_NATIVE_ANR':!offlineAnalysisReady?'PROFILE_AVAILABLE_OFFLINE_ANALYSIS_FAILED':workload.clean?'PROFILE_AVAILABLE_NO_ANR':'PROFILE_AVAILABLE_WORKLOAD_FAILED';
  return {profileOnly:true,diagnosticOnly:true,diagnosticOutcome,technicalExitCode:workload?.clean&&scopeReady&&offlineAnalysisReady?0:1,offlineAnalysisReady,workload,profile,profileDataAvailability:profile?.quality?.dataAvailability??'unavailable',profileAttributionComplete:false,
    guestDetailedChromiumTracingAvailable:false,guestOriginalTraceRetained:true,causalTransportComparisonPerformed:false,applicationExonerated:false,hostDeadlockProven:false,originalSourceGate:'FAILED',nativeAcceptance:false,releaseAcceptance:false};
}
