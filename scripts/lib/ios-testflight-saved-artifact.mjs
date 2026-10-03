import {createHash} from 'node:crypto';
export const SAVED_IOS_ARTIFACT=Object.freeze({
  sourceSha:'abbba4fc8d581f5720200169a59c88d7410f7277',
  workflowSha:'630690635783aaf64cea684ede32a38e07379594',
  runId:'37029026029',artifactId:'11237732515',qaRunId:'37028291135',
  sha256:'4F54AB7727803F3C441F4AB09FA3BD5F48080708114631EDB44A0C9F8CCEF816',bytes:12133636,
  marker:'ios-testflight-4.55-186-20261002',version:'4.55',build:'186',bundleId:'com.sogrimhashbon.app',teamId:'MA9S4L7WKS'
});
function requireMatch(ok,reason){if(!ok)throw new Error('Saved IPA rejected: '+reason);}
export function verifySavedIpa({manifest,prior,ipa,sourceSha,run,job,qaRun}){
  const e=SAVED_IOS_ARTIFACT;
  requireMatch(sourceSha===e.sourceSha,'checkout source');
  for(const [key,value] of Object.entries({sourceSha:e.sourceSha,workflowSourceSha:e.workflowSha,githubRunId:e.runId,githubRunAttempt:'1',marker:e.marker,version:e.version,build:e.build,bundleId:e.bundleId,teamId:e.teamId,sha256:e.sha256,bytes:e.bytes}))requireMatch(manifest?.[key]===value,'manifest '+key);
  for(const [key,value] of Object.entries({sourceSha:e.sourceSha,workflowSourceSha:e.workflowSha,githubRunId:e.runId,githubRunAttempt:'1',marker:e.marker,version:e.version,build:e.build,phase:'before_build',highestBuildNumber:'185',ready:true,targetBuildAbsent:true}))requireMatch(prior?.[key]===value,'prior '+key);
  requireMatch(ipa?.length===e.bytes&&createHash('sha256').update(ipa).digest('hex').toUpperCase()===e.sha256,'IPA bytes or digest');
  requireMatch(String(run?.id)===e.runId&&run.head_sha===e.workflowSha&&run.head_branch==='work/ios-testflight-186-20261002'&&run.event==='push'&&run.run_attempt===1&&run.status==='completed'&&run.conclusion==='failure','original run');
  requireMatch(job?.id===110910890202&&job.run_id===Number(e.runId)&&job.status==='completed'&&Array.isArray(job.steps),'original job');
  const step=(name)=>{const matches=job.steps.filter(s=>s.name===name);requireMatch(matches.length===1,'unique step '+name);return matches[0];};
  for(const name of ['Run release checks','Verify Apple login on iPhone and iPad WebKit','Archive signed iOS app','Export IPA','Verify signed iOS artifact','Record pinned source in signed artifact evidence','Keep IPA and diagnostics for seven days'])requireMatch(step(name).conclusion==='success','completed verification '+name);
  requireMatch(step('Require successful full QA for the exact merged source').conclusion==='failure','original QA gate');
  for(const name of ['Recheck GET readiness immediately before the single upload','Upload app to TestFlight','Verify Apple processing and complete TestFlight notes'])requireMatch(step(name).conclusion==='skipped','original upload was not attempted');
  requireMatch(String(qaRun?.id)===e.qaRunId&&qaRun.head_sha===e.sourceSha&&qaRun.head_branch==='main'&&qaRun.event==='push'&&qaRun.status==='completed'&&qaRun.conclusion==='success','merged-source QA');
  return {verifiedAt:new Date().toISOString(),sourceSha:e.sourceSha,savedArtifactRunId:e.runId,savedArtifactId:e.artifactId,sourceQaRunId:e.qaRunId,sha256:e.sha256,bytes:e.bytes,originalUploadSkippedVerified:true};
}
