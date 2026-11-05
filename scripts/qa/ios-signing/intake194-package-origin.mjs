import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE='abcbac91e97230e4737e80c4ea3c2206360e855f';
export const TREE='76e2319de17a875db5f5b1e2b54c2b63659644b1';
export const SIGNING_TOOLS='e9f155ea0d2350c2a1f6a286fe72efbeff2c3dff';
const REPO='yarinn12/sogrim-hashbon';
const positive=v=>assert.match(String(v??''),/^[1-9][0-9]*$/);
const sha=v=>assert.match(v??'',/^[0-9a-f]{64}$/);

export function verifyOrigin(run,artifact,jobs,env,now=Date.now()){
  assert.equal(env.SOURCE_SHA,SOURCE,'Original artifact must belong to the frozen application source');
  positive(env.SIGNED_RUN_ID);positive(env.SIGNED_ARTIFACT_ID);sha(env.SIGNED_IPA_SHA256);sha(env.SIGNED_ARTIFACT_ZIP_SHA256);
  assert.equal(String(run.id),env.SIGNED_RUN_ID);
  assert.equal(run.repository.full_name,REPO);assert.equal(run.head_repository.full_name,REPO);
  assert.equal(run.head_sha,SIGNING_TOOLS);assert.equal(run.head_branch,'codex/ios195-459-private-tools-20261104');
  assert.equal(run.path,'.github/workflows/ios195-459-private-sign-only.yml');assert.equal(run.event,'push');assert.equal(run.run_number,1);
  assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  assert.equal(jobs.length,1);assert.equal(jobs[0].name,'build-export-verify-private');
  assert.equal(jobs[0].status,'completed');assert.equal(jobs[0].conclusion,'success');
  assert.equal(String(artifact.id),env.SIGNED_ARTIFACT_ID);assert.equal(artifact.name,'sogrim-ios-4.59-195-encrypted');
  assert.equal(artifact.expired,false);assert.ok(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
  assert.equal(String(artifact.workflow_run.id),env.SIGNED_RUN_ID);assert.equal(artifact.workflow_run.head_sha,SIGNING_TOOLS);
  assert.equal(artifact.digest,'sha256:'+env.SIGNED_ARTIFACT_ZIP_SHA256);
  return {sourceCommit:SOURCE,sourceTree:TREE,signingTools:SIGNING_TOOLS,signingRunId:env.SIGNED_RUN_ID,
    signingRunAttempt:'1',artifactId:env.SIGNED_ARTIFACT_ID,artifactDigest:artifact.digest,ipaSha256:env.SIGNED_IPA_SHA256,appleUploadPerformed:false};
}
