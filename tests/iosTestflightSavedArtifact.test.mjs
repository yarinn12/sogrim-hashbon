import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifySavedIpa,SAVED_IOS_ARTIFACT as e} from '../scripts/lib/ios-testflight-saved-artifact.mjs';
const successful=['Run release checks','Verify Apple login on iPhone and iPad WebKit','Archive signed iOS app','Export IPA','Verify signed iOS artifact','Record pinned source in signed artifact evidence','Keep IPA and diagnostics for seven days'];
const skipped=['Recheck GET readiness immediately before the single upload','Upload app to TestFlight','Verify Apple processing and complete TestFlight notes'];
const original=JSON.parse(await readFile(new URL('../fixtures/saved-ios186-manifest.json',import.meta.url),'utf8'));
const prior=JSON.parse(await readFile(new URL('../fixtures/saved-ios186-readiness.json',import.meta.url),'utf8'));
const ipa=await readFile(process.env.SAVED_IOS186_IPA || new URL('../fixtures/SogrimHashbon.ipa',import.meta.url));
const valid=()=>({manifest:structuredClone(original),prior:structuredClone(prior),ipa,sourceSha:e.sourceSha,run:{id:Number(e.runId),head_sha:e.workflowSha,head_branch:'work/ios-testflight-186-20261002',event:'push',run_attempt:1,status:'completed',conclusion:'failure'},job:{id:110910890202,run_id:Number(e.runId),status:'completed',steps:[...successful.map(name=>({name,conclusion:'success'})),...skipped.map(name=>({name,conclusion:'skipped'})),{name:'Require successful full QA for the exact merged source',conclusion:'failure'}]},qaRun:{id:Number(e.qaRunId),head_sha:e.sourceSha,head_branch:'main',event:'push',status:'completed',conclusion:'success'}});
test('the exact signed IPA is accepted only after the exact merged-source QA passes',()=>assert.equal(verifySavedIpa(valid()).originalUploadSkippedVerified,true));
for(const [name,change] of [
 ['wrong source',x=>x.sourceSha='0'.repeat(40)],
 ['changed IPA bytes',x=>{x.ipa=Buffer.from(ipa);x.ipa[0]^=1;}],
 ['wrong manifest digest',x=>x.manifest.sha256='0'.repeat(64)],
 ['other original run',x=>x.run.id++],
 ['rerun of original job',x=>x.run.run_attempt=2],
 ['original upload attempted',x=>x.job.steps.find(s=>s.name==='Upload app to TestFlight').conclusion='success'],
 ['missing signature verification',x=>x.job.steps.find(s=>s.name==='Verify signed iOS artifact').conclusion='skipped'],
 ['ambiguous step evidence',x=>x.job.steps.push({...x.job.steps[0]})],
 ['wrong prior build',x=>x.prior.build='185'],
 ['QA cancellation',x=>x.qaRun.conclusion='cancelled'],
 ['QA still running',x=>x.qaRun.status='in_progress'],
 ['QA from another source',x=>x.qaRun.head_sha='0'.repeat(40)]
])test('rejects '+name,()=>{const x=valid();change(x);assert.throws(()=>verifySavedIpa(x),/Saved IPA rejected/);});
