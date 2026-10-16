import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {verifyCommit,verifyRuns,requireUnusedArtifactSlot,readUnusedBuild,RELEASE_SOURCE,RELEASE_TREE} from './source-guard.mjs';
const env=process.env, phase=process.argv[2];
assert.ok(['ci','apple'].includes(phase));
assert.equal(env.GITHUB_REPOSITORY,'yarinn12/sogrim-hashbon');
assert.equal(env.GITHUB_REF,'refs/heads/codex/ios194-apple-runner-comparison-20261016');
assert.equal(env.GITHUB_WORKFLOW_REF,'yarinn12/sogrim-hashbon/.github/workflows/ios194-apple-runner-comparison.yml@refs/heads/codex/ios194-apple-runner-comparison-20261016');
assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_RUN_NUMBER,'1');
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git(['rev-parse','HEAD']),RELEASE_SOURCE);assert.equal(git(['rev-parse','HEAD^{tree}']),RELEASE_TREE);assert.equal(git(['status','--porcelain']),'');
const output=resolve(env.GITHUB_WORKSPACE,'readiness-output');mkdirSync(output,{recursive:true});
if(phase==='ci'){
 await verifyCommit(fetch,env.GH_TOKEN,RELEASE_TREE);const ci=await verifyRuns(fetch,env.GH_TOKEN,env);
 writeFileSync(output+'/source-ci.json',JSON.stringify({source:RELEASE_SOURCE,tree:RELEASE_TREE,ci,run:env.GITHUB_RUN_ID},null,2)+'\n',{flag:'wx'});
}else{
 const before=JSON.parse(readFileSync(output+'/source-ci.json','utf8'));
 assert.equal(before.source,RELEASE_SOURCE);assert.equal(before.tree,RELEASE_TREE);assert.equal(before.run,env.GITHUB_RUN_ID);assert.equal(before.ci.length,4);
 assert.equal(env.APPLE_TEAM_ID,'MA9S4L7WKS');
 const report={checkedAt:new Date().toISOString(),source:RELEASE_SOURCE,scope:'APPLE_READINESS_GET_ONLY_NO_SIGNING',run:env.GITHUB_RUN_ID,trace:[],appleWrites:0,signatureStarted:false,uploadPerformed:false};
 let failure=null;
 try{
  try{report.artifactSlot=await requireUnusedArtifactSlot(fetch,env.GH_TOKEN);}catch(error){report.artifactSlot={accepted:false,error:error.message};}
  const {createAppStoreClient}=await import(pathToFileURL(resolve('scripts/lib/app-store-release.mjs')));
  const client=createAppStoreClient({issuerId:env.APPSTORE_ISSUER_ID,keyId:env.APPSTORE_API_KEY_ID,privateKey:env.APPSTORE_API_PRIVATE_KEY});
  const get=async(path,options)=>{assert.deepEqual(options,{method:'GET'});const row={path,startedAt:new Date().toISOString()};report.trace.push(row);try{const result=await client(path,options);row.status=200;return result;}catch(error){row.status=error.status??null;throw error;}finally{row.completedAt=new Date().toISOString();}};
  report.apple=await readUnusedBuild(get);
 }catch(error){report.error={message:error.message,status:error.status??null};failure=error;}
 writeFileSync(output+'/apple-readiness.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));if(failure)throw failure;
}
