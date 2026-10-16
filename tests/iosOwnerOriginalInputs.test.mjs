import test from 'node:test';
import assert from 'node:assert/strict';
import {PINS,REQUIRED,verifyCompletedIntake,selectIntakeArtifact,verifyArtifactBytes,hash} from '../scripts/qa/ios-signing/collect-owner-original-inputs.mjs';
const fixture=()=>({run:{id:PINS.intakeRun,head_sha:PINS.intake,repository:{full_name:'yarinn12/sogrim-hashbon'},
head_repository:{full_name:'yarinn12/sogrim-hashbon'},head_branch:'codex/ios194-2cf-root-intake-only-20261016',
path:'.github/workflows/ios194-2cf-root-intake-only.yml',event:'push',run_number:1,run_attempt:1,status:'completed',conclusion:'success'},
jobs:{total_count:1,jobs:[{id:PINS.intakeJob,run_id:PINS.intakeRun,head_sha:PINS.intake,status:'completed',conclusion:'success',
steps:REQUIRED.map(name=>({name,status:'completed',conclusion:'success'}))}]}});
test('exact successful original intake accepted',()=>{const f=fixture();verifyCompletedIntake(f.run,f.jobs);});
for(const [name,mutate]of Object.entries({
 'second attempt':f=>f.run.run_attempt=2,'second run number':f=>f.run.run_number=2,
 'wrong source tools':f=>f.run.head_sha='1'.repeat(40),'incomplete run':f=>f.run.status='in_progress',
 'failed upload':f=>f.jobs.jobs[0].steps.find(s=>s.name===REQUIRED[4]).conclusion='failure',
 'unprocessed build':f=>f.jobs.jobs[0].steps.find(s=>s.name===REQUIRED[5]).conclusion='skipped',
 'missing audience postflight':f=>f.jobs.jobs[0].steps.pop(),
 'partial jobs page':f=>f.jobs.total_count=2,'different job':f=>f.jobs.jobs[0].id++,
 'forked origin':f=>f.run.head_repository.full_name='other/repo'
}))test('reject '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>verifyCompletedIntake(f.run,f.jobs));});
const bytes=Buffer.from('original ZIP test bytes');
const artifact=()=>({id:123,name:'ios194-intake-evidence-'+PINS.intakeRun,workflow_run:{id:PINS.intakeRun,head_sha:PINS.intake},
expired:false,size_in_bytes:bytes.length,digest:'sha256:'+hash(bytes)});
test('original artifact selection and bytes',()=>{const a=artifact();assert.equal(selectIntakeArtifact({total_count:1,artifacts:[a]}),a);verifyArtifactBytes(a,bytes);});
test('reject partial artifact metadata',()=>assert.throws(()=>selectIntakeArtifact({total_count:2,artifacts:[artifact()]})));
test('reject duplicate selected artifact',()=>assert.throws(()=>selectIntakeArtifact({total_count:2,artifacts:[artifact(),artifact()]})));
test('reject expired artifact',()=>assert.throws(()=>selectIntakeArtifact({total_count:1,artifacts:[{...artifact(),expired:true}]})));
test('reject changed archive bytes',()=>assert.throws(()=>verifyArtifactBytes(artifact(),Buffer.from('different archive bytes'))));
