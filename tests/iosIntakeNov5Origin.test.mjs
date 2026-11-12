import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {CONTRACT,INTAKE_BINDINGS,requireBoundIntakePins,boundEnvironment} from '../scripts/qa/ios-signing/intake-bindings.mjs';
import {verifyOrigin} from '../scripts/qa/ios-signing/intake194-package-origin.mjs';
import {verifySigningControls,verifyStoredFirstCreation,SIGNING_STEPS} from '../scripts/qa/ios-signing/intake-nov5-proof.mjs';
import {CONTRACT as SIGN,verifyFirstCreation as signingCreation} from '../scripts/qa/ios-signing/first-creation-guard.mjs';
import {CONTRACT as OWN,verifyFirstCreation as intakeCreation,main as creationMain} from '../scripts/qa/ios-signing/intake-first-creation-guard.mjs';
import {verifyRuns,verifyIntakeFirstCreation,verifyPreUploadEvidence} from '../scripts/qa/ios-signing/intake-source-guard.mjs';
import {SOURCE_QA_JOBS} from '../scripts/qa/ios-signing/source-ci-required-jobs.mjs';
import {main as originMain} from '../scripts/qa/ios-signing/intake-origin-guard.mjs';
import {main as downloadMain} from '../scripts/qa/ios-signing/download-intake-artifact.mjs';
import {main as decryptMain,unprotect} from '../scripts/qa/ios-signing/protect-artifact.mjs';
const data=JSON.parse(readFileSync(new URL('./fixtures/ios196-qa509-synthetic-intake.json',import.meta.url),'utf8'));
assert.equal(data.scope,'SYNTHETIC_ONLY_NOT_AN_ARTIFACT_OR_RELEASE');
const copy=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(counter=7){
 const f=copy(data);f.pins.signing.runNumber=counter;f.run.run_number=counter;f.origin.signingRunNumber=counter;f.firstCreation.runNumberCounterOnly=counter;
 f.env=boundEnvironment(f.pins);f.controls=verifySigningControls(f.pins.signing.toolsSha,'',f.controlFiles,f.pins);
 f.verify=()=>verifyOrigin(f.run,f.artifact,f.jobs,f.env,{pins:f.pins,controlProof:f.controls,workflow:f.workflow});return f;
}
function creation(f,C=OWN){
 const own=C===OWN,sha=own?'4'.repeat(40):f.pins.signing.toolsSha,ref='refs/heads/'+C.branch,id=own?'800001':f.pins.signing.runId,n=own?11:f.pins.signing.runNumber,wid=own?900002:900001;
 const wr=CONTRACT.repository+'/'+C.path+'@'+ref;
 const env={...f.env,GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:CONTRACT.repository,GITHUB_REPOSITORY_ID:String(CONTRACT.repositoryId),GITHUB_REF:ref,GITHUB_REF_NAME:C.branch,GITHUB_REF_TYPE:'branch',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_RUN_ID:id,GITHUB_RUN_NUMBER:String(n),GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_WORKFLOW:C.name,GITHUB_WORKFLOW_REF:wr,GITHUB_API_URL:'https://api.github.com',GITHUB_SERVER_URL:'https://github.com',WORKFLOW_COMMIT:sha,WORKFLOW_REF:wr};
 const event={ref,repository:{full_name:CONTRACT.repository,id:CONTRACT.repositoryId},created:true,before:'0'.repeat(40),after:sha,head_commit:{id:sha},forced:false,deleted:false};
 const run={...f.run,id:Number(id),head_sha:sha,head_commit:{id:sha},head_branch:C.branch,path:C.path,run_number:n,workflow_id:wid,url:'https://api.github.com/repos/'+CONTRACT.repository+'/actions/runs/'+id,workflow_url:'https://api.github.com/repos/'+CONTRACT.repository+'/actions/workflows/'+wid};
 const workflow={id:wid,path:C.path,name:C.name,state:'active',url:run.workflow_url},calls=[];
 const get=async path=>{calls.push(path);if(path.endsWith('/actions/runs/'+id))return copy(run);if(path.endsWith('/actions/workflows/'+wid))return copy(workflow);
  const page=/\/runs\?per_page=100&page=(\d+)$/.exec(path)?.[1];assert.ok(page,'Unexpected synthetic endpoint');return {total_count:1,workflow_runs:page==='1'?[copy(run)]:[]};};
 return {env,event,run,workflow,calls,get};
}
function reads(f){
 const records={'upload-origin.json':copy(f.origin),'original-artifact-before-upload.json':{sourceCommit:f.pins.application.sourceSha,sourceTree:f.pins.application.sourceTree,ipaSha256:f.pins.signing.ipaSha256,originalSigningRunId:f.pins.signing.runId,signingRunNumber:f.pins.signing.runNumber,rebuilt:false,signatureReverified:true,everyOriginalWebAssetMatches:true,everyOriginalWebAssetMatchesCanonicalGitBuild:true,originalSourceInputsMatchCurrentGit:true,firstCreationVerified:true,appleUploadPerformed:false}};
 for(const name of ['source-ci-only','source-before-build','source-after-export'])records[name+'.json']={firstCreation:copy(f.firstCreation)};
 return {records,read:path=>path.endsWith('/SogrimHashbon.ipa')?Buffer.from(f.ipaBase64,'base64'):Buffer.from(JSON.stringify(records[path.split('/').at(-1)]))};
}
test('real source/tool preparation is separate from explicit synthetic artifact fixtures',()=>{
 assert.equal(INTAKE_BINDINGS.application.sourceSha,'4d7c1c93cec2967dc6accec4fd7679220a49c9db');assert.equal(INTAKE_BINDINGS.signing.toolsSha,'e01c22c9187e46c2f0d31a2396c633609bc3765e');
 if(JSON.stringify(INTAKE_BINDINGS).includes('PENDING'))assert.throws(()=>requireBoundIntakePins(),/PENDING/);else requireBoundIntakePins();assert.doesNotThrow(()=>requireBoundIntakePins(fixture().pins));
});
for(const key of ['runId','artifactId','runNumber','jobId','artifactSize','ipaSize','ciphertextSize','zipSha256','ipaSha256','ciphertextSha256'])
 test('unbound '+key+' rejects before original access',()=>{const f=fixture();f.pins.signing[key]='PENDING';assert.throws(()=>requireBoundIntakePins(f.pins),/PENDING/);});
for(const counter of [1,3,7,19])test('original positive counter '+counter+' is actual matching metadata',async()=>{
 const f=fixture(counter),origin=f.verify(),c=creation(f,SIGN),proof=await signingCreation(c.env,c.event,c.get);
 assert.equal(c.calls.length,7);assert.equal(origin.signingRunNumber,counter);assert.deepEqual(verifyStoredFirstCreation(proof,origin,f.pins),proof);
});
for(const n of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'7'])test('original rejects invalid counter '+String(n),()=>{const f=fixture();f.run.run_number=n;assert.throws(f.verify);});
test('Nov5 original origin requires exact control readback and all intake-only false flags',()=>{
 const f=fixture();assert.deepEqual(f.verify(),f.origin);for(const k of ['databaseAccepted','publicReleaseAccepted','distributionAllowed','appleUploadPerformed'])assert.equal(f.origin[k],false);
 assert.throws(()=>verifySigningControls('5'.repeat(40),'',f.controlFiles,f.pins));assert.throws(()=>verifySigningControls(f.pins.signing.toolsSha,' M file',f.controlFiles,f.pins));
 for(const path of Object.keys(f.controlFiles)){const changed=copy(f.controlFiles);changed[path]+='changed';assert.throws(()=>verifySigningControls(f.pins.signing.toolsSha,'',changed,f.pins));}
});
for(const change of [{head_sha:'5'.repeat(40)},{head_branch:'codex/ios195-459-private-tools-20261104'},{path:'.github/workflows/ios195-459-private-sign-only.yml'},{event:'workflow_dispatch'},{run_attempt:2},{previous_attempt_url:'prior'},{head_commit:{id:'5'.repeat(40)}},{repository:{full_name:CONTRACT.repository,id:1}},{head_repository:{full_name:'foreign/repo',id:1}},{run_number:3},{conclusion:'failure'}])
 test('origin rejects changed signing identity '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f.run,change);assert.throws(f.verify);});
for(const name of SIGNING_STEPS)test('requires original successful step '+name,()=>{
 for(const mode of ['missing','duplicate','skipped','failure']){const f=fixture(),at=f.jobs[0].steps.findIndex(s=>s.name===name);if(mode==='missing')f.jobs[0].steps.splice(at,1);else if(mode==='duplicate')f.jobs[0].steps.push(copy(f.jobs[0].steps[at]));else f.jobs[0].steps[at].conclusion=mode;assert.throws(f.verify,undefined,mode);}
});
test('origin rejects substituted artifact, job and absent control/workflow proof',()=>{
 for(const change of [{id:1},{size_in_bytes:1},{digest:'sha256:'+'b'.repeat(64)},{expired:true},{workflow_run:{id:2,head_sha:'3'.repeat(40)}}]){const f=fixture();Object.assign(f.artifact,change);assert.throws(f.verify);}
 const f=fixture();assert.throws(()=>verifyOrigin(f.run,f.artifact,f.jobs,f.env,{pins:f.pins,workflow:f.workflow}));f.jobs[0].id++;assert.throws(f.verify);
});
test('firstCreation fields reject false histories and replayed source/run/counter identities',()=>{
 const f=fixture();assert.deepEqual(verifyStoredFirstCreation(f.firstCreation,f.origin,f.pins),f.firstCreation);
 for(const change of [{ready:false},{scope:'PUBLIC_RELEASE'},{runId:1},{controlSha:'5'.repeat(40)},{runAttempt:2},{runNumberCounterOnly:3},{branchCreated:false},{before:'5'.repeat(40)},{forced:true},{deleted:true},{historyReads:1},{historyCounts:[1,2]},{historyPages:[1,1]},{workflowId:1},{application:{...f.firstCreation.application,sourceSha:'5'.repeat(40)}},{unexpected:true}])
  assert.throws(()=>verifyStoredFirstCreation({...f.firstCreation,...change},f.origin,f.pins));
});
test('all three original receipts and final IPA proof are required before upload',()=>{
 const f=fixture(),b=reads(f);assert.deepEqual(verifyPreUploadEvidence(b.read,f.pins),f.firstCreation);
 for(const name of ['source-ci-only','source-before-build','source-after-export']){const x=reads(f);delete x.records[name+'.json'].firstCreation;assert.throws(()=>verifyPreUploadEvidence(x.read,f.pins));}
 for(const change of [{firstCreationVerified:false},{rebuilt:true},{signatureReverified:false},{originalSigningRunId:'1'},{signingRunNumber:3}]){const x=reads(f);Object.assign(x.records['original-artifact-before-upload.json'],change);assert.throws(()=>verifyPreUploadEvidence(x.read,f.pins));}
 assert.throws(()=>verifyPreUploadEvidence(path=>path.endsWith('.ipa')?Buffer.from('changed'):b.read(path),f.pins));
});
test('own intake creation proof uses two complete histories and is consumed before Git/CI',async()=>{
 const f=fixture(),c=creation(f),proof=await intakeCreation(c.env,c.event,c.get);assert.equal(proof.scope,'PRIVATE_IOS_INTAKE_CREATION_ONLY');assert.equal(proof.runNumberCounterOnly,11);assert.equal(c.calls.length,7);assert.deepEqual(proof.historyCounts,[1,1]);assert.deepEqual(proof.historyPages,[2,2]);
 const raw=Buffer.from(JSON.stringify(proof)+'\n'),env={...c.env,RUNNER_TEMP:resolve('synthetic-intake-temp'),GITHUB_EVENT_PATH:resolve('synthetic-event.json')};
 env.IOS_INTAKE_FIRST_CREATION_RECEIPT=resolve(env.RUNNER_TEMP,OWN.outputDirectory,'first-creation-receipt.json');env.IOS_INTAKE_FIRST_CREATION_SHA256=hash(raw);
 const read=path=>path===env.GITHUB_EVENT_PATH?JSON.stringify(c.event):raw.toString('utf8');assert.deepEqual(verifyIntakeFirstCreation(read,env,f.pins),proof);
 for(const change of [{IOS_INTAKE_FIRST_CREATION_SHA256:undefined},{IOS_INTAKE_FIRST_CREATION_SHA256:'0'.repeat(64)},{IOS_INTAKE_FIRST_CREATION_RECEIPT:'other'},{GITHUB_RUN_ID:'800002'},{GITHUB_RUN_NUMBER:'3'},{GITHUB_RUN_ATTEMPT:'2'}])assert.throws(()=>verifyIntakeFirstCreation(read,{...env,...change},f.pins));
 assert.throws(()=>verifyStoredFirstCreation(proof,f.origin,f.pins));
});
test('own intake missing identity and noncreation flags reject before any GET',async()=>{
 const f=fixture(),keys=Object.keys(creation(f).env).filter(k=>k.startsWith('GITHUB_')||['SOURCE_SHA','SOURCE_TREE','IOS_VERSION','IOS_BUILD','WORKFLOW_COMMIT','WORKFLOW_REF',...Object.keys(f.pins.application.ciRuns)].includes(k));
 for(const key of keys){const c=creation(f);await assert.rejects(intakeCreation({...c.env,[key]:undefined},c.event,c.get),undefined,key);assert.equal(c.calls.length,0);}
 for(const change of [{created:false},{before:'5'.repeat(40)},{forced:true},{deleted:true},{after:'5'.repeat(40)}]){const c=creation(f);await assert.rejects(intakeCreation(c.env,{...c.event,...change},c.get));assert.equal(c.calls.length,0);}
});
test('own intake full histories reject prior runs, duplicates, incomplete totals and second-read races',async()=>{
 for(const kind of ['prior','duplicate','incomplete','second-read-change']){const c=creation(fixture());let firsts=0;
  const get=async path=>{if(!path.includes('/runs?'))return c.get(path);const page=Number(new URL('https://api.github.com'+path).searchParams.get('page'));if(page===1)firsts++;
   if(kind==='incomplete')return {total_count:2,workflow_runs:page===1?[c.run]:[]};
   if(kind==='prior')return {total_count:2,workflow_runs:page===1?[c.run,{...c.run,id:800000}]:[]};
   if(kind==='duplicate')return {total_count:2,workflow_runs:page===1?[c.run,c.run]:[]};
   return {total_count:1,workflow_runs:page===1?[firsts===1?c.run:{...c.run,head_sha:'5'.repeat(40)}]:[]};};
  await assert.rejects(intakeCreation(c.env,c.event,get),undefined,kind);
 }
 for(const n of [1,3,11]){const c=creation(fixture());c.env.GITHUB_RUN_NUMBER=String(n);c.run.run_number=n;assert.equal((await intakeCreation(c.env,c.event,c.get)).runNumberCounterOnly,n);}
});
function ciFetch(f,change={}){
 return async url=>{const m=/\/actions\/runs\/(\d+)(.*)$/.exec(new URL(url).pathname);assert.ok(m);const id=m[1],key=Object.keys(f.pins.application.ciRuns).find(k=>f.pins.application.ciRuns[k]===id);assert.ok(key);
  const paths={SOURCE_QA_RUN:'.github/workflows/qa.yml',SOURCE_WINDOWS_QA_RUN:'.github/workflows/qa-windows.yml',SOURCE_FONT_QA_RUN:'.github/workflows/cross-engine-font-provenance-qa.yml',SOURCE_AUTH_QA_RUN:'.github/workflows/ios-auth-return-qa.yml'};
  if(!m[2])return Response.json({id:Number(id),repository:{full_name:CONTRACT.repository},head_repository:{full_name:CONTRACT.repository},head_sha:f.pins.application.sourceSha,head_branch:f.pins.application.branch,event:'workflow_dispatch',path:paths[key],status:'completed',conclusion:'success',run_attempt:1});
  const names=key==='SOURCE_QA_RUN'?SOURCE_QA_JOBS:({SOURCE_WINDOWS_QA_RUN:['windows-unit'],SOURCE_FONT_QA_RUN:['linux-font-provenance'],SOURCE_AUTH_QA_RUN:['native']})[key];
  let jobs=names.map((name,i)=>({id:Number(id)*1000+i+1,run_id:Number(id),head_sha:f.pins.application.sourceSha,name,status:'completed',conclusion:'success'}));
  if(key==='SOURCE_QA_RUN'&&change.missing)jobs=jobs.filter(j=>j.name!==change.missing);
  if(key==='SOURCE_QA_RUN'&&change.skipped)jobs=jobs.map(j=>j.name===change.skipped?{...j,conclusion:'skipped'}:j);
  return Response.json({total_count:jobs.length,jobs});
 };
}
test('complete source CI contains four exact runs and68 required QA jobs',async()=>{const f=fixture(),rows=await verifyRuns(ciFetch(f),'synthetic-token',f.env,f.pins);assert.equal(rows.length,4);assert.equal(SOURCE_QA_JOBS.length,68);assert.equal(rows[0].jobs.length,68);});
for(const name of SOURCE_QA_JOBS){
 test('reject missing required source job '+name,async()=>{const f=fixture();await assert.rejects(verifyRuns(ciFetch(f,{missing:name}),'synthetic-token',f.env,f.pins));});
 test('reject skipped required source job '+name,async()=>{const f=fixture();await assert.rejects(verifyRuns(ciFetch(f,{skipped:name}),'synthetic-token',f.env,f.pins));});
}

async function pendingOperationalModules(){
 // Rebind only the test's JSON input to explicit unbound metadata. This runs the
 // actual CLI bodies after import, even after real production pins are completed.
 const pending=copy(INTAKE_BINDINGS);pending.signing.runId='PENDING';pending.signing.artifactId='PENDING';
 let gets=0,writes=0,secrets=0,commands=0;
 const forbidden=()=>{writes++;throw Error('UNEXPECTED_WRITE');};
 const env=new Proxy({},{get(_target,key){if(String(key).includes('PRIVATE_KEY')){secrets++;throw Error('UNEXPECTED_SECRET');}return undefined;}});
 const context=vm.createContext({assert,Buffer,URL,URLSearchParams,AbortSignal,TextEncoder,TextDecoder,console,
   process:{argv:[],env,cwd:()=>{throw Error('UNEXPECTED_CWD');}},
   fetch:async()=>{gets++;throw Error('UNEXPECTED_GET');}});
 const cache=new Map(),{fileURLToPath}=await import('node:url');
 async function moduleFor(id){
  if(cache.has(id))return cache.get(id);
  if(id.startsWith('node:')){
   const native=await import(id),values={...native};
   if(id==='node:fs'){
    values.readFileSync=(input,options)=>String(input).endsWith('/intake-bindings.json')?
     (options?JSON.stringify(pending):Buffer.from(JSON.stringify(pending))):readFileSync(input,options);
    for(const name of ['appendFileSync','mkdirSync','writeFileSync'])values[name]=forbidden;
   }
   if(id==='node:child_process')values.execFileSync=()=>{commands++;throw Error('UNEXPECTED_COMMAND');};
   const m=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:id});cache.set(id,m);return m;
  }
  const m=new vm.SourceTextModule(readFileSync(fileURLToPath(id),'utf8'),{context,identifier:id,initializeImportMeta(meta){meta.url=id;}});
  cache.set(id,m);await m.link((specifier,parent)=>moduleFor(specifier.startsWith('node:')?specifier:new URL(specifier,parent.identifier).href));return m;
 }
 const modules={};
 for(const name of ['intake-origin-guard','download-intake-artifact','protect-artifact','intake-first-creation-guard']){
  const m=await moduleFor(new URL('../scripts/qa/ios-signing/'+name+'.mjs',import.meta.url).href);await m.evaluate();modules[name]=m.namespace;
 }
 return {modules,env,counts:()=>({gets,writes,secrets,commands})};
}
test('PENDING stops actual operational bodies before GET, filesystem work or key/decrypt',async()=>{
 const {modules:m,env,counts}=await pendingOperationalModules();
 await assert.rejects(m['intake-origin-guard'].main({env}),/PENDING/);
 await assert.rejects(m['download-intake-artifact'].main({env}),/PENDING/);
 assert.throws(()=>m['protect-artifact'].main(['decrypt','not-read','not-written'],env),/PENDING/);
 assert.throws(()=>m['protect-artifact'].unprotect(Buffer.alloc(1),{},'synthetic-key-not-parsed'),/PENDING/);
 await assert.rejects(m['intake-first-creation-guard'].main(),/PENDING/);
 assert.deepEqual(counts(),{gets:0,writes:0,secrets:0,commands:0});
});
test('Nov5 preparation stays inactive; creation and original origin precede keys; old route stays disabled',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8').replaceAll('\r\n','\n'),w=read('../.github/workflows/ios196-459-private-intake-only-20261111.yml');
 assert.ok(read('../.github/workflows/ios195-459-private-intake-only.yml').includes('false && github.repository'));if(JSON.stringify(INTAKE_BINDINGS).includes('PENDING'))assert.match(w,/if: \$\{\{ false &&/);else assert.match(w,/github.event.created == true/);
 assert.ok(!w.includes('run_number == 1')&&!w.includes('run_number == 3'));assert.ok(w.includes(CONTRACT.intakeBranch));
 const at=w.indexOf('intake-first-creation-guard.mjs" --output');assert.ok(at>0&&at<w.indexOf('name: Checkout frozen application'));assert.ok(at<w.indexOf('secrets.APPSTORE_API_PRIVATE_KEY'));
 assert.ok(w.indexOf('intake-origin-guard.mjs')<w.indexOf('secrets.APPSTORE_API_PRIVATE_KEY'));assert.ok(w.indexOf('verify-original-archive.py')<w.indexOf('apple-actions/upload-testflight-build'));
 for(const phase of ['ci-only','before-upload']){const n=w.indexOf('intake-source-guard.mjs" '+phase),block=w.slice(w.lastIndexOf('      - name:',n),n);assert.ok(block.includes('IOS_INTAKE_FIRST_CREATION_RECEIPT:'));assert.ok(block.includes('IOS_INTAKE_FIRST_CREATION_SHA256:'));}
 for(const token of ['xcodebuild','native:prepare','import-codesign','reviewSubmission','betaAppReviewSubmission','appStoreVersionReleaseRequest'])assert.ok(!w.includes(token),token);
 const s=read('../scripts/qa/ios-signing/intake-source-guard.mjs'),main=s.slice(s.indexOf('async function main()'));assert.ok(main.indexOf('verifyIntakeFirstCreation(')<main.indexOf('const runGit'));assert.ok(s.includes('intakeFirstCreation, originalFirstCreation'));
});
test('OLD counter1 origin accepts success without creation steps; Nov5 rejects it',()=>{
 const f=fixture(1);let old=data.oldPackageOrigin.replace(/^import .*$/mg,'').replaceAll('export ','');
 for(const [k,v]of Object.entries({SOURCE:f.pins.application.sourceSha,TREE:f.pins.application.sourceTree,SIGNING_TOOLS:f.pins.signing.toolsSha}))old=old.replace(new RegExp("const "+k+"='[^']*'"),"const "+k+"='"+v+"'");
 const c=vm.createContext({assert,Date});vm.runInContext(old+'\nglobalThis.oldVerify=verifyOrigin;',c);
 const run={...f.run,head_branch:'codex/ios195-459-private-tools-20261104',path:'.github/workflows/ios195-459-private-sign-only.yml'},jobs=[{...f.jobs[0],steps:[]}];
 // The immutable historical producer requires its own195 artifact label.
 // Its bad counter/history and absent creation steps stay unchanged.
 const legacyArtifact={...f.artifact,name:'sogrim-ios-4.59-195-encrypted'};
 assert.doesNotThrow(()=>c.oldVerify(run,legacyArtifact,jobs,f.env));assert.throws(()=>verifyOrigin(run,f.artifact,jobs,f.env,{pins:f.pins,controlProof:f.controls,workflow:f.workflow}));
});

test('historical Nov5 fixture remains immutable alongside the successor route fixture',()=>{
 assert.equal(hash(readFileSync(new URL('./fixtures/ios195-nov5-intake.json',import.meta.url))),'16eb9d57c2794354973201b0fca625ec71ea56b5ef51c6727dcfda10b1374049');
});

test('historical delivered195 envelope fixture stays immutable for196 preparation',()=>{
 assert.equal(hash(readFileSync(new URL('./fixtures/ios195-envelope-intake.json',import.meta.url))),'2459d58b86ff24ada0cd222b212c0274a8420e5d7a7c4d12da1493bb603d3052');
});
