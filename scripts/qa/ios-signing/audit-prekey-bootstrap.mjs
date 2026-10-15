import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants, realpathSync, lstatSync, openSync, closeSync, readFileSync, fstatSync} from 'node:fs';
import {execFileSync, spawn} from 'node:child_process';
import {join, posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {authenticateSignedPolicy, createAuthenticatedGitHub, requireSignedPolicyAnchors} from './signed-audit-policy.mjs';
import {verifyAuditExecution} from './audit-execution-context.mjs';

const API = 'https://api.github.com/repos/yarinn12/sogrim-hashbon';
const ROOT = 'scripts/qa/ios-signing/';
const POLICY_CLIENT = ROOT + 'signed-audit-policy.mjs';
const BOOTSTRAP = ROOT + 'audit-prekey-bootstrap.mjs';
const SOURCE_GUARD = ROOT + 'intake-source-guard.mjs';
const ORIGINAL_INPUTS = ['source-commit.json','source-metadata.json','signing-tool-commit.json',
  'signing-run.json','signing-jobs.json','signing-artifact.json','signing-artifact.zip',
  'intake-tool-commit.json','intake-run.json','intake-jobs.json','intake-artifact.json','intake-evidence.zip'];
const hash = b => createHash('sha256').update(b).digest('hex');
const git = (root, args) => execFileSync('git', args, {cwd:root,encoding:'utf8',windowsHide:true}).trim();
const stamp = () => new Date().toISOString();
function regularBytes(path, expected) {
  const before = lstatSync(path); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(realpathSync(path), expected, 'Unexpected real path');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const a = fstatSync(fd); assert.ok(a.isFile()); assert.equal(a.dev,before.dev); assert.equal(a.ino,before.ino);
    assert.ok(a.size>0 && a.size<=(path.endsWith('.zip')?256:16)*1024*1024,'Bounded regular file required');
    const bytes = readFileSync(fd), b = fstatSync(fd), after = lstatSync(path);
    for (const field of ['dev','ino','size','mtimeMs','ctimeMs']) {
      assert.equal(a[field],b[field]); assert.equal(b[field],after[field]);
    }
    assert.equal(realpathSync(path),expected); return bytes;
  } finally { closeSync(fd); }
}
function gitIdentity(root) {
  return {gitTopLevel:git(root,['rev-parse','--show-toplevel']),headSha:git(root,['rev-parse','HEAD']),
    headTree:git(root,['rev-parse','HEAD^{tree}']),statusPorcelain:git(root,['status','--porcelain','--untracked-files=all'])};
}
function captureRuntime(env, now, anchors) {
  const names = {server_url:'GITHUB_SERVER_URL',api_url:'GITHUB_API_URL',repository:'GITHUB_REPOSITORY',
    repository_id:'GITHUB_REPOSITORY_ID',repository_owner_id:'GITHUB_REPOSITORY_OWNER_ID',sha:'GITHUB_SHA',
    ref:'GITHUB_REF',ref_type:'GITHUB_REF_TYPE',workflow_ref:'GITHUB_WORKFLOW_REF',workflow_sha:'GITHUB_WORKFLOW_SHA',
    event_name:'GITHUB_EVENT_NAME',run_id:'GITHUB_RUN_ID',run_attempt:'GITHUB_RUN_ATTEMPT',run_number:'GITHUB_RUN_NUMBER',job:'GITHUB_JOB'};
  const github = Object.fromEntries(Object.entries(names).map(([k,v])=>[k,env[v]]));
  assert.equal(github.server_url,'https://github.com');assert.equal(github.api_url,'https://api.github.com');
  assert.equal(github.repository,anchors.repository);assert.equal(github.event_name,'push');
  assert.match(github.sha??'',/^[a-f0-9]{40}$/);assert.equal(github.workflow_sha,github.sha);
  assert.equal(github.ref,'refs/heads/'+anchors.controllerBranch);assert.equal(github.ref_type,'branch');
  assert.equal(github.workflow_ref,anchors.repository+'/'+anchors.workflowPath+'@'+github.ref);
  assert.equal(github.job,anchors.jobKey);assert.equal(github.run_attempt,'1');assert.equal(github.run_number,'1');
  assert.match(github.run_id??'',/^[1-9][0-9]*$/);
  const workspace=env.GITHUB_WORKSPACE;
  assert.ok(typeof workspace==='string'&&workspace.startsWith('/')&&posix.normalize(workspace)===workspace);
  return {github,workspace,workspaceRealPath:realpathSync(workspace),startedAt:now(),checkedAt:null};
}
function measureCheckouts(p,runtime,now) {
  const result={};
  for(const name of ['controller','toolkit']) {
    const expected=p[name],root=posix.join(runtime.workspaceRealPath,expected.namespace);
    assert.equal(realpathSync(root),root);
    const before=gitIdentity(root);
    assert.equal(before.gitTopLevel,root); assert.equal(before.headSha,expected.sha);
    assert.equal(before.headTree,expected.tree); assert.equal(before.statusPorcelain,'');
    const files={};
    for(const [path,digest] of Object.entries(expected.fileSha256)) {
      assert.ok(path&&!path.startsWith('/')&&!path.includes('\\')&&posix.normalize(path)===path
        &&path.split('/').every(s=>s&&s!=='.'&&s!=='..'));
      const full=posix.join(root,path),bytes=regularBytes(full,full);
      assert.equal(hash(bytes),digest,'Reviewed file bytes changed');
      files[path]={bytes,realPath:full,regularFile:true};
    }
    assert.deepEqual(gitIdentity(root),before,'Checkout changed during measurement');
    result[name]={namespace:expected.namespace,realPath:root,...before,observedAt:now(),files};
  }
  for(const path of [POLICY_CLIENT,BOOTSTRAP,SOURCE_GUARD])
    assert.ok(Object.hasOwn(result.toolkit.files,path),'Missing bootstrap dependency pin');
  return result;
}
function measureInputs(p,runtime) {
  const root=posix.join(runtime.workspaceRealPath,'audit-inputs');assert.equal(realpathSync(root),root);
  const files={};
  for(const [name,digest] of Object.entries(p.inputs.fileSha256)) {
    assert.match(name,/^[a-z0-9][a-z0-9.-]*\.(json|zip)$/);
    const full=posix.join(root,name),raw=regularBytes(full,full);assert.equal(hash(raw),digest);files[name]=raw;
  }
  for(const name of [...ORIGINAL_INPUTS,'successful-intake-receipt.json'])
    assert.ok(Object.hasOwn(files,name),'Missing original successful-intake input');
  return files;
}
async function collectAuthenticatedContext(auth,token,runtime,{fetchImpl,now}) {
  const p=auth.policy;
  const urls={controllerCommit:API+'/git/commits/'+p.controller.sha,toolkitCommit:API+'/git/commits/'+p.toolkit.sha,
    run:API+'/actions/runs/'+runtime.github.run_id,
    jobs:API+'/actions/runs/'+runtime.github.run_id+'/attempts/1/jobs?per_page=100&page=1'};
  const client=createAuthenticatedGitHub(token,Object.values(urls),{fetchImpl,now}),api={};
  for(const [name,url] of Object.entries(urls)) api[name]=await client.read(url);
  const checkouts=measureCheckouts(p,runtime,now),inputs=measureInputs(p,runtime);
  runtime.checkedAt=now();
  const context=verifyAuditExecution(auth.reviewed,runtime,{api,checkouts,inputs});
  return {context,api,checkouts,inputs};
}
function child(executable,args,payload,env) {
  return new Promise((resolve,reject)=>{
    const proc=spawn(executable,args,{stdio:['pipe','pipe','pipe'],env,windowsHide:true});
    const chunks=[];let size=0,errorSize=0,done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{proc.kill();finish(Error('Bound verifier child deadline'));},60_000);
    proc.on('error',()=>finish(Error('Bound verifier child could not start')));
    proc.stdout.on('data',b=>{size+=b.length;if(size>32*1024*1024){proc.kill();finish(Error('Bound verifier output budget'));}else chunks.push(b);});
    proc.stderr.on('data',b=>{errorSize+=b.length;if(errorSize>1024*1024){proc.kill();finish(Error('Bound verifier diagnostic budget'));}});
    proc.on('close',code=>{
      if(code!==0)return finish(Error('Bound verifier failed; no Apple credentials loaded'));
      try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(Error('Invalid bound verifier output'));}
    });
    proc.stdin.on('error',()=>finish(Error('Bound verifier input failed')));
    proc.stdin.end(JSON.stringify(payload)); // Tokens never enter argv, output or inherited environment.
  });
}
const NODE_CI = String.raw`
import assert from 'node:assert/strict';
let text='';for await(const b of process.stdin)text+=b;
const {policy:p,token,guardUrl,clientUrl}=JSON.parse(text);
const guard=await import(guardUrl),{createAuthenticatedGitHub}=await import(clientUrl);
assert.equal(guard.RELEASE_SOURCE,p.source.sha);assert.equal(guard.RELEASE_TREE,p.source.tree);
assert.equal(guard.SOURCE_BRANCH,p.source.branch);
const runs=[p.qaRun,p.windowsRun,p.fontRun,p.authRun];
const base='https://api.github.com/repos/yarinn12/sogrim-hashbon';
const urls=[base+'/git/commits/'+p.source.sha,...runs.map(id=>base+'/actions/runs/'+id)];
for(const id of runs)for(let page=1;page<=20;page++)urls.push(base+'/actions/runs/'+id+'/attempts/1/jobs?per_page=100&page='+page);
const client=createAuthenticatedGitHub(token,urls);
const env={SOURCE_QA_RUN:runs[0],SOURCE_WINDOWS_QA_RUN:runs[1],SOURCE_FONT_QA_RUN:runs[2],SOURCE_AUTH_QA_RUN:runs[3]};
await guard.verifyCommit(client.guardFetch,token,p.source.tree);
const ci=await guard.verifyRuns(client.guardFetch,token,env);
console.log(JSON.stringify({ci,captures:client.captures().map(c=>({...c,bytes:c.bytes.toString('base64')}))}));
`;
const PYTHON_INTAKE = String.raw`
import sys,json,base64,runpy,hashlib
p=json.load(sys.stdin)
module=runpy.run_path(p["verifierPath"])
files={name:base64.b64decode(value,validate=True) for name,value in p["files"].items()}
result=module["verify_successful_intake"](files,now_utc=p["now"])
print(json.dumps({"receiptBase64":base64.b64encode(result["receiptBytes"]).decode("ascii"),"receiptSha256":result["receiptSha256"]}))
`;
async function boundLiveGates(p, measured, token, now, pythonExecutable) {
  for(const key of ['qaRun','windowsRun','fontRun','authRun'])assert.match(p[key]??'',/^[1-9][0-9]*$/);
  const root=measured.checkouts.toolkit.realPath;
  // Only PATH and the signed source identity reach the subprocess; Apple env and GH token do not.
  const safeEnv={PATH:process.env.PATH??'',SOURCE_SHA:p.source.sha,PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'};
  const ci=await child(process.execPath,['--input-type=module','-e',NODE_CI],{
    policy:p,token,guardUrl:pathToFileURL(join(root,SOURCE_GUARD)).href,
    clientUrl:pathToFileURL(join(root,POLICY_CLIENT)).href},safeEnv);
  assert.ok(Array.isArray(ci.ci)&&ci.ci.length===4&&Array.isArray(ci.captures)&&ci.captures.length>0);
  const expectedRuns=new Set([p.qaRun,p.windowsRun,p.fontRun,p.authRun]);
  assert.deepEqual(new Set(ci.ci.map(r=>r.id)),expectedRuns);
  for(const r of ci.ci){assert.equal(r.source,p.source.sha);assert.equal(r.attempt,1);assert.equal(r.conclusion,'success');}
  const result=await child(pythonExecutable,['-B','-c',PYTHON_INTAKE],{
    verifierPath:join(root,ROOT+'verify_successful_intake.py'),now:now(),
    files:Object.fromEntries(ORIGINAL_INPUTS.map(n=>[n,measured.inputs[n].toString('base64')]))},safeEnv);
  const receipt=Buffer.from(result.receiptBase64,'base64');
  assert.equal(hash(receipt),result.receiptSha256);
  assert.ok(receipt.equals(measured.inputs['successful-intake-receipt.json']),'Successful-intake result differs from signed input');
  return {sourceCi:ci,successfulIntake:{receiptSha256:result.receiptSha256}};
}
// Future pre-key wiring only. Existing runOwnerReadOnlyAudit remains PENDING and BLOCKED.
// No callback can assert that source CI or intake passed: the original bound modules execute.
export async function runSignedAuditPreKey(anchors,githubToken,options) {
  requireSignedPolicyAnchors(anchors);
  const {env=process.env,fetchImpl=globalThis.fetch,now=stamp,pythonExecutable='python3'}=options??{};
  const runtime=captureRuntime(env,now,anchors);
  const auth=await authenticateSignedPolicy(anchors,githubToken,{fetchImpl,now});
  const measured=await collectAuthenticatedContext(auth,githubToken,runtime,{fetchImpl,now});
  const gates=await boundLiveGates({...auth.policy,...auth.sourceRuns},measured,githubToken,now,pythonExecutable);
  // Re-measure after subprocesses; no stale pre-gate checkout/input snapshot is reused.
  const after=measureCheckouts(auth.policy,runtime,now),inputs=measureInputs(auth.policy,runtime);
  for(const n of Object.keys(inputs))assert.ok(inputs[n].equals(measured.inputs[n]));
  runtime.checkedAt=now();
  const context=verifyAuditExecution(auth.reviewed,runtime,{api:measured.api,checkouts:after,inputs});
  return {scope:'SIGNED_AUDIT_PREKEY_PREPARATION_ONLY',context,signatureProof:auth.signatureProof,
    validatedPolicy:auth.policy,reviewedPolicyBytes:Buffer.from(auth.reviewed.policyBytes),toolkitRoot:after.toolkit.realPath,
    bootstrapCaptures:auth.captures,auditApiCaptures:measured.api,gates,
    appleKeysAuthorized:false,ownerAvailabilityAccepted:false,databaseAccepted:false,
    publicReleaseAccepted:false,distributionAllowed:false};
}
