import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE='2cf78afc23c1d9330834de63ed5f81ba4da5b052';
export const TREE='52105dddf3b9a8edb61032c6149eac1b392c460a';
export const SIGNING_TOOLS='8532bcaf4cb29b329c988f03a9ec4d6ec45121f8';
const REPO='yarinn12/sogrim-hashbon';
const positive=v=>assert.match(String(v??''),/^[1-9][0-9]*$/);
const sha=v=>assert.match(v??'',/^[0-9a-f]{64}$/);

export function verifyOrigin(run,artifact,jobs,env,now=Date.now()){
  assert.equal(env.SOURCE_SHA,SOURCE,'Original artifact must belong to the frozen application source');
  positive(env.SIGNED_RUN_ID);positive(env.SIGNED_ARTIFACT_ID);sha(env.SIGNED_IPA_SHA256);sha(env.SIGNED_ARTIFACT_ZIP_SHA256);
  assert.equal(String(run.id),env.SIGNED_RUN_ID);
  assert.equal(run.repository.full_name,REPO);assert.equal(run.head_repository.full_name,REPO);
  assert.equal(run.head_sha,SIGNING_TOOLS);assert.equal(run.head_branch,'codex/ios194-2cf-resilient-sign-only-20261016');
  assert.equal(run.path,'.github/workflows/ios194-2cf-resilient-sign-only.yml');assert.equal(run.event,'push');assert.equal(run.run_number,1);
  assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  assert.equal(jobs.length,1);assert.equal(jobs[0].name,'build-export-verify-private');
  assert.equal(jobs[0].status,'completed');assert.equal(jobs[0].conclusion,'success');
  assert.equal(String(artifact.id),env.SIGNED_ARTIFACT_ID);assert.equal(artifact.name,'sogrim-ios-4.58-194-encrypted');
  assert.equal(artifact.expired,false);assert.ok(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
  assert.equal(String(artifact.workflow_run.id),env.SIGNED_RUN_ID);assert.equal(artifact.workflow_run.head_sha,SIGNING_TOOLS);
  assert.equal(artifact.digest,'sha256:'+env.SIGNED_ARTIFACT_ZIP_SHA256);
  return {sourceCommit:SOURCE,sourceTree:TREE,signingTools:SIGNING_TOOLS,signingRunId:env.SIGNED_RUN_ID,
    signingRunAttempt:'1',artifactId:env.SIGNED_ARTIFACT_ID,artifactDigest:artifact.digest,ipaSha256:env.SIGNED_IPA_SHA256,appleUploadPerformed:false};
}
