import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CONTRACT,INTAKE_BINDINGS,requireBoundIntakePins,integer} from './intake-bindings.mjs';
import {verifyFirstCreationReceipt} from './first-creation-guard.mjs';
export const SIGNING_REF=CONTRACT.repository+'/'+CONTRACT.signingPath+'@refs/heads/'+CONTRACT.signingBranch;
export const SIGNING_STEPS=Object.freeze([
 'Require first branch creation and two complete workflow histories',
 'Require all four successful source CI runs before signing secrets',
 'Require pinned source CI and read unused build number before signing',
 'Recheck exact source CI and current unused number after export',
 'Require all packaged web assets, release entitlements and valid distribution profile',
 'Encrypt only the verified IPA and its evidence for private retention',
 'Retain only encrypted release output for one day'
]);
export const CONTROL_PATHS=Object.freeze({
 firstCreation:'scripts/qa/ios-signing/first-creation-guard.mjs',
 sourceGuard:'scripts/qa/ios-signing/source-guard.mjs',
 workflow:CONTRACT.signingPath,requiredJobs:'scripts/qa/ios-signing/source-ci-required-jobs.mjs'
});
const sha=data=>createHash('sha256').update(data).digest('hex');
export function verifySigningControls(headSha,dirty,files,pins=INTAKE_BINDINGS){
 requireBoundIntakePins(pins);
 assert.equal(headSha,pins.signing.toolsSha,'Original signing controls checkout SHA differs');
 assert.equal(dirty,'','Original signing controls checkout changed');
 const hashes={};
 for(const [key,path]of Object.entries(CONTROL_PATHS)){
  const bytes=files[path];assert.ok(Buffer.isBuffer(bytes)||typeof bytes==='string','Missing original signing control: '+path);
  assert.ok(Buffer.byteLength(bytes)>0&&Buffer.byteLength(bytes)<1048576,'Unbounded signing control');
  hashes[key]=sha(bytes);assert.equal(hashes[key],pins.signing.controls[key],'Original signing control bytes differ: '+path);
 }
 assert.equal(hashes.firstCreation,CONTRACT.producerVerifierSha256);
 const workflow=String(files[CONTROL_PATHS.workflow]),guard=String(files[CONTROL_PATHS.sourceGuard]);
 assert.ok(workflow.includes('id: first_creation'),'Signing first-creation step missing');
 assert.ok(!workflow.includes('github.run_number == 1'),'Obsolete signing counter assumption');
 for(const phase of ['ci-only','before-build','after-export']){
  const command='source-guard.mjs" '+phase,at=workflow.indexOf(command);
  assert.ok(at>=0,'Signing source phase missing');
  const step=workflow.slice(workflow.lastIndexOf('      - name:',at),at);
  assert.ok(step.includes('IOS_FIRST_CREATION_RECEIPT: $'+'{{ steps.first_creation.outputs.receipt_path }}'));
  assert.ok(step.includes('IOS_FIRST_CREATION_SHA256: $'+'{{ steps.first_creation.outputs.receipt_sha256 }}'));
 }
 assert.ok(guard.includes('const firstCreation=verifySigningFirstCreation('));
 assert.ok(guard.includes('...source, firstCreation, phase, ci, apple, artifactSlot'));
 assert.ok(guard.includes("RELEASE_SOURCE = '"+pins.application.sourceSha+"'"));
 assert.ok(guard.includes("RELEASE_TREE = '"+pins.application.sourceTree+"'"));
 for(const [key,value]of Object.entries({SOURCE_SHA:pins.application.sourceSha,SOURCE_TREE:pins.application.sourceTree,...pins.application.ciRuns}))
  assert.ok(workflow.includes(key+': "'+value+'"'),'Signing workflow source/CI binding differs: '+key);
 return {ready:true,signingTools:headSha,hashes};
}
export function requireSigningSteps(job){
 assert.ok(Array.isArray(job.steps)&&job.steps.length>0,'Original signing steps missing');
 assert.equal(new Set(job.steps.map(s=>s.number)).size,job.steps.length,'Duplicate signing step number');
 for(const step of job.steps)assert.ok(integer(step.number),'Invalid signing step number');
 let prior=0;const proof=[];
 for(const name of SIGNING_STEPS){
  const matches=job.steps.filter(s=>s.name===name);assert.equal(matches.length,1,'Missing/duplicate signing control step: '+name);
  const step=matches[0];assert.equal(step.status,'completed');assert.equal(step.conclusion,'success');
  assert.ok(step.number>prior,'Signing control step order differs');prior=step.number;
  proof.push({name,number:step.number,status:step.status,conclusion:step.conclusion});
 }
 return proof;
}
export function validateOriginReceipt(origin,pins=INTAKE_BINDINGS){
 requireBoundIntakePins(pins);const a=pins.application,s=pins.signing;
 for(const [key,value]of Object.entries({sourceCommit:a.sourceSha,sourceTree:a.sourceTree,signingTools:s.toolsSha,
  signingRunId:s.runId,signingRunAttempt:'1',signingRunNumber:s.runNumber,signingJobId:s.jobId,
  artifactId:s.artifactId,artifactSize:s.artifactSize,artifactDigest:'sha256:'+s.zipSha256,
  ipaSha256:s.ipaSha256,ipaSize:s.ipaSize,workflowRef:SIGNING_REF,
  scope:'PACKAGE_INTAKE_ONLY',firstCreationStepPassed:true,
  appleUploadPerformed:false,databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false}))
  assert.equal(origin?.[key],value,'Original receipt binding differs: '+key);
 assert.ok(integer(origin.signingWorkflowId),'Original workflow ID missing');
 assert.deepEqual(origin.signingControlHashes,s.controls);
 assert.deepEqual(origin.signingSteps,requireSigningSteps({steps:origin.signingSteps}));
 return origin;
}
export function verifyStoredFirstCreation(proof,origin,pins=INTAKE_BINDINGS){
 validateOriginReceipt(origin,pins);const a=pins.application,s=pins.signing;
 const ref='refs/heads/'+CONTRACT.signingBranch;
 const context={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:CONTRACT.repository,GITHUB_REPOSITORY_ID:String(CONTRACT.repositoryId),
  GITHUB_REF:ref,GITHUB_REF_NAME:CONTRACT.signingBranch,GITHUB_REF_TYPE:'branch',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_RUN_ID:s.runId,GITHUB_RUN_NUMBER:String(s.runNumber),GITHUB_SHA:s.toolsSha,GITHUB_WORKFLOW_SHA:s.toolsSha,
  GITHUB_WORKFLOW:CONTRACT.signingName,GITHUB_WORKFLOW_REF:SIGNING_REF,GITHUB_API_URL:'https://api.github.com',
  GITHUB_SERVER_URL:'https://github.com',WORKFLOW_COMMIT:s.toolsSha,WORKFLOW_REF:SIGNING_REF,
  SOURCE_SHA:a.sourceSha,SOURCE_TREE:a.sourceTree,IOS_VERSION:CONTRACT.version,IOS_BUILD:CONTRACT.build,...a.ciRuns};
 const event={ref,repository:{full_name:CONTRACT.repository,id:CONTRACT.repositoryId},created:true,before:'0'.repeat(40),
  after:s.toolsSha,head_commit:{id:s.toolsSha},forced:false,deleted:false};
 // This local encoding digest invokes the reviewed producer's field validator;
 // it is not claimed as the original signing-step byte digest. Authenticity
 // comes from the pinned ZIP, authenticated archive and tool/run provenance.
 const bytes=Buffer.from(JSON.stringify(proof)+'\n');
 const verified=verifyFirstCreationReceipt(bytes,sha(bytes),context,event);
 assert.equal(verified.workflowId,origin.signingWorkflowId);
 return verified;
}
