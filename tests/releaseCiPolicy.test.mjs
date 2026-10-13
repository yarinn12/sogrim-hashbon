import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseCi,REQUIRED_RELEASE_WORKFLOWS } from "../scripts/lib/release-ci-policy.mjs";
const source="a".repeat(40),repository="yarinn12/sogrim-hashbon";
const qaJobs=["unit","backup-runtime","two-client-sync","cross-platform","unit-and-mobile","mobile (android-mobile)","mobile (iphone-webkit)","mobile (ipad-webkit)","mobile (iphone-large-text)","mobile (reflow-200)","android-native / native-parity","ios-native / native-parity"];
function fixture(){
 const runs=REQUIRED_RELEASE_WORKFLOWS.map((file,n)=>({id:100+n,path:`.github/workflows/${file}`,head_sha:source,status:"completed",conclusion:"success",run_attempt:1,repository:{full_name:repository},head_repository:{full_name:repository}}));
 const jobsByRun=Object.fromEntries(runs.map((run,n)=>[run.id,(n===0?qaJobs:["verification"]).map(name=>({name,head_sha:source,status:"completed",conclusion:"success"}))]));
 return{source,repository,runs,jobsByRun};
}
test("release accepts all four completed workflows and required native/mobile/sync jobs only for one source",()=>{const verdict=evaluateReleaseCi(fixture());assert.equal(verdict.passed,true);assert.equal(verdict.accepted.length,4);});
test("manual release cannot use missing, older, another-repository or skipped CI as acceptance",()=>{
 for(const change of [f=>f.runs.pop(),f=>f.runs[0].head_sha="b".repeat(40),f=>f.runs[0].head_repository.full_name="other/fork",f=>f.jobsByRun[100][0].conclusion="skipped",f=>f.jobsByRun[100].pop(),f=>f.jobsByRun[100][0].head_sha="b".repeat(40)]){const f=fixture();change(f);assert.equal(evaluateReleaseCi(f).passed,false);}
});
test("a newer failed attempt blocks an older successful run and incomplete jobs block release",()=>{
 const f=fixture();f.runs.push({...f.runs[0],id:200,run_attempt:2,conclusion:"failure"});assert.equal(evaluateReleaseCi(f).passed,false);
 const p=fixture();p.runs[0].status="in_progress";assert.equal(evaluateReleaseCi(p).passed,false);
 const j=fixture();j.jobsByRun[100][0].status="in_progress";assert.equal(evaluateReleaseCi(j).passed,false);
 assert.throws(()=>evaluateReleaseCi({...fixture(),source:"main"}),/exact commit/);
});
