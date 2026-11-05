import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {CONTRACT as C, githubJsonGet, validateCreationContext, verifyFirstCreation} from '../scripts/qa/android-first-creation-guard.mjs';

const clone=value=>structuredClone(value);
const sha='2a62c846ed397b93dd68fe0363da0dd148ca9a8e';
const repo={full_name:C.repository,id:C.repositoryId};
const branchRef=`refs/heads/${C.branch}`;
const context=()=>({GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:C.repository,GITHUB_REPOSITORY_ID:String(C.repositoryId),GITHUB_REF:branchRef,GITHUB_REF_NAME:C.branch,GITHUB_REF_TYPE:'branch',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:'700001',GITHUB_RUN_NUMBER:'3',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_WORKFLOW:C.name,GITHUB_WORKFLOW_REF:`${C.repository}/${C.path}@${branchRef}`,GITHUB_API_URL:C.api,GITHUB_SERVER_URL:C.server});
const event=()=>({ref:branchRef,repository:clone(repo),created:true,before:C.zero,after:sha,forced:false,deleted:false,head_commit:{id:sha}});
const run=()=>({id:700001,workflow_id:900001,path:C.path,event:'push',head_branch:C.branch,head_sha:sha,head_commit:{id:sha},repository:clone(repo),head_repository:clone(repo),run_attempt:1,run_number:3,previous_attempt_url:null,url:`${C.api}/repos/${C.repository}/actions/runs/700001`,workflow_url:`${C.api}/repos/${C.repository}/actions/workflows/900001`});
const workflow=()=>({id:900001,path:C.path,name:C.name,state:'active',url:`${C.api}/repos/${C.repository}/actions/workflows/900001`});
function api(options={}){
 const calls=[];
 const get=async path=>{
  calls.push(path);
  if(options.fail)throw new Error('synthetic unavailable GET');
  if(path.endsWith('/actions/runs/700001'))return clone(options.current??run());
  if(path.endsWith('/actions/workflows/900001'))return clone(options.workflow??workflow());
  const page=/\/runs\?per_page=100&page=(\d+)$/.exec(path)?.[1];
  assert.ok(page,'Unexpected GET path '+path);
  if(options.history)return clone(await options.history(Number(page),calls));
  return {total_count:1,workflow_runs:Number(page)===1?[run()]:[]};
 };
 return {get,calls};
}
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
const old=read('../.github/workflows/android-abcb-emulator-36310-qa.yml');
const next=read('../.github/workflows/android-abcb-emu36310-first-create-qa.yml');
const expression=text=>/^    if: \$\{\{ (.+) \}\}$/m.exec(text)?.[1];
const block=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a);return text.slice(a,b);};

test('OLD blocks the first-creation counter3 fixture before any step; FINAL requires creation and current-only history',async()=>{
 const previous=JSON.parse(read('./fixtures/android-first-creation-old-skipped.json'));
 assert.equal(previous.run_number,3);assert.equal(previous.run_attempt,1);assert.equal(previous.job.steps.length,0);assert.equal(previous.job.conclusion,'skipped');
 const github={repository:C.repository,ref:`refs/heads/${previous.branch}`,workflow_ref:`${C.repository}/${previous.path}@refs/heads/${previous.branch}`,event_name:'push',event:event(),run_attempt:1,run_number:3};
 assert.equal(runInNewContext(expression(old),{github}),false,'OLD incorrectly uses counter==1 as execution history');
 Object.assign(github,{ref:branchRef,workflow_ref:context().GITHUB_WORKFLOW_REF});
 assert.equal(runInNewContext(expression(next),{github}),true);
 const mock=api();const receipt=await verifyFirstCreation(context(),event(),mock.get);
 assert.equal(receipt.ready,true);assert.equal(receipt.runNumberCounterOnly,3);assert.equal(receipt.priorRetainedRuns,0);
 assert.deepEqual(receipt.historyCounts,[1,1]);assert.deepEqual(receipt.historyPages,[2,2]);assert.equal(mock.calls.length,7);
 assert.equal(receipt.nativeAcceptance,false);assert.equal(receipt.anrFixed,false);
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

test('actual CLI writes GET evidence on acceptance and rejects a changed push before any GET',()=>{
 const root=mkdtempSync(join(tmpdir(),'android-first-creation-'));
 try{
  const temporary=join(root,'runner-temp');mkdirSync(temporary);
  const fixture=join(root,'fixture.json'),eventFile=join(root,'event.json'),loader=join(root,'mock-fetch.mjs'),calls=join(root,'calls.jsonl');
  writeFileSync(fixture,JSON.stringify({run:run(),workflow:workflow()}));
  writeFileSync(loader,`import {readFileSync,appendFileSync} from 'node:fs';\nconst fixture=JSON.parse(readFileSync(${JSON.stringify(fixture)},'utf8'));\nglobalThis.fetch=async(url,options)=>{appendFileSync(${JSON.stringify(calls)},JSON.stringify({url,method:options.method})+'\\n');const u=new URL(url);const data=u.pathname.endsWith('/actions/runs/700001')?fixture.run:u.pathname.endsWith('/actions/workflows/900001')?fixture.workflow:{total_count:1,workflow_runs:u.searchParams.get('page')==='1'?[fixture.run]:[]};return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});};\n`);
  const cli=fileURLToPath(new URL('../scripts/qa/android-first-creation-guard.mjs',import.meta.url));
  const env={...process.env,...context(),RUNNER_TEMP:temporary,GITHUB_EVENT_PATH:eventFile,GH_TOKEN:'synthetic-cli-token'};
  writeFileSync(eventFile,JSON.stringify(event()));
  const accepted=join(temporary,'accepted');
  const result=spawnSync(process.execPath,['--import',pathToFileURL(loader).href,cli,'--output',accepted],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(readFileSync(join(accepted,'first-creation-receipt.json'))).ready,true);
  const responses=JSON.parse(readFileSync(join(accepted,'github-get-responses.json')));
  assert.equal(responses.length,7);assert.ok(!JSON.stringify(responses).includes(env.GH_TOKEN));
  const recorded=readFileSync(calls,'utf8');assert.equal(recorded.trim().split('\n').length,7);
  writeFileSync(eventFile,JSON.stringify({...event(),forced:true}));
  const rejected=join(temporary,'rejected');
  const failure=spawnSync(process.execPath,['--import',pathToFileURL(loader).href,cli,'--output',rejected],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(failure.error,undefined);assert.equal(failure.status,1);assert.equal(JSON.parse(readFileSync(join(rejected,'first-creation-receipt.json'))).ready,false);
  assert.deepEqual(JSON.parse(readFileSync(join(rejected,'github-get-responses.json'))),[]);
  assert.equal(readFileSync(calls,'utf8'),recorded);assert.ok(existsSync(join(accepted,'first-creation-receipt.json')));
 }finally{assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});}
});

test('gate precedes tools/app/SDK/inputs while all measured Native and SDK blocks stay unchanged',()=>{
 const gate=next.indexOf('node scripts/qa/android-first-creation-guard.mjs');
 for(const marker of ['Checkout pinned original QA tools','Checkout exact original application source','sdkmanager" --install','actions/artifacts/13354600815/zip','Boot only the owned AVD'])assert.ok(gate>=0&&gate<next.indexOf(marker),marker);
 for(const [start,end] of [['      - name: Install actual Android emulator SDK','      - name: Record actual host'],['      - name: Prepare exact immutable original APK','      - name: Boot only the owned AVD'],['      - name: Boot only the owned AVD','      - uses: actions/upload-artifact@v6']])assert.equal(block(next,start,end),block(old,start,end));
 for(const forbidden of ['workflow_dispatch:','workflow_call:','pull_request:','schedule:','continue-on-error','--retry','run_number == 1','test "$GITHUB_RUN_NUMBER" = "1"'])assert.ok(!next.includes(forbidden),forbidden);
 assert.match(next,/permissions:\n  contents: read\n  actions: read/);assert.match(next,/runs-on: ubuntu-24.04\n    timeout-minutes: 45/);
 assert.equal(JSON.parse(read('../vercel.json')).git.deploymentEnabled[C.branch],false);
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
 for(const match of next.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)){
  const command=match[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n').replace(/\$\{\{[\s\S]*?\}\}/g,'QA_EXPRESSION');
  const result=spawnSync(bash,['-n'],{input:command,encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
 }
});
