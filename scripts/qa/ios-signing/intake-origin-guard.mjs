import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyOrigin} from './intake194-package-origin.mjs';
import {INTAKE_BINDINGS,requireBoundIntakePins,requireBoundEnvironment,integer} from './intake-bindings.mjs';
import {CONTROL_PATHS,verifySigningControls} from './intake-nov5-proof.mjs';
export {requireBoundIntakePins};
export const SIGNED_RUN=INTAKE_BINDINGS.signing.runId,ARTIFACT_ID=INTAKE_BINDINGS.signing.artifactId;
export const SIGNED_JOB=INTAKE_BINDINGS.signing.jobId,ARTIFACT_SIZE=INTAKE_BINDINGS.signing.artifactSize;
export const IPA_SHA=INTAKE_BINDINGS.signing.ipaSha256,ZIP_SHA=INTAKE_BINDINGS.signing.zipSha256;
export const verifyIntakeOrigin=verifyOrigin;

export async function main({env=process.env,fetchImpl=fetch}={}){
 requireBoundEnvironment(env);
 const root=resolve(env.GITHUB_WORKSPACE,'original-signing-tools');
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 const controls=verifySigningControls(git(['rev-parse','HEAD']),git(['status','--porcelain']),
  Object.fromEntries(Object.values(CONTROL_PATHS).map(path=>[path,readFileSync(resolve(root,path))])));
 const get=async path=>{
  const response=await fetchImpl('https://api.github.com/repos/yarinn12/sogrim-hashbon'+path,{
   method:'GET',redirect:'error',headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'},
   signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Original package proof GET failed');return response.json();
 };
 const run=await get('/actions/runs/'+SIGNED_RUN);
 assert.ok(integer(run.workflow_id),'Original workflow ID missing');
 const workflow=await get('/actions/workflows/'+run.workflow_id);
 const artifact=await get('/actions/artifacts/'+ARTIFACT_ID);
 const jobs=await get('/actions/runs/'+SIGNED_RUN+'/attempts/1/jobs?per_page=100');
 assert.equal(jobs.total_count,1);assert.equal(jobs.jobs?.length,1);
 const proof=verifyOrigin(run,artifact,jobs.jobs,env,{controlProof:controls,workflow});
 writeFileSync('build/ios/upload-origin.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 console.log('Exact Nov5 original signing run, controls and steps verified; no key or Apple write used.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
