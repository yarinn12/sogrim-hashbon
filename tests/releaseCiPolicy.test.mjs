import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseCi,REQUIRED_RELEASE_WORKFLOWS } from "../scripts/lib/release-ci-policy.mjs";
const source="a".repeat(40),repository="yarinn12/sogrim-hashbon";
const qaJobs=["unit","backup-runtime","two-client-sync","cross-platform","unit-and-mobile","mobile (android-mobile)","mobile (iphone-webkit)","mobile (ipad-webkit)","mobile (iphone-large-text)","mobile (reflow-200)","mobile-iphone-large-text-shard-1","mobile-iphone-large-text-shard-2","android-native / native-parity","ios-native / native-parity"];
function fixture(){
 const runs=REQUIRED_RELEASE_WORKFLOWS.map((file,n)=>({id:100+n,path:`.github/workflows/${file}`,head_sha:source,event:"push",head_branch:"main",status:"completed",conclusion:"success",run_attempt:1,repository:{full_name:repository},head_repository:{full_name:repository}}));
 const names=[qaJobs,["windows-unit"],["linux-font-provenance"],["native"]];
 const jobsByRun=Object.fromEntries(runs.map((run,n)=>[run.id,names[n].map(name=>({name,head_sha:source,status:"completed",conclusion:"success"}))]));
 return{source,repository,runs,jobsByRun};
}
test("release accepts all four completed workflows and required native/mobile/sync jobs only for one source",()=>{const verdict=evaluateReleaseCi(fixture());assert.equal(verdict.passed,true);assert.equal(verdict.accepted.length,4);});
test("manual release cannot use missing, older, another-repository or skipped CI as acceptance",()=>{
 for(const change of [f=>f.runs.pop(),f=>f.runs[0].head_sha="b".repeat(40),f=>f.runs[0].head_repository.full_name="other/fork",f=>f.jobsByRun[100][0].conclusion="skipped",f=>f.jobsByRun[100].pop(),f=>f.jobsByRun[100][0].head_sha="b".repeat(40)]){const f=fixture();change(f);assert.equal(evaluateReleaseCi(f).passed,false);}
});
test("both iPhone large text shards are individually required for release",()=>{
 for(const name of ["mobile-iphone-large-text-shard-1","mobile-iphone-large-text-shard-2"]){
  for(const outcome of ["missing","failure","skipped","foreign-source"]){
   const f=fixture(),jobs=f.jobsByRun[100],job=jobs.find(item=>item.name===name);
   if(outcome==="missing")jobs.splice(jobs.indexOf(job),1);
   else if(outcome==="foreign-source")job.head_sha="b".repeat(40);
   else job.conclusion=outcome;
   assert.equal(evaluateReleaseCi(f).passed,false,`${name}: ${outcome}`);
  }
 }
});
test("a newer failed attempt blocks an older successful run and incomplete jobs block release",()=>{
 const f=fixture();f.runs.push({...f.runs[0],id:200,run_attempt:2,conclusion:"failure"});assert.equal(evaluateReleaseCi(f).passed,false);
 const p=fixture();p.runs[0].status="in_progress";assert.equal(evaluateReleaseCi(p).passed,false);
 const j=fixture();j.jobsByRun[100][0].status="in_progress";assert.equal(evaluateReleaseCi(j).passed,false);
 assert.throws(()=>evaluateReleaseCi({...fixture(),source:"main"}),/exact commit/);
});

test("public release rejects green PR and manual diagnostic workflows instead of validated main push",()=>{
 for(const event of ["pull_request","workflow_dispatch"]){const f=fixture();for(const r of f.runs){r.event=event;r.head_branch="codex/candidate";}assert.equal(evaluateReleaseCi(f).passed,false);}
});
test("Windows, font and AuthReturn jobs cannot be replaced by a successful noop",()=>{
 for(const id of [101,102,103]){const f=fixture();f.jobsByRun[id][0].name="noop";assert.equal(evaluateReleaseCi(f).passed,false);}
});
test("explicit private candidate readiness is labeled and cannot become public release acceptance",()=>{
 const f=fixture();for(const r of f.runs){r.event="pull_request";r.head_branch="codex/candidate";}
 const privateResult=evaluateReleaseCi({...f,candidateBranch:"codex/candidate"});
 assert.equal(privateResult.passed,true);assert.equal(privateResult.scope,"candidate-readiness-only");
 assert.equal(evaluateReleaseCi(f).passed,false);
 assert.throws(()=>evaluateReleaseCi({...f,candidateBranch:"main"}),/non-main branch/);
});
test("a newer trusted failed diagnostic cannot be hidden behind an older green public run",()=>{
 const f=fixture();f.runs.push({...f.runs[0],id:300,event:"workflow_dispatch",conclusion:"failure"});
 assert.equal(evaluateReleaseCi(f).passed,false);
});
