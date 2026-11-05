import assert from 'node:assert/strict';
import {CONTRACT,INTAKE_BINDINGS,requireBoundEnvironment,integer} from './intake-bindings.mjs';
import {requireSigningSteps,validateOriginReceipt} from './intake-nov5-proof.mjs';
export const SOURCE=INTAKE_BINDINGS.application.sourceSha,TREE=INTAKE_BINDINGS.application.sourceTree;
export const SIGNING_TOOLS=INTAKE_BINDINGS.signing.toolsSha;

export function verifyOrigin(run,artifact,jobs,env,{pins=INTAKE_BINDINGS,controlProof,workflow,now=Date.now()}={}){
 requireBoundEnvironment(env,pins);const a=pins.application,s=pins.signing;
 assert.ok(controlProof?.ready===true);assert.equal(controlProof.signingTools,s.toolsSha);
 assert.deepEqual(controlProof.hashes,s.controls,'Missing verified original controls');
 for(const repo of [run.repository,run.head_repository]){
  assert.equal(repo?.full_name,CONTRACT.repository);assert.equal(repo?.id,CONTRACT.repositoryId);
 }
 assert.ok(integer(run.id)&&integer(run.run_number)&&integer(run.workflow_id));
 assert.equal(String(run.id),s.runId);assert.equal(run.run_number,s.runNumber,'Original counter metadata differs');
 assert.equal(run.head_sha,s.toolsSha);assert.equal(run.head_commit?.id,s.toolsSha);
 assert.equal(run.head_branch,CONTRACT.signingBranch);assert.equal(run.path,CONTRACT.signingPath);
 assert.equal(run.event,'push');assert.equal(run.run_attempt,1);assert.equal(run.previous_attempt_url,null);
 assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(workflow?.id,run.workflow_id);assert.equal(workflow?.path,CONTRACT.signingPath);
 assert.equal(workflow?.name,CONTRACT.signingName);assert.ok(['active','disabled_manually'].includes(workflow?.state));
 assert.ok(Array.isArray(jobs));assert.equal(jobs.length,1);
 const job=jobs[0];assert.equal(job.id,s.jobId);assert.equal(String(job.run_id),s.runId);
 assert.equal(job.head_sha,s.toolsSha);assert.equal(job.name,'build-export-verify-private');
 assert.equal(job.status,'completed');assert.equal(job.conclusion,'success');
 if(job.run_attempt!==undefined)assert.equal(job.run_attempt,1);
 const signingSteps=requireSigningSteps(job);
 assert.ok(integer(artifact.id));assert.equal(String(artifact.id),s.artifactId);
 assert.equal(artifact.name,CONTRACT.artifactName);assert.equal(artifact.size_in_bytes,s.artifactSize);
 assert.equal(artifact.expired,false);
 assert.ok(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
 assert.equal(String(artifact.workflow_run?.id),s.runId);assert.equal(artifact.workflow_run?.head_sha,s.toolsSha);
 assert.equal(artifact.digest,'sha256:'+s.zipSha256);
 const origin={sourceCommit:a.sourceSha,sourceTree:a.sourceTree,signingTools:s.toolsSha,workflowRef:
  CONTRACT.repository+'/'+CONTRACT.signingPath+'@refs/heads/'+CONTRACT.signingBranch,
  signingRunId:s.runId,signingRunAttempt:'1',signingRunNumber:run.run_number,signingWorkflowId:run.workflow_id,
  signingJobId:s.jobId,artifactId:s.artifactId,artifactSize:s.artifactSize,artifactDigest:artifact.digest,
  ipaSha256:s.ipaSha256,ipaSize:s.ipaSize,signingControlHashes:controlProof.hashes,signingSteps,
  firstCreationStepPassed:true,scope:'PACKAGE_INTAKE_ONLY',appleUploadPerformed:false,
  databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false};
 return validateOriginReceipt(origin,pins);
}
