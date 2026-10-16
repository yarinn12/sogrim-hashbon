import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyOrigin,SOURCE,TREE,SIGNING_TOOLS} from './intake194-package-origin.mjs';
export const SIGNED_RUN='38917936561',ARTIFACT_ID='12053816985',SIGNED_JOB=117030133090,ARTIFACT_SIZE=13259976;
export const IPA_SHA='82ff41f44647989c4365b1607ea290f6802750f5c0b264b8dbadf5a333430897';
export const ZIP_SHA='9abbc6c6b730fe8c3eadbe72266eec9f74766b8e4bba15710b1bb0b25ec53554';
export function requireBoundIntakePins(){
  assert.match(SIGNING_TOOLS,/^[0-9a-f]{40}$/,'Final immutable signing tools are required');
  for(const [name,value]of Object.entries({SIGNED_RUN,ARTIFACT_ID}))
    assert.match(String(value??''),/^[1-9][0-9]*$/,'Real signing artifact pin missing: '+name);
  for(const [name,value]of Object.entries({SIGNED_JOB,ARTIFACT_SIZE}))
    assert.ok(Number.isSafeInteger(value)&&value>0,'Real signing artifact pin missing: '+name);
  for(const [name,value]of Object.entries({IPA_SHA,ZIP_SHA}))
    assert.match(value??'',/^[0-9a-f]{64}$/,'Real signing artifact digest missing: '+name);
}
export function verifyIntakeOrigin(run,artifact,jobs,env){
  requireBoundIntakePins();
  assert.equal(env.SOURCE_SHA,SOURCE);
  assert.equal(env.SIGNED_RUN_ID,SIGNED_RUN);assert.equal(env.SIGNED_ARTIFACT_ID,ARTIFACT_ID);
  assert.equal(env.SIGNED_IPA_SHA256,IPA_SHA);assert.equal(env.SIGNED_ARTIFACT_ZIP_SHA256,ZIP_SHA);
  const origin=verifyOrigin(run,artifact,jobs,env);
  assert.equal(artifact.size_in_bytes,ARTIFACT_SIZE);
  assert.equal(jobs[0].id,SIGNED_JOB);assert.equal(String(jobs[0].run_id),SIGNED_RUN);
  assert.equal(jobs[0].head_sha,SIGNING_TOOLS);
  return {...origin,scope:'PACKAGE_INTAKE_ONLY',databaseAccepted:false,
    publicReleaseAccepted:false,distributionAllowed:false};
}
async function main(){
  requireBoundIntakePins();
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
