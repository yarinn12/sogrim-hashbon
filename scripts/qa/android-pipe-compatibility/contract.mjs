import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compareSdkBinaries} from './sdk-identity.mjs';
export {compareSdkBinaries};
export const SOURCE='2d4a973a197a2228fcd134f01d6763f500fd63bb';
export const TREE='6c8c8afe3315d3f86f96c4805aae23894a7aa210';
export const TOOLS='d0c7bd1040993d15e382e48865e21c72ca8b3236';
export const OBSERVER='4fcc1150a74f0165a8b54526a53018862fa53703';
export const BRANCH='codex/android-pipe-compatibility-2d4-20261106';
export const APK_SHA='42234fe6dfba53c22c36be34eca3c6f28b3a38bc365827a93386ca17df5095cb';
export const CERT_SHA='3da8a98ae4f748051a83ea0cce03adf20829fbc921b6dff9551ff7bfae4da8ae';
export const SCHEMA_SHA='13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d';
export const SDK_REFERENCE_SHA='babf74a9a7bd31fddf603126cb54250d14df5f9cb114fab38738852f7182a61a';
export const PIPE=Object.freeze({id:'PIPE',transport:'pipe'});
export const OBSERVER_BLOBS=Object.freeze({
  'scripts/qa/android-native-isolated/cohort-observation-coverage.mjs':'64d13bba5ecd3f3bcd83a98e8ca9a5c047dc09e2',
  'scripts/qa/android-native-isolated/trace-diagnostics.mjs':'002c4c39bcf4a769a48736f8b156e68497ac7b6e'
});
export const ORIGINAL_STAGES=Object.freeze(['font-regression','acceptance','geometry-regression','health-after']);
export const CONFIG=Object.freeze({'hw.cpu.ncore':'2','hw.ramSize':'4096','hw.lcd.width':'1080','hw.lcd.height':'2400','hw.lcd.density':'420','hw.keyboard':'yes','hw.camera.back':'none','hw.camera.front':'none','hw.gltransport':'pipe',
  'hw.gltransport.asg.writeBufferSize':'1048576','hw.gltransport.asg.writeStepSize':'4096','hw.gltransport.asg.dataRingSize':'32768','hw.gltransport.drawFlushInterval':'800'});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyCertificate(text){assert.deepEqual([...text.matchAll(/^Signer #\d+ certificate SHA-256 digest: (\S+)\r?$/gm)].map(row=>row[1]),[CERT_SHA],'Require exact single original Debug signer');return {verified:true,sha256:CERT_SHA};}
export function requireInvocation(env,event){
  assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  if(!event)event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.created,true);assert.equal(event.deleted,false);assert.equal(event.forced,false);assert.equal(event.before,'0'.repeat(40));assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.ref,env.GITHUB_REF);assert.equal(event.repository?.full_name,env.GITHUB_REPOSITORY);
}
export function verifyConfiguration(config){
  for(const [key,value]of Object.entries(CONFIG))assert.equal(config[key],value,'Unexpected Pipe compatibility AVD setting: '+key);
  assert.ok(/(?:^|\/)system-images\/android-36\.1\/google_apis_playstore\/x86_64\/?$/.test(config['image.sysdir.1']||''),'Unexpected guest image path');
  return {verified:true,expected:CONFIG,transport:'pipe',comparisonScope:'Pinned original effective settings and SDK image; fresh owned AVD identity/paths differ',physicalHardwareIdentityProven:false};
}
export function readSdkReference(bytes){
  assert.equal(digest(bytes),SDK_REFERENCE_SHA,'Changed SDK binary reference');const report=JSON.parse(bytes);
  assert.equal(report.referenceRun,42266716697);assert.equal(report.referenceArtifact,13527881983);assert.equal(report.historical2d4BinaryComparisonProven,false);assert.equal(report.files.length,127);compareSdkBinaries(report,report);return report;
}
export function verifyObserverFiles(files){
  assert.deepEqual(Object.keys(files).sort(),Object.keys(OBSERVER_BLOBS).sort());
  for(const [path,bytes]of Object.entries(files))assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),OBSERVER_BLOBS[path],'Unreviewed observer source: '+path);
  return {approvedObserverCommit:OBSERVER,files:OBSERVER_BLOBS,verified:true,scope:'Trace start/watch/finish tools only; original application/workload checkout is unmodified'};
}
export async function executePipe(execute){
  // One unconditional Pipe attempt. No ASG baseline, ABA branch or retry exists.
  try{const result=await execute(PIPE);assert.equal(result.id,'PIPE');assert.equal(result.transport,'pipe');assert.equal(result.source,SOURCE);return result;}
  catch(error){return {...PIPE,source:SOURCE,valid:false,commandFailure:true,targetAnr:null,targetAnrHistoryAvailable:false,error:error.stack};}
}
export async function runOriginalStages(execute){
  const results=[];
  for(const name of ORIGINAL_STAGES){
    const result=await execute(name);assert.equal(result.label,name);results.push(result);
    // A workload exit is retained and does not skip later original checks.
    // Lost ownership or a command that could not execute is an invalid scope.
    if(result.ownershipLost||result.executed===false)throw new Error('Owned workload scope lost at '+name);
  }
  return results;
}
export function inspectCompatibility(evidence){
  const {integrity,selection,diagnostics,matrix,pages,journey,acceptance,font,geometry,healthBefore,healthAfter,stageCodes}=evidence;
  const provenance=report=>report?.provenance?.sourceCommit===SOURCE&&report.provenance.sourceTree===TREE;
  const valid=integrity===true&&selection?.verified===true&&selection.transport==='pipe'&&diagnostics?.source===SOURCE&&diagnostics.ownershipVerified===true&&diagnostics.diagnosticsComplete===true&&diagnostics.continuousLogCaptured===true&&Array.isArray(diagnostics.targetAppAnrLines)&&[matrix,pages,journey,acceptance,font,geometry].every(provenance);
  const targetAnr=Array.isArray(diagnostics?.targetAppAnrLines)&&diagnostics.targetAppAnrLines.length>0;
  const stages=Array.isArray(stageCodes)?stageCodes:[],workloads=stages.filter(row=>ORIGINAL_STAGES.includes(row.label));
  const workloadComplete=workloads.length===ORIGINAL_STAGES.length&&workloads.every((row,i)=>row.label===ORIGINAL_STAGES[i]);
  const commandFailure=!workloadComplete||stages.some(row=>row.exitCode!==0||row.signal||row.error||row.executed===false);
  const profiles=Array.isArray(matrix?.results)?matrix.results:[],expected=new Set([1,1.5,2].flatMap(scale=>['portrait','landscape'].map(orientation=>scale+'/'+orientation)));
  const seen=new Set();
  const matrixReady=profiles.length===6&&profiles.every(row=>{const key=row.scale+'/'+row.orientation;if(!expected.has(key)||seen.has(key))return false;seen.add(key);return !row.error&&Array.isArray(row.checks)&&row.checks.length===36&&row.checks.every(check=>check.ok===true);});
  const pagesReady=pages?.samples?.length===24&&pages?.checks?.length===325&&pages.checks.every(check=>check.ok===true);
  const journeyReady=journey?.checks?.length===8&&journey.checks.every(check=>check.ok===true)&&Array.isArray(journey.exceptions)&&journey.exceptions.length===0;
  const negativesReady=font?.ready===true&&font.actualGuardResults?.root===false&&font.actualGuardResults?.rem===false&&font.actualGuardResults?.brand===false&&geometry?.ready===true&&geometry.checks?.length===4&&geometry.checks.every(check=>check.ok===true);
  const fullWorkload=matrixReady&&pagesReady&&journeyReady&&negativesReady&&acceptance?.ready===true&&healthBefore?.healthy===true&&healthAfter?.healthy===true&&healthBefore.source===SOURCE&&healthAfter.source===SOURCE;
  const compatible=valid&&fullWorkload&&diagnostics.anrHistoryReady===true&&!targetAnr&&!commandFailure;
  return {...PIPE,source:SOURCE,valid,compatible,targetAnr,commandFailure,fullWorkload,workloadComplete,stageCodes:stages};
}
export function summarizeCompatibility(result){
  const valid=result?.id==='PIPE'&&result.transport==='pipe'&&result.source===SOURCE&&result.valid===true;
  const compatible=valid&&result.compatible===true&&result.fullWorkload===true&&result.workloadComplete===true&&result.targetAnr===false&&result.commandFailure===false;
  const compatibilityOutcome=!valid?'INVALID_PIPE_ENVIRONMENT':compatible?'PIPE_COMPATIBILITY_OBSERVED':'PIPE_WORKLOAD_FAILED';
  return {compatibilityOnly:true,diagnosticOnly:true,compatibilityOutcome,technicalExitCode:compatible?0:1,result,causalTransportComparisonPerformed:false,asgBaselineRequired:false,asgArmExecuted:false,applicationExonerated:false,hostDeadlockProven:false,originalSourceGate:'FAILED',nativeAcceptance:false,releaseAcceptance:false};
}
