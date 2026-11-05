import {existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const CONTRACT = Object.freeze({
  repository: 'yarinn12/sogrim-hashbon', repositoryId: 1247836328,
  branch: 'codex/android-abcb-emu36310-first-create-20261105',
  path: '.github/workflows/android-abcb-emu36310-first-create-qa.yml',
  name: 'Android abcb emulator36 first branch creation diagnostic',
  api: 'https://api.github.com', server: 'https://github.com',
  zero: '0'.repeat(40)
});
const requireValue=(value,message)=>{if(!value)throw new Error(message);};
const integer=value=>Number.isSafeInteger(value)&&value>0;
const decimal=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&integer(Number(value));
const hash=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value)&&value!==CONTRACT.zero;
const sameRepository=value=>value?.full_name===CONTRACT.repository&&value?.id===CONTRACT.repositoryId;
const ref=`refs/heads/${CONTRACT.branch}`;
const workflowRef=`${CONTRACT.repository}/${CONTRACT.path}@${ref}`;

export function validateCreationContext(context,event){
  const exact={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:CONTRACT.repository,
    GITHUB_REPOSITORY_ID:String(CONTRACT.repositoryId),GITHUB_REF:ref,
    GITHUB_REF_NAME:CONTRACT.branch,GITHUB_REF_TYPE:'branch',GITHUB_RUN_ATTEMPT:'1',
    GITHUB_WORKFLOW:CONTRACT.name,GITHUB_WORKFLOW_REF:workflowRef,
    GITHUB_API_URL:CONTRACT.api,GITHUB_SERVER_URL:CONTRACT.server};
  for(const [key,value] of Object.entries(exact))requireValue(context[key]===value,`Unexpected or missing ${key}`);
  requireValue(hash(context.GITHUB_SHA),'Invalid control SHA');
  requireValue(context.GITHUB_WORKFLOW_SHA===context.GITHUB_SHA,'Workflow/control source mismatch');
  requireValue(decimal(context.GITHUB_RUN_ID)&&decimal(context.GITHUB_RUN_NUMBER),'Invalid run identity/counter');
  requireValue(event?.ref===ref&&sameRepository(event?.repository),'Push ref/repository mismatch');
  requireValue(event.created===true&&event.before===CONTRACT.zero,'Require first branch creation');
  requireValue(event.forced===false&&event.deleted===false,'Forced/deleted or unknown push flags');
  requireValue(event.after===context.GITHUB_SHA&&event.head_commit?.id===context.GITHUB_SHA,'Push/control source mismatch');
  return {runId:Number(context.GITHUB_RUN_ID),counter:Number(context.GITHUB_RUN_NUMBER),sha:context.GITHUB_SHA};
}

function validateRun(run,identity,workflowId){
  requireValue(run?.id===identity.runId&&integer(run.workflow_id),'Unknown/current run identity differs');
  requireValue(workflowId===undefined||run.workflow_id===workflowId,'Workflow identity differs');
  requireValue(run.event==='push'&&run.head_branch===CONTRACT.branch&&run.path===CONTRACT.path,'Run event/branch/path differs');
  requireValue(sameRepository(run.repository)&&sameRepository(run.head_repository),'Run repository differs or is unknown');
  requireValue(run.head_sha===identity.sha&&run.head_commit?.id===identity.sha,'Run source differs or is unknown');
  requireValue(run.run_attempt===1&&run.previous_attempt_url===null,'Prior/unknown run attempt');
  requireValue(run.run_number===identity.counter,'Run counter metadata differs');
  requireValue(run.url===`${CONTRACT.api}/repos/${CONTRACT.repository}/actions/runs/${identity.runId}`,'Run URL differs');
  requireValue(run.workflow_url===`${CONTRACT.api}/repos/${CONTRACT.repository}/actions/workflows/${run.workflow_id}`,'Workflow URL differs');
  return run.workflow_id;
}

async function completeHistory(get,workflowId){
  let total;
  const rows=[],ids=new Set();
  for(let page=1;page<=101;page++){
    const data=await get(`/repos/${CONTRACT.repository}/actions/workflows/${workflowId}/runs?per_page=100&page=${page}`);
    requireValue(Number.isSafeInteger(data?.total_count)&&data.total_count>=0&&data.total_count<=10000,'Unknown/unbounded history total');
    requireValue(Array.isArray(data.workflow_runs)&&data.workflow_runs.length<=100,'Unknown history page');
    if(total===undefined)total=data.total_count;
    requireValue(data.total_count===total,'History changed during pagination');
    for(const run of data.workflow_runs){
      requireValue(integer(run?.id)&&!ids.has(run.id),'Duplicate/unknown history run');
      ids.add(run.id); rows.push(run);
    }
    requireValue(rows.length<=total,'History count exceeded total');
    if(data.workflow_runs.length===0){
      requireValue(rows.length===total,'History incomplete or current run missing');
      return {rows,total,pages:page};
    }
  }
  throw new Error('History pagination not exhausted');
}

function onlyCurrent(history,identity,workflowId){
  requireValue(history.total===1&&history.rows.length===1,'Prior/multiple/missing workflow runs');
  validateRun(history.rows[0],identity,workflowId);
}

export async function verifyFirstCreation(context,event,get){
  const identity=validateCreationContext(context,event);
  const runPath=`/repos/${CONTRACT.repository}/actions/runs/${identity.runId}`;
  const current=await get(runPath);
  const workflowId=validateRun(current,identity);
  const workflow=await get(`/repos/${CONTRACT.repository}/actions/workflows/${workflowId}`);
  requireValue(workflow?.id===workflowId&&workflow.path===CONTRACT.path&&workflow.name===CONTRACT.name&&workflow.state==='active','Workflow metadata differs or is unknown');
  requireValue(workflow.url===`${CONTRACT.api}/repos/${CONTRACT.repository}/actions/workflows/${workflowId}`,'Workflow metadata URL differs');
  // Unfiltered history is stricter than branch/push-only history: no other run is accepted.
  const first=await completeHistory(get,workflowId);
  onlyCurrent(first,identity,workflowId);
  validateRun(await get(runPath),identity,workflowId);
  const final=await completeHistory(get,workflowId);
  onlyCurrent(final,identity,workflowId);
  return {ready:true,repository:CONTRACT.repository,branch:CONTRACT.branch,workflowPath:CONTRACT.path,
    workflowId,runId:identity.runId,controlSha:identity.sha,runAttempt:1,
    runNumberCounterOnly:identity.counter,branchCreated:true,before:CONTRACT.zero,forced:false,deleted:false,
    historyReads:2,historyCounts:[first.total,final.total],historyPages:[first.pages,final.pages],
    priorRetainedRuns:0,diagnosticOnly:true,nativeAcceptance:false,anrFixed:false};
}

export function githubJsonGet(token,fetchImpl=fetch,onResponse=()=>{}){
  requireValue(typeof token==='string'&&token.length>0,'Read-only GitHub token required');
  return async path=>{
    requireValue(/^\/repos\/yarinn12\/sogrim-hashbon\/actions\/(runs\/[1-9][0-9]*|workflows\/[1-9][0-9]*(\/runs\?per_page=100&page=[1-9][0-9]*)?)$/.test(path),'Unexpected GitHub GET path');
    let response;
    try{response=await fetchImpl(CONTRACT.api+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'}});}
    catch{throw new Error('GitHub GET transport failed: '+path);}
    requireValue(response.status===200,'GitHub GET status differs from200: '+path);
    requireValue(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''),'GitHub GET content type unknown');
    requireValue(response.body,'GitHub GET body missing');
    const reader=response.body.getReader(),chunks=[];
    let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>2*1024*1024){await reader.cancel();throw new Error('GitHub GET body too large');}chunks.push(Buffer.from(value));}
    let data;
    try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('GitHub GET JSON invalid: '+path);}
    requireValue(data&&typeof data==='object'&&!Array.isArray(data),'GitHub GET object unknown');
    onResponse({path,status:response.status,data});
    return data;
  };
}

async function main(){
  requireValue(process.argv.length===4&&process.argv[2]==='--output','Require explicit --output directory');
  const temporary=realpathSync(process.env.RUNNER_TEMP||''),output=resolve(process.argv[3]);
  const within=relative(temporary,output);
  requireValue(isAbsolute(output)&&within&&within!=='..'&&!within.startsWith('..'+sep)&&!isAbsolute(within)&&!existsSync(output),'Require fresh output inside RUNNER_TEMP');
  requireValue(realpathSync(dirname(output))===temporary,'Require direct owned output parent');
  mkdirSync(output);
  const responses=[];
  let receipt;
  try{
    const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
    const get=githubJsonGet(process.env.GH_TOKEN,fetch,response=>responses.push(response));
    receipt=await verifyFirstCreation(process.env,event,get);
  }catch(error){receipt={ready:false,error:error.message,diagnosticOnly:true,nativeAcceptance:false,anrFixed:false};process.exitCode=1;}
  writeFileSync(join(output,'github-get-responses.json'),JSON.stringify(responses,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(output,'first-creation-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(receipt,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
