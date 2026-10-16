import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyIntakeOrigin} from './intake-origin-guard.mjs';
const API='https://api.github.com/repos/yarinn12/sogrim-hashbon';
export const PINS=Object.freeze({
 source:'2cf78afc23c1d9330834de63ed5f81ba4da5b052',sourceTree:'52105dddf3b9a8edb61032c6149eac1b392c460a',
 signing:'8532bcaf4cb29b329c988f03a9ec4d6ec45121f8',signingTree:'53ab1d1848d43393045a6963045cdf60b1d77400',
 intake:'242faa721b76f5dc4f8a2d2a6fb8b95c26e93c06',intakeTree:'e62e336c86c52e629a370e9e7c5794f980f286d7',
 signingRun:38917936561,signingJob:117030133090,signingArtifact:12053816985,
 intakeRun:38921392149,intakeJob:117041913030,
 metadataBlob:'d3c0c5f64a972df50b33c52564fbd27a6dda64a2',
 metadataSha256:'beae0835369bf383d0d970c4538d59336f994616fccbf5b74080070bcaf9c5dc'
});
export const REQUIRED=[
 'Require successful source CI before Apple keys',
 'Require the exact original artifact origin for intake only before Apple keys',
 'Verify original IPA bytes, all assets, signature, certificate and current profile without rebuilding',
 'Recheck source fingerprints, all CI and unused Apple build immediately before upload',
 'Upload the same original IPA to TestFlight',
 'Verify Apple processing and complete TestFlight notes',
 'Prove194 has zero groups and zero individual testers after processing'
];
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function verifyCompletedIntake(run,jobs) {
 assert.equal(run.id,PINS.intakeRun);assert.equal(run.head_sha,PINS.intake);
 assert.equal(run.repository?.full_name,'yarinn12/sogrim-hashbon');
 assert.equal(run.head_repository?.full_name,'yarinn12/sogrim-hashbon');
 assert.equal(run.head_branch,'codex/ios194-2cf-root-intake-only-20261016');
 assert.equal(run.path,'.github/workflows/ios194-2cf-root-intake-only.yml');
 assert.equal(run.event,'push');assert.equal(run.run_number,1);assert.equal(run.run_attempt,1);
 assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 assert.equal(jobs.total_count,1);assert.equal(jobs.jobs?.length,1);
 const j=jobs.jobs[0];assert.equal(j.id,PINS.intakeJob);assert.equal(j.run_id,PINS.intakeRun);
 assert.equal(j.head_sha,PINS.intake);assert.equal(j.status,'completed');assert.equal(j.conclusion,'success');
 for(const n of REQUIRED){const a=j.steps.filter(s=>s.name===n);assert.equal(a.length,1);
 assert.equal(a[0].status,'completed');assert.equal(a[0].conclusion,'success');}
}
export function selectIntakeArtifact(envelope) {
 assert.equal(envelope.total_count,envelope.artifacts?.length);
 const matches=envelope.artifacts.filter(a=>a.name==='ios194-intake-evidence-'+PINS.intakeRun);
 assert.equal(matches.length,1);const a=matches[0];
 assert.ok(Number.isSafeInteger(a.id)&&a.id>0);
 assert.equal(a.workflow_run?.id,PINS.intakeRun);assert.equal(a.workflow_run?.head_sha,PINS.intake);
 assert.equal(a.expired,false);assert.ok(a.size_in_bytes>0&&a.size_in_bytes<=64*1024*1024);
 assert.match(a.digest,/^sha256:[a-f0-9]{64}$/);return a;
}
export function verifyArtifactBytes(a,bytes) {
 assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.length,a.size_in_bytes);
 assert.equal('sha256:'+hash(bytes),a.digest);
}
async function bounded(response,max) {
 assert.ok(response.body);const chunks=[];let size=0;
 for await(const c of response.body){size+=c.length;assert.ok(size<=max,'Response budget');chunks.push(c);}
 assert.ok(size>0);return Buffer.concat(chunks);
}
export async function collectOriginalInputs(token,{fetchImpl=globalThis.fetch}={}) {
 assert.ok(typeof token==='string'&&token&&!/[\s\r\n]/.test(token));
 const allowed=new Set([
 '/git/commits/'+PINS.source,'/git/commits/'+PINS.signing,'/git/commits/'+PINS.intake,
 '/git/blobs/'+PINS.metadataBlob,
 '/actions/runs/'+PINS.signingRun,'/actions/runs/'+PINS.intakeRun,
 '/actions/runs/'+PINS.signingRun+'/jobs?per_page=100',
 '/actions/runs/'+PINS.intakeRun+'/jobs?per_page=100',
 '/actions/runs/'+PINS.intakeRun+'/artifacts?per_page=100',
 '/actions/artifacts/'+PINS.signingArtifact
 ]);
 async function get(path) {
 assert.ok(allowed.has(path),'Unapproved GitHub path');
 const r=await fetchImpl(API+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 assert.equal(r.status,200);assert.equal(r.redirected,false);
 const bytes=await bounded(r,16*1024*1024);return {bytes,data:JSON.parse(bytes.toString('utf8'))};
 }
 const files={};
 for(const [prefix,sha,tree]of [['source',PINS.source,PINS.sourceTree],['signing-tool',PINS.signing,PINS.signingTree],['intake-tool',PINS.intake,PINS.intakeTree]]) {
 const x=await get('/git/commits/'+sha);assert.equal(x.data.sha,sha);assert.equal(x.data.tree?.sha,tree);
 files[prefix+'-commit.json']=x.bytes;
 }
 const metadata=await get('/git/blobs/'+PINS.metadataBlob);
 assert.equal(metadata.data.sha,PINS.metadataBlob);assert.equal(metadata.data.encoding,'base64');
 files['source-metadata.json']=Buffer.from(metadata.data.content.replace(/[\r\n]/g,''),'base64');
 assert.equal(hash(files['source-metadata.json']),PINS.metadataSha256);
 const origin={};
 for(const [p,id]of [['signing',PINS.signingRun],['intake',PINS.intakeRun]]) {
 const run=await get('/actions/runs/'+id),jobs=await get('/actions/runs/'+id+'/jobs?per_page=100');
 files[p+'-run.json']=run.bytes;files[p+'-jobs.json']=jobs.bytes;origin[p]={run:run.data,jobs:jobs.data};
 }
 verifyCompletedIntake(origin.intake.run,origin.intake.jobs);
 const list=await get('/actions/runs/'+PINS.intakeRun+'/artifacts?per_page=100');
 const selected=selectIntakeArtifact(list.data);allowed.add('/actions/artifacts/'+selected.id);
 const artifacts={};
 for(const [p,id]of [['signing',PINS.signingArtifact],['intake',selected.id]]) {
 const a=await get('/actions/artifacts/'+id);artifacts[p]=a.data;files[p+'-artifact.json']=a.bytes;
 if(p==='intake')assert.deepEqual(a.data,selected);
 }
 verifyIntakeOrigin(origin.signing.run,artifacts.signing,origin.signing.jobs.jobs,{
 SOURCE_SHA:PINS.source,SIGNED_RUN_ID:String(PINS.signingRun),SIGNED_ARTIFACT_ID:String(PINS.signingArtifact),
 SIGNED_IPA_SHA256:'82ff41f44647989c4365b1607ea290f6802750f5c0b264b8dbadf5a333430897',
 SIGNED_ARTIFACT_ZIP_SHA256:'9abbc6c6b730fe8c3eadbe72266eec9f74766b8e4bba15710b1bb0b25ec53554'
 });
 assert.equal(Object.keys(files).length,10);
 return {files,receipt:{scope:'PUBLIC_GITHUB_METADATA_GET_ONLY',source:PINS.source,intakeRun:PINS.intakeRun,
 signingRun:PINS.signingRun,intakeArtifact:selected.id,inputSha256:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,hash(b)])),
 originalArchiveDownloadsPerformed:false,retainedOriginalArchives:false,appleDataIncluded:false,appleKeysAccessed:false,appleUploadPerformed:false,ownerAvailabilityAccepted:false,databaseAccepted:false,publicReleaseAccepted:false}};
}
export async function main() {
 const result=await collectOriginalInputs(process.env.GH_TOKEN);
 const out=resolve(process.env.GITHUB_WORKSPACE,'original-inputs');mkdirSync(out,{recursive:false,mode:0o700});
 for(const [name,bytes]of Object.entries(result.files))writeFileSync(resolve(out,name),bytes,{flag:'wx',mode:0o600});
 writeFileSync(resolve(out,'collector-receipt.json'),JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Ten public GitHub metadata files saved. No archive download, Apple data, credentials or release action.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
