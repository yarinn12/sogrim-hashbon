import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE='bf254b5235deb706234b00362e6eaea78e129e98';
export const TREE='4a208e596cbaf0576cccd7f67fc99a665287836d';
export const SIGNING_TOOLS='931dcfa95fe2ab0ed5b76840d7254dfae89ba6b1';
const REPO='yarinn12/sogrim-hashbon';
const positive=v=>assert.match(String(v??''),/^[1-9][0-9]*$/);
const sha=v=>assert.match(v??'',/^[0-9a-f]{64}$/);

export function verifyOrigin(run,artifact,jobs,env,now=Date.now()){
  positive(env.SIGNED_RUN_ID);positive(env.SIGNED_ARTIFACT_ID);sha(env.SIGNED_IPA_SHA256);sha(env.SIGNED_ARTIFACT_ZIP_SHA256);
  assert.equal(String(run.id),env.SIGNED_RUN_ID);
  assert.equal(run.repository.full_name,REPO);assert.equal(run.head_repository.full_name,REPO);
  assert.equal(run.head_sha,SIGNING_TOOLS);assert.equal(run.head_branch,'codex/ios-release-tools-4-58-20261012');
  assert.equal(run.path,'.github/workflows/ios-testflight.yml');assert.equal(run.event,'workflow_dispatch');
  assert.equal(run.run_attempt,1);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
  assert.equal(jobs.length,1);assert.equal(jobs[0].name,'build-export-verify-private');
  assert.equal(jobs[0].status,'completed');assert.equal(jobs[0].conclusion,'success');
  assert.equal(String(artifact.id),env.SIGNED_ARTIFACT_ID);assert.equal(artifact.name,'sogrim-ios-4.58-193-encrypted');
  assert.equal(artifact.expired,false);assert.ok(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
  assert.equal(String(artifact.workflow_run.id),env.SIGNED_RUN_ID);assert.equal(artifact.workflow_run.head_sha,SIGNING_TOOLS);
  assert.equal(artifact.digest,'sha256:'+env.SIGNED_ARTIFACT_ZIP_SHA256);
  return {sourceCommit:SOURCE,sourceTree:TREE,signingTools:SIGNING_TOOLS,signingRunId:env.SIGNED_RUN_ID,
    signingRunAttempt:'1',artifactId:env.SIGNED_ARTIFACT_ID,artifactDigest:artifact.digest,ipaSha256:env.SIGNED_IPA_SHA256,appleUploadPerformed:false};
}

export function verifyDatabaseReceipt(bytes,expectedHash){
  sha(expectedHash);assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedHash);
  const r=JSON.parse(bytes);assert.equal(r.schemaVersion,1);assert.equal(r.sourceCommit,SOURCE);assert.equal(r.sourceTree,TREE);
  assert.equal(r.productionProjectRef,'isdaozthehplneapkfwd');
  assert.equal(r.productionRestoreVerified,true);assert.equal(r.hostedSyntheticAcceptancePassed,true);
  assert.equal(r.productionMigrationVerificationPassed,true);assert.equal(r.containsUserData,false);
  sha(r.restoreEvidenceSha256);sha(r.hostedEvidenceSha256);sha(r.productionVerificationEvidenceSha256);
  assert.ok(Number.isFinite(Date.parse(r.verifiedAt)),'Missing actual acceptance timestamp');
  assert.deepEqual(r.migrations,[
    {id:'20260907100000',sha256:'9ae176f476ceccb89fedaaecc1a41779165cad7e31fbe75c174ca160401d4e32'},
    {id:'20261007090000',sha256:'22d43d44da037f15b4113ac99bb85b21b882e7d68dd465e57f79201358186cc9'},
    {id:'20261011120000',sha256:'7d0e28d943e4cf47bd23068819263dfbfaaecb72947cd92ffe0b180c77ca85ce'}
  ]);
  return {databaseReceiptSha256:expectedHash,productionProjectRef:r.productionProjectRef,verifiedAt:r.verifiedAt};
}

async function main(){
  const env=process.env;
  // These reads happen before any Apple key is provided to this step.
  const bytes=readFileSync(resolve(env.GITHUB_WORKSPACE,'release-tools/release-acceptance/bf254b5-database.json'));
  const database=verifyDatabaseReceipt(bytes,env.DATABASE_RECEIPT_SHA256);
  const get=async path=>{const response=await fetch('https://api.github.com/repos/'+REPO+path,{headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});assert.ok(response.ok,'GitHub origin read failed');return response.json();};
  positive(env.SIGNED_RUN_ID);positive(env.SIGNED_ARTIFACT_ID);
  const run=await get('/actions/runs/'+env.SIGNED_RUN_ID);
  const artifact=await get('/actions/artifacts/'+env.SIGNED_ARTIFACT_ID);
  const jobs=await get('/actions/runs/'+env.SIGNED_RUN_ID+'/attempts/1/jobs?per_page=100');
  assert.equal(jobs.total_count,jobs.jobs.length);
  writeFileSync('build/ios/upload-origin.json',JSON.stringify({...verifyOrigin(run,artifact,jobs.jobs,env),...database},null,2)+'\n',{flag:'wx'});
  console.log('Original signed artifact origin and reviewed database receipt verified; no Apple key or upload used.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
