import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyOrigin,SOURCE,TREE,SIGNING_TOOLS} from './upload-origin-guard.mjs';
export const SIGNED_RUN='38307202558',ARTIFACT_ID='11773570369',SIGNED_JOB=115004020716;
export const IPA_SHA='66cbccebfb4f8ccdf4c95624de94cadf6aab181cc25be8723323dbb2928c918a';
export const ZIP_SHA='170e9f24bf92348a2c26efaff518499762976b314f9a4d8e9b5d8b6a01e36e3c';
export function verifyIntakeOrigin(run,artifact,jobs,env){
  assert.equal(env.SOURCE_SHA,SOURCE);
  assert.equal(env.SIGNED_RUN_ID,SIGNED_RUN);assert.equal(env.SIGNED_ARTIFACT_ID,ARTIFACT_ID);
  assert.equal(env.SIGNED_IPA_SHA256,IPA_SHA);assert.equal(env.SIGNED_ARTIFACT_ZIP_SHA256,ZIP_SHA);
  const origin=verifyOrigin(run,artifact,jobs,env);
  assert.equal(artifact.size_in_bytes,13184175);
  assert.equal(jobs[0].id,SIGNED_JOB);assert.equal(String(jobs[0].run_id),SIGNED_RUN);
  assert.equal(jobs[0].head_sha,SIGNING_TOOLS);
  return {...origin,scope:'PACKAGE_INTAKE_ONLY',databaseAccepted:false,
    publicReleaseAccepted:false,distributionAllowed:false};
}
async function main(){
  const env=process.env;
  const get=async path=>{
    const response=await fetch('https://api.github.com/repos/yarinn12/sogrim-hashbon'+path,{
      method:'GET',redirect:'error',headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'},
      signal:AbortSignal.timeout(30000)});
    assert.ok(response.ok,'GitHub original package read failed');return response.json();
  };
  const run=await get('/actions/runs/'+SIGNED_RUN),artifact=await get('/actions/artifacts/'+ARTIFACT_ID);
  const jobs=await get('/actions/runs/'+SIGNED_RUN+'/attempts/1/jobs?per_page=100');
  assert.equal(jobs.total_count,jobs.jobs.length);
  writeFileSync('build/ios/upload-origin.json',JSON.stringify(verifyIntakeOrigin(run,artifact,jobs.jobs,env),null,2)+'\n',{flag:'wx'});
  console.log('Exact original package verified for intake only. No database acceptance or distribution permission asserted.');
}
if(import.meta.url.startsWith('file:')&&process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
