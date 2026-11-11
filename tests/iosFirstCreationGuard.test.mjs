import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {CONTRACT as C,githubJsonGet,validateCreationContext,verifyFirstCreation,verifyFirstCreationReceipt} from '../scripts/qa/ios-signing/first-creation-guard.mjs';

const clone=value=>structuredClone(value);
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
const next=read('../.github/workflows/ios196-459-private-sign-only-20261111.yml');
const old=JSON.parse(read('./fixtures/ios195-first-creation-old.json'));
const input=name=>new RegExp('^      '+name+': "([^"]+)"$','m').exec(next)?.[1];
const sha='2a62c846ed397b93dd68fe0363da0dd148ca9a8e';
const repo={full_name:C.repository,id:C.repositoryId};
const branchRef=`refs/heads/${C.branch}`;
const context=()=>({GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:C.repository,GITHUB_REPOSITORY_ID:String(C.repositoryId),
 GITHUB_REF:branchRef,GITHUB_REF_NAME:C.branch,GITHUB_REF_TYPE:'branch',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_RUN_ID:'700001',GITHUB_RUN_NUMBER:'3',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,
 GITHUB_WORKFLOW:C.name,GITHUB_WORKFLOW_REF:`${C.repository}/${C.path}@${branchRef}`,
 GITHUB_API_URL:C.api,GITHUB_SERVER_URL:C.server,WORKFLOW_COMMIT:sha,WORKFLOW_REF:`${C.repository}/${C.path}@${branchRef}`,
 SOURCE_SHA:input('SOURCE_SHA'),SOURCE_TREE:input('SOURCE_TREE'),IOS_VERSION:input('IOS_VERSION'),IOS_BUILD:input('IOS_BUILD'),
 ...Object.fromEntries(['SOURCE_QA_RUN','SOURCE_WINDOWS_QA_RUN','SOURCE_FONT_QA_RUN','SOURCE_AUTH_QA_RUN'].map(k=>[k,input(k)]))});
const event=()=>({ref:branchRef,repository:clone(repo),created:true,before:C.zero,after:sha,forced:false,deleted:false,head_commit:{id:sha}});
const run=()=>({id:700001,workflow_id:900001,path:C.path,event:'push',head_branch:C.branch,head_sha:sha,head_commit:{id:sha},
 repository:clone(repo),head_repository:clone(repo),run_attempt:1,run_number:3,previous_attempt_url:null,
 url:`${C.api}/repos/${C.repository}/actions/runs/700001`,workflow_url:`${C.api}/repos/${C.repository}/actions/workflows/900001`});
const workflow=()=>({id:900001,path:C.path,name:C.name,state:'active',url:`${C.api}/repos/${C.repository}/actions/workflows/900001`});
function api(options={}){
 const calls=[];
 const get=async path=>{
  calls.push(path);if(options.fail)throw new Error('synthetic unavailable GET');
  if(path.endsWith('/actions/runs/700001'))return clone(options.current??run());
  if(path.endsWith('/actions/workflows/900001'))return clone(options.workflow??workflow());
  const page=/\/runs\?per_page=100&page=(\d+)$/.exec(path)?.[1];
  assert.ok(page,'Unexpected GET path '+path);
  if(options.history)return clone(await options.history(Number(page),calls));
  return {total_count:1,workflow_runs:Number(page)===1?[run()]:[]};
 };
 return {get,calls};
}
const expression=text=>/^    if: \$\{\{ (.+) \}\}$/m.exec(text)?.[1];
const bytes=receipt=>Buffer.from(JSON.stringify(receipt,null,2)+'\n');
const hash=data=>createHash('sha256').update(data).digest('hex');

test('OLD iOS condition rejects creation counter3; FINAL accepts only creation with two complete current-only histories',async()=>{
 const github={repository:C.repository,ref:branchRef,workflow_ref:context().GITHUB_WORKFLOW_REF,event_name:'push',event:event(),run_attempt:1,run_number:old.runNumber};
 assert.equal(old.runNumber,3);assert.equal(old.runAttempt,1);
 const legacyGithub={...github,ref:'refs/heads/'+old.branch};
 assert.equal(runInNewContext(old.jobIf,{github:legacyGithub}),false);
 assert.equal(runInNewContext(old.jobIf,{github:{...legacyGithub,run_number:1}}),true);
 assert.equal(runInNewContext(expression(next),{github}),true);
 const mock=api(),receipt=await verifyFirstCreation(context(),event(),mock.get);
 assert.equal(receipt.ready,true);assert.equal(receipt.runNumberCounterOnly,3);assert.equal(receipt.priorRetainedRuns,0);
 assert.deepEqual(receipt.historyCounts,[1,1]);assert.deepEqual(receipt.historyPages,[2,2]);assert.equal(mock.calls.length,7);
 assert.equal(receipt.application.sourceSha,input('SOURCE_SHA'));assert.equal(receipt.application.sourceTree,input('SOURCE_TREE'));
 const raw=bytes(receipt);assert.deepEqual(verifyFirstCreationReceipt(raw,hash(raw),context(),event()),receipt);
});
test('every missing or altered runtime identity is rejected before any GET',async()=>{
 for(const key of Object.keys(context())){
  for(const changed of [undefined,'unexpected']){
   const values={...context(),[key]:changed},mock=api();
   await assert.rejects(verifyFirstCreation(values,event(),mock.get),undefined,key);
   assert.equal(mock.calls.length,0,key);
  }
 }
 for(const counter of ['0','-1','3.0','9007199254740992'])assert.throws(()=>validateCreationContext({...context(),GITHUB_RUN_NUMBER:counter},event()));
});

test('positive run counters are recorded without accepting them as execution-history evidence',async()=>{
 for(const counter of [1,3,4,999999]){
  const current={...run(),run_number:counter};
  const mock=api({current,history:page=>({total_count:1,workflow_runs:page===1?[current]:[]})});
  const receipt=await verifyFirstCreation({...context(),GITHUB_RUN_NUMBER:String(counter)},event(),mock.get);
  assert.equal(receipt.ready,true);assert.equal(receipt.runNumberCounterOnly,counter);
 }
});

test('missing/changed first-creation flags, source, repository or ref never reaches GET',async()=>{
 const changes=[{created:false},{created:'true'},{created:undefined},{before:'b'.repeat(40)},{before:undefined},{forced:true},{forced:'false'},{forced:undefined},{deleted:true},{deleted:'false'},{deleted:undefined},{ref:'refs/heads/main'},{after:'b'.repeat(40)},{head_commit:null},{repository:{...repo,id:1}},{repository:{...repo,full_name:'other/repo'}},{repository:undefined}];
 for(const changed of changes){const mock=api();await assert.rejects(verifyFirstCreation(context(),{...event(),...changed},mock.get));assert.equal(mock.calls.length,0);}
});

test('current API run identity, source, path, repository, attempt and unknown fields are rejected',async()=>{
 const changes=[{id:700002},{workflow_id:undefined},{path:'other.yml'},{event:'workflow_dispatch'},{head_branch:'main'},{head_sha:'b'.repeat(40)},{head_commit:{id:'b'.repeat(40)}},{repository:{...repo,id:1}},{head_repository:null},{run_attempt:2},{run_attempt:undefined},{previous_attempt_url:'prior'},{previous_attempt_url:undefined},{run_number:1},{url:'https://foreign.example'},{workflow_url:'unknown'}];
 for(const changed of changes)await assert.rejects(verifyFirstCreation(context(),event(),api({current:{...run(),...changed}}).get));
 for(const changed of [{id:1},{path:'other.yml'},{name:'other'},{state:'disabled_manually'},{url:'unknown'}])await assert.rejects(verifyFirstCreation(context(),event(),api({workflow:{...workflow(),...changed}}).get));
});

test('any prior run, duplicate, other event/branch, unknown data or incomplete pagination rejects',async()=>{
 const prior={...run(),id:700000,run_number:2};
 const histories=[
  page=>({total_count:2,workflow_runs:page===1?[run(),prior]:[]}),
  page=>({total_count:2,workflow_runs:page===1?[run(),run()]:[]}),
  page=>({total_count:1,workflow_runs:page===1?[{...run(),id:700000}]:[]}),
  page=>({total_count:1,workflow_runs:page===1?[{...run(),event:'workflow_dispatch'}]:[]}),
  page=>({total_count:1,workflow_runs:page===1?[{...run(),head_branch:'main'}]:[]}),
  page=>({total_count:1,workflow_runs:page===1?[{...run(),repository:undefined}]:[]}),
  ()=>({total_count:1,workflow_runs:[]}),
  ()=>({total_count:'1',workflow_runs:[run()]}),
  ()=>({total_count:1}),
  page=>({total_count:page===1?1:0,workflow_runs:page===1?[run()]:[]}),
  ()=>({total_count:1,workflow_runs:[run()]}),
  page=>({total_count:1,workflow_runs:page===1?[{...run(),run_attempt:2}]:[]})
 ];
 for(const history of histories)await assert.rejects(verifyFirstCreation(context(),event(),api({history}).get));
 const mock=api({history:(page,calls)=>({total_count:1,workflow_runs:page===1?[calls.filter(x=>x.includes('page=1')).length===1?run():prior]:[]})});
 await assert.rejects(verifyFirstCreation(context(),event(),mock.get),'changed history in second read');
 await assert.rejects(verifyFirstCreation(context(),event(),api({fail:true}).get));
});

test('all immutable history row fields are validated, including matching current id with stale source',async()=>{
 for(const changed of [{workflow_id:1},{path:'unknown'},{head_sha:'b'.repeat(40)},{head_commit:null},{head_repository:{...repo,id:1}},{run_number:4},{previous_attempt_url:undefined},{url:'unknown'},{workflow_url:'unknown'}]){
  await assert.rejects(verifyFirstCreation(context(),event(),api({history:page=>({total_count:1,workflow_runs:page===1?[{...run(),...changed}]:[]})}).get));
 }
});

test('transport performs only bounded GETs at exact official API paths and rejects errors without leaking tokens',async()=>{
 const calls=[],token='synthetic-test-token';
 const fetcher=async(url,options)=>{calls.push({url,options});return new Response('{"known":true}',{status:200,headers:{'content-type':'application/json'}});};
 const get=githubJsonGet(token,fetcher);
 assert.deepEqual(await get(`/repos/${C.repository}/actions/runs/700001`),{known:true});
 assert.equal(calls[0].url,`${C.api}/repos/${C.repository}/actions/runs/700001`);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');
 for(const path of ['/repos/foreign/repo/actions/runs/1',`/repos/${C.repository}/actions/runs/1/rerun`,'https://foreign.example'])await assert.rejects(get(path));
 assert.equal(calls.length,1);
 for(const response of [new Response('{}',{status:403,headers:{'content-type':'application/json'}}),new Response('{}',{status:200}),new Response('not json',{status:200,headers:{'content-type':'application/json'}}),new Response('[]',{status:200,headers:{'content-type':'application/json'}}),new Response(' '.repeat(2*1024*1024+1),{status:200,headers:{'content-type':'application/json'}})])await assert.rejects(githubJsonGet(token,async()=>response)(`/repos/${C.repository}/actions/runs/700001`));
 await assert.rejects(githubJsonGet(token,async()=>{throw new Error(token);})(`/repos/${C.repository}/actions/runs/700001`),error=>!error.message.includes(token));
});

test('new workflow job condition rejects every noncreation identity without relying on run_number',()=>{
 const github={repository:C.repository,ref:branchRef,workflow_ref:context().GITHUB_WORKFLOW_REF,event_name:'push',run_attempt:1,event:event(),run_number:3};
 assert.equal(runInNewContext(expression(next),{github}),true);
 for(const changed of [{repository:'other/repo'},{ref:'refs/heads/main'},{workflow_ref:'other/path'},{event_name:'workflow_dispatch'},{run_attempt:2},{event:{...event(),created:false}},{event:{...event(),before:'b'.repeat(40)}},{event:{...event(),forced:true}},{event:{...event(),deleted:true}}])assert.equal(runInNewContext(expression(next),{github:{...github,...changed}}),false);
 assert.ok(!expression(next).includes('run_number'));
});


test('stored proof rejects changed bytes, missing digest and every replayed source/run binding',async()=>{
 const receipt=await verifyFirstCreation(context(),event(),api().get),raw=bytes(receipt),digest=hash(raw);
 assert.throws(()=>verifyFirstCreationReceipt(Buffer.concat([raw,Buffer.from(' ')]),digest,context(),event()));
 assert.throws(()=>verifyFirstCreationReceipt(raw,undefined,context(),event()));
 for(const changed of [
  {GITHUB_RUN_ID:'700002'}, {GITHUB_RUN_NUMBER:'4'}, {GITHUB_RUN_ATTEMPT:'2'},
  {SOURCE_SHA:'b'.repeat(40)}, {SOURCE_TREE:'c'.repeat(40)}, {SOURCE_QA_RUN:'700009'}, {IOS_BUILD:'195'},
  {WORKFLOW_COMMIT:'b'.repeat(40)}, {WORKFLOW_REF:'other/path'}])
  assert.throws(()=>verifyFirstCreationReceipt(raw,digest,{...context(),...changed},event()));
 assert.throws(()=>verifyFirstCreationReceipt(raw,digest,context(),{...event(),created:false}));
});
test('digest alone cannot authorize malformed, incomplete or widened first-creation evidence',async()=>{
 const receipt=await verifyFirstCreation(context(),event(),api().get);
 const mutations=[{ready:false},{schemaVersion:2},{scope:'PUBLIC_RELEASE'},{repository:'other/repo'},
  {repositoryId:1},{branch:'main'},{workflowPath:'other.yml'},{workflowName:'other'},
  {workflowId:0},{runId:700002},{controlSha:'b'.repeat(40)},{runAttempt:2},{runNumberCounterOnly:1},
  {branchCreated:false},{before:'b'.repeat(40)},{forced:true},{deleted:true},{historyReads:1},
  {historyCounts:[1,2]},{historyPages:[1,1]},{priorRetainedRuns:1},{application:{...receipt.application,sourceSha:'b'.repeat(40)}},
  {appleSigningPerformed:true},{appleUploadPerformed:true},{unexpected:true}];
 for(const change of mutations){const raw=bytes({...receipt,...change});
  assert.throws(()=>verifyFirstCreationReceipt(raw,hash(raw),context(),event()),undefined,JSON.stringify(change));}
});
test('source guard requires the exact checksummed first-creation receipt before any Git or CI/Apple operation',async()=>{
 const file=new URL('../scripts/qa/ios-signing/source-guard.mjs',import.meta.url);
 const code=readFileSync(file,'utf8'),source=code.match(/export const RELEASE_SOURCE = '([0-9a-f]{40})'/)?.[1];
 const prior=process.env.SOURCE_SHA;let guard;
 try{process.env.SOURCE_SHA=source;guard=await import(file.href);}
 finally{if(prior===undefined)delete process.env.SOURCE_SHA;else process.env.SOURCE_SHA=prior;}
 const receipt=await verifyFirstCreation(context(),event(),api().get),raw=bytes(receipt);
 const temporary=resolve('synthetic-ios-runner-temp'),proof=resolve(temporary,C.outputDirectory,'first-creation-receipt.json');
 const env={...context(),RUNNER_TEMP:temporary,GITHUB_EVENT_PATH:resolve(temporary,'event.json'),IOS_FIRST_CREATION_RECEIPT:proof,IOS_FIRST_CREATION_SHA256:hash(raw)};
 const readText=path=>{assert.ok([env.GITHUB_EVENT_PATH,proof].includes(path));return path===proof?raw.toString('utf8'):JSON.stringify(event());};
 assert.equal(guard.verifySigningFirstCreation(readText,env).application.sourceSha,guard.RELEASE_SOURCE);
 for(const patch of [{IOS_FIRST_CREATION_RECEIPT:undefined},{IOS_FIRST_CREATION_RECEIPT:resolve(temporary,'other.json')},
  {IOS_FIRST_CREATION_SHA256:undefined},{IOS_FIRST_CREATION_SHA256:'0'.repeat(64)},{SOURCE_TREE:'c'.repeat(40)},{GITHUB_RUN_ID:'700002'}])
  assert.throws(()=>guard.verifySigningFirstCreation(readText,{...env,...patch}));
 const main=code.slice(code.indexOf('async function main()'));
 assert.ok(main.indexOf('verifySigningFirstCreation(')<main.indexOf('const runGit'));
 assert.ok(main.indexOf('verifySigningFirstCreation(')<main.indexOf('await verifyCommit'));
 assert.ok(main.includes('...source, firstCreation, phase, ci, apple, artifactSlot'));
 const fakeGit=args=>args[1]==='HEAD'?guard.RELEASE_SOURCE:guard.RELEASE_TREE;
 const appText=path=>path==='src/pwaBootstrap.mjs'?'const PWA_RELEASE = "532";':JSON.stringify({version:{number:'4.59',build:'196'}});
 assert.equal(guard.verifyCheckout(fakeGit,appText,{...context(),APPLE_TEAM_ID:'MA9S4L7WKS'}).sourceCommit,guard.RELEASE_SOURCE);
});
test('actual CLI writes GET evidence on acceptance and rejects a changed push before any GET',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ios-first-creation-')));
 try{
  assert.equal(root,realpathSync(root),'CLI fixture must use its canonical owned temporary root');
  const temporary=join(root,'runner-temp');mkdirSync(temporary);
  const fixture=join(root,'fixture.json'),eventFile=join(root,'event.json'),loader=join(root,'mock-fetch.mjs'),calls=join(root,'calls.jsonl');
  writeFileSync(fixture,JSON.stringify({run:run(),workflow:workflow()}));
  writeFileSync(loader,`import {readFileSync,appendFileSync} from 'node:fs';\nconst fixture=JSON.parse(readFileSync(${JSON.stringify(fixture)},'utf8'));\nglobalThis.fetch=async(url,options)=>{appendFileSync(${JSON.stringify(calls)},JSON.stringify({url,method:options.method})+'\\n');const u=new URL(url);const data=u.pathname.endsWith('/actions/runs/700001')?fixture.run:u.pathname.endsWith('/actions/workflows/900001')?fixture.workflow:{total_count:1,workflow_runs:u.searchParams.get('page')==='1'?[fixture.run]:[]};return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});};\n`);
  const cli=fileURLToPath(new URL('../scripts/qa/ios-signing/first-creation-guard.mjs',import.meta.url));
  const outputFile=join(root,'step-output.txt');
  const env={...process.env,...context(),GITHUB_OUTPUT:outputFile,RUNNER_TEMP:temporary,GITHUB_EVENT_PATH:eventFile,GH_TOKEN:'synthetic-cli-token'};
  writeFileSync(eventFile,JSON.stringify(event()));
  const accepted=join(temporary,C.outputDirectory);
  const result=spawnSync(process.execPath,['--import',pathToFileURL(loader).href,cli,'--output',accepted],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  const receiptRaw=readFileSync(join(accepted,'first-creation-receipt.json'));
  assert.equal(JSON.parse(receiptRaw).ready,true);
  assert.equal(readFileSync(outputFile,'utf8'),'receipt_path='+join(accepted,'first-creation-receipt.json')+'\nreceipt_sha256='+hash(receiptRaw)+'\n');
  const responses=JSON.parse(readFileSync(join(accepted,'github-get-responses.json')));
  assert.equal(responses.length,7);assert.ok(!JSON.stringify(responses).includes(env.GH_TOKEN));
  const recorded=readFileSync(calls,'utf8');assert.equal(recorded.trim().split('\n').length,7);
  const sourceCli=fileURLToPath(new URL('../scripts/qa/ios-signing/source-guard.mjs',import.meta.url));
  const privateMarker='synthetic-apple-key-must-not-be-printed';
  for(const proofEnv of [
   {IOS_FIRST_CREATION_RECEIPT:'',IOS_FIRST_CREATION_SHA256:''},
   {IOS_FIRST_CREATION_RECEIPT:join(accepted,'first-creation-receipt.json'),IOS_FIRST_CREATION_SHA256:'0'.repeat(64)}]){
   const rejectedSource=spawnSync(process.execPath,['--import',pathToFileURL(loader).href,sourceCli,'ci-only'],
    {env:{...env,...proofEnv,APPSTORE_API_PRIVATE_KEY:privateMarker},encoding:'utf8',windowsHide:true,timeout:10000});
   assert.equal(rejectedSource.error,undefined);assert.equal(rejectedSource.status,1);
   const expectedRejection=proofEnv.IOS_FIRST_CREATION_RECEIPT
    ?'Error: First-creation receipt digest mismatch':'Missing or substituted first-creation receipt path';
   assert.ok(rejectedSource.stderr.includes(expectedRejection),rejectedSource.stderr);
   assert.ok(!(rejectedSource.stdout+rejectedSource.stderr).includes(privateMarker));
   assert.equal(readFileSync(calls,'utf8'),recorded,'failed proof must not reach GitHub/Apple transport');
  }

  writeFileSync(eventFile,JSON.stringify({...event(),forced:true}));
  const rejected=join(temporary,'rejected');
  const failure=spawnSync(process.execPath,['--import',pathToFileURL(loader).href,cli,'--output',rejected],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(failure.error,undefined);assert.equal(failure.status,1);assert.equal(JSON.parse(readFileSync(join(rejected,'first-creation-receipt.json'))).ready,false);
  assert.deepEqual(JSON.parse(readFileSync(join(rejected,'github-get-responses.json'))),[]);
  assert.equal(readFileSync(calls,'utf8'),recorded);assert.ok(existsSync(join(accepted,'first-creation-receipt.json')));
 }finally{assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});}
});

test('actual CLI acceptance survives an aliased operating-system temporary directory without relaxing output ownership',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ios-first-creation-alias-')));
 try{
  const target=join(root,'canonical');mkdirSync(target);
  const alias=process.platform==='win32'?target.toUpperCase():join(root,'alias');
  if(process.platform!=='win32')symlinkSync(target,alias,'dir');
  // Windows needs no junction privilege: use a real case alias with the native
  // canonicalizer in the isolated child to reproduce macOS /var -> /private/var.
  const canonical=process.platform==='win32'?realpathSync.native:realpathSync;
  assert.notEqual(alias,canonical(alias));assert.equal(canonical(alias),target);
  const loader=join(root,'canonical-realpath.mjs');
  writeFileSync(loader,"import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';if(process.platform==='win32'){const create=fs.mkdtempSync;fs.mkdtempSync=(...args)=>create(...args).toUpperCase();fs.realpathSync=fs.realpathSync.native;syncBuiltinESMExports();}\n");
  const file=fileURLToPath(import.meta.url);
  const childEnv={...process.env,TEMP:alias,TMP:alias,TMPDIR:alias,NODE_OPTIONS:'--import='+pathToFileURL(loader).href};
  delete childEnv.NODE_TEST_CONTEXT; // Start an independent standard Node test runner.
  const child=spawnSync(process.execPath,['--test','--test-name-pattern=^actual CLI writes GET evidence on acceptance and rejects a changed push before any GET$',file],
   {env:childEnv,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(child.error,undefined);assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  assert.ok(child.stdout.includes('actual CLI writes GET evidence on acceptance and rejects a changed push before any GET'),child.stdout+'\n'+child.stderr);
 }finally{
  assert.equal(dirname(root),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});
 }
});


test('first-creation gate precedes the app checkout, keys and signing; existing downstream signing body is preserved',()=>{
 const gate=next.indexOf('first-creation-guard.mjs" --output'),checkout=next.indexOf('name: Checkout the frozen application source explicitly');
 assert.ok(gate>=0&&gate<checkout);assert.ok(gate<next.indexOf('secrets.APPSTORE'));
 assert.ok(next.includes('ref: ${{ github.workflow_sha }}\n          path: release-bootstrap'));
 for(const phase of ['ci-only','before-build','after-export']){
  const command='source-guard.mjs" '+phase,at=next.indexOf(command);assert.ok(at>gate);
  const step=next.slice(next.lastIndexOf('      - name:',at),at);
  assert.ok(step.includes('IOS_FIRST_CREATION_RECEIPT: ${{ steps.first_creation.outputs.receipt_path }}'));
  assert.ok(step.includes('IOS_FIRST_CREATION_SHA256: ${{ steps.first_creation.outputs.receipt_sha256 }}'));
 }
 for(const token of ['workflow_dispatch:','workflow_call:','pull_request:','schedule:','continue-on-error','--retry','run_number == 1','upload-testflight-build','reviewSubmission'])
  assert.ok(!next.includes(token),token);
 assert.ok(next.includes('../../../tests/iosFirstCreationGuard.test.mjs'));
});

test('signing Bash blocks parse without executing build commands',()=>{
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 for(const match of next.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)){
  const command=match[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n').replace(/\$\{\{[\s\S]*?\}\}/g,'QA_EXPRESSION');
  const result=spawnSync(bash,['-n'],{input:command,encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
 }
});
