import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {spawn as realSpawn} from 'node:child_process';

const policySource=readFileSync(new URL('../scripts/qa/ios-signing/signed-audit-policy.mjs',import.meta.url),'utf8');
const bootstrapSource=readFileSync(new URL('../scripts/qa/ios-signing/audit-prekey-bootstrap.mjs',import.meta.url),'utf8');
const contextSource=readFileSync(new URL('../scripts/qa/ios-signing/audit-execution-context.mjs',import.meta.url),'utf8');
const guardSource=readFileSync(new URL('../scripts/qa/ios-signing/intake-source-guard.mjs',import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const policyModule=await import(url(policySource));
const contextModule=await import(url(contextSource));
const H=(b,a='sha256')=>createHash(a).update(b).digest('hex');
const J=x=>Buffer.from(JSON.stringify(x)+'\n');
const API='https://api.github.com/repos/yarinn12/sogrim-hashbon';
const REPO='yarinn12/sogrim-hashbon';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}); // Synthetic TEST key only.
const spki=publicKey.export({format:'der',type:'spki'});
let serial=0;
function fixture() {
  const a={...policyModule.SIGNED_POLICY_ANCHORS,tag:'checkpoint/ios194-owner-audit-synthetic',
    publicSpkiBase64:spki.toString('base64'),controllerBranch:'codex/synthetic-audit',
    workflowPath:'.github/workflows/synthetic-audit.yml',jobKey:'owner_audit',jobName:'Synthetic owner audit'};
  const p=JSON.parse(JSON.stringify(contextModule.AUDIT_EXECUTION_POLICY_TEMPLATE));
  Object.assign(p,{repositoryId:'700',repositoryOwnerId:'701',intakeRun:'101',signingRun:'100'});
  p.source={sha:'a'.repeat(40),tree:'b'.repeat(40),branch:'codex/synthetic-product'};
  Object.assign(p.build,{buildId:'00000000-0000-4000-8000-000000000194',ipaSha256:H(Buffer.from('synthetic IPA'))});
  Object.assign(p.toolkit,{sha:'c'.repeat(40),tree:'d'.repeat(40)});
  Object.assign(p.controller,{sha:'e'.repeat(40),tree:'f'.repeat(40),branch:a.controllerBranch,
    workflowPath:a.workflowPath,event:'push',jobKey:a.jobKey,jobName:a.jobName});
  const toolFiles={...p.toolkit.fileSha256,
    'scripts/qa/ios-signing/signed-audit-policy.mjs':policySource,
    'scripts/qa/ios-signing/audit-prekey-bootstrap.mjs':bootstrapSource,
    'scripts/qa/ios-signing/intake-source-guard.mjs':guardSource};
  for(const n of Object.keys(toolFiles))toolFiles[n]=Buffer.from(typeof toolFiles[n]==='string'&&toolFiles[n]!=='PENDING'?toolFiles[n]:'synthetic '+n);
  toolFiles['scripts/qa/ios-signing/audit-execution-context.mjs']=Buffer.from(contextSource);
  const controllerFiles={[a.workflowPath]:Buffer.from('synthetic reviewed workflow')};
  p.toolkit.fileSha256=Object.fromEntries(Object.entries(toolFiles).map(([n,b])=>[n,H(b)]));
  p.controller.fileSha256=Object.fromEntries(Object.entries(controllerFiles).map(([n,b])=>[n,H(b)]));
  const inputs={
    'successful-intake-receipt.json':J({scope:'OFFLINE_SUCCESSFUL_INTAKE_EVIDENCE_PREPARATION_ONLY',
      sourceSha:p.source.sha,sourceTree:p.source.tree,sourceBranch:p.source.branch,...p.build,
      intakeRun:p.intakeRun,signingRun:p.signingRun,ownerAvailabilityAccepted:false,databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false}),
    'source-metadata.json':J({app:{bundleId:p.build.bundleId},version:{number:'4.58',build:'194'}})};
  for(const n of ['source-commit.json','signing-tool-commit.json','signing-run.json','signing-jobs.json',
    'signing-artifact.json','signing-artifact.zip','intake-tool-commit.json','intake-run.json',
    'intake-jobs.json','intake-artifact.json','intake-evidence.zip'])inputs[n]=Buffer.from('synthetic original '+n);
  p.inputs.fileSha256=Object.fromEntries(Object.entries(inputs).map(([n,b])=>[n,H(b)]));
  const sourceRuns={qaRun:'401',windowsRun:'402',fontRun:'403',authRun:'404'};
  const f={a,p,sourceRuns,toolFiles,controllerFiles,inputs,calls:[],responses:{},clock:0};
  f.now=()=>new Date(Date.parse('2026-10-15T12:01:00.000Z')+f.clock++*10).toISOString();
  f.env={GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',
    GITHUB_REPOSITORY:REPO,GITHUB_REPOSITORY_ID:'700',GITHUB_REPOSITORY_OWNER_ID:'701',
    GITHUB_SHA:p.controller.sha,GITHUB_WORKFLOW_SHA:p.controller.sha,GITHUB_REF:'refs/heads/'+a.controllerBranch,
    GITHUB_REF_TYPE:'branch',GITHUB_WORKFLOW_REF:REPO+'/'+a.workflowPath+'@refs/heads/'+a.controllerBranch,
    GITHUB_EVENT_NAME:'push',GITHUB_RUN_ID:'8100',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_JOB:a.jobKey,
    GITHUB_WORKSPACE:'/synthetic/workspace'};
  f.fetchImpl=async(u,init)=>{
    f.calls.push({url:u,init});
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer synthetic-gh-token');
    assert.ok(!Object.hasOwn(init,'body'));
    assert.ok(init.signal instanceof AbortSignal);
    const raw=f.responses[u];assert.ok(raw,'Unplanned synthetic URL');
    const response=new Response(raw,{status:200,headers:{'Content-Type':'application/json'}});
    Object.defineProperty(response,'url',{value:u});return response;
  };
  repack(f);
  const repo={id:700,full_name:REPO};
  for(const name of ['controller','toolkit']) {
    const x=p[name];f.responses[API+'/git/commits/'+x.sha]=J({sha:x.sha,url:API+'/git/commits/'+x.sha,tree:{sha:x.tree,url:API+'/git/trees/'+x.tree}});
  }
  f.responses[API+'/actions/runs/8100']=J({id:8100,url:API+'/actions/runs/8100',
    repository:repo,head_repository:repo,head_sha:p.controller.sha,head_branch:a.controllerBranch,path:a.workflowPath,
    event:'push',run_attempt:1,run_number:1,status:'in_progress',conclusion:null,jobs_url:API+'/actions/runs/8100/jobs',
    created_at:'2026-10-15T12:00:00Z',updated_at:'2026-10-15T12:01:00Z'});
  f.responses[API+'/actions/runs/8100/attempts/1/jobs?per_page=100&page=1']=J({total_count:1,jobs:[{
    id:8123,url:API+'/actions/jobs/8123',run_id:8100,run_url:API+'/actions/runs/8100',head_sha:p.controller.sha,
    run_attempt:1,name:a.jobName,status:'in_progress',conclusion:null,started_at:'2026-10-15T12:00:30Z'}]});
  return f;
}
function repack(f,editOuter,editAnnotation) {
  const outer={schemaVersion:1,repository:REPO,tag:f.a.tag,scope:'INDEPENDENT_POST_INTAKE_GET_ONLY',
    appId:'6809952514',platform:'IOS',version:'4.58',build:'194',sourceRuns:f.sourceRuns,executionPolicyBase64:J(f.p).toString('base64')};
  editOuter?.(outer);
  const raw=J(outer),blobSha=H(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw]),'sha1');
  const signature=sign('sha256',policyModule.policySigningBytes(f.a.tag,raw),{key:privateKey,dsaEncoding:'ieee-p1363'});
  const annotation={schemaVersion:1,scope:'INDEPENDENT_POST_INTAKE_GET_ONLY',repository:REPO,tag:f.a.tag,
    algorithm:'ECDSA-P256-SHA256-P1363',keyFingerprint:H(spki),policySha256:H(raw),policyBlobSha:blobSha,
    controllerSha:f.p.controller.sha,toolkitSha:f.p.toolkit.sha,signatureBase64:signature.toString('base64')};
  editAnnotation?.(annotation);
  f.tagSha='9'.repeat(40);f.blobSha=blobSha;f.rawPolicy=raw;
  f.refUrl=API+'/git/ref/tags/'+f.a.tag;f.tagUrl=API+'/git/tags/'+f.tagSha;f.blobUrl=API+'/git/blobs/'+blobSha;
  f.responses[f.refUrl]=J({ref:'refs/tags/'+f.a.tag,url:API+'/git/refs/tags/'+f.a.tag,object:{type:'tag',sha:f.tagSha,url:f.tagUrl}});
  f.responses[f.tagUrl]=J({sha:f.tagSha,url:f.tagUrl,tag:f.a.tag,object:{type:'blob',sha:blobSha,url:f.blobUrl},message:J(annotation).toString()});
  f.responses[f.blobUrl]=J({sha:blobSha,url:f.blobUrl,encoding:'base64',size:raw.length,content:raw.toString('base64')});
}
const authenticate=f=>policyModule.authenticateSignedPolicy(f.a,'synthetic-gh-token',{fetchImpl:f.fetchImpl,now:f.now});
function editResponse(f,url,edit) {const x=JSON.parse(f.responses[url]);edit(x);f.responses[url]=J(x);}
function memoryFs(f) {
  const files=new Map();
  for(const [namespace,items] of [['audit-controller',f.controllerFiles],['audit-tools',f.toolFiles],['audit-inputs',f.inputs]])
    for(const [n,b] of Object.entries(items))files.set('/synthetic/workspace/'+namespace+'/'+n,b);
  const stats=path=>({dev:1,ino:[...files.keys()].indexOf(path)+1,size:files.get(path)?.length??0,mtimeMs:1,ctimeMs:1,
    isFile:()=>files.has(path),isSymbolicLink:()=>f.symlink===path});
  const handles=new Map();let fd=10;
  return {constants:{O_RDONLY:0,O_NOFOLLOW:1},
    realpathSync:path=>path,lstatSync:stats,openSync:path=>{assert.ok(files.has(path));handles.set(++fd,path);return fd;},
    closeSync:id=>handles.delete(id),readFileSync:id=>Buffer.from(files.get(handles.get(id))),fstatSync:id=>stats(handles.get(id)),
    execFileSync:(cmd,args,opt)=>{
      assert.equal(cmd,'git');const name=opt.cwd.endsWith('audit-controller')?'controller':'toolkit',p=f.p[name];
      const key=args.join(' ');
      if(key==='rev-parse --show-toplevel')return opt.cwd+'\n';
      if(key==='rev-parse HEAD')return p.sha+'\n';
      if(key==='rev-parse HEAD^{tree}')return p.tree+'\n';
      assert.equal(key,'status --porcelain --untracked-files=all');return f.dirty?'?? untracked.mjs\n':'';
    },spawn:realSpawn};
}
async function loadBootstrap(f) {
  const fs=memoryFs(f),slot='__syntheticAuditFs'+serial++;
  globalThis[slot]=fs;
  let code=bootstrapSource
    .replace(/import \{constants,[^\n]+from 'node:fs';/,()=> 'const {constants,realpathSync,lstatSync,openSync,closeSync,readFileSync,fstatSync}=globalThis['+JSON.stringify(slot)+'];')
    .replace("import {execFileSync, spawn} from 'node:child_process';",()=> 'const {execFileSync,spawn}=globalThis['+JSON.stringify(slot)+'];')
    .replace("'./signed-audit-policy.mjs'",()=>JSON.stringify(url(policySource)))
    .replace("'./audit-execution-context.mjs'",()=>JSON.stringify(url(contextSource)));
  code+='\nexport {captureRuntime,measureCheckouts,measureInputs,collectAuthenticatedContext,child,NODE_CI,PYTHON_INTAKE};';
  const module=await import(url(code)+'#'+serial++);
  delete globalThis[slot];return {module,fs};
}
test('PENDING anchors before network, runtime or key access',async()=>{
  let calls=0;const trap=new Proxy({}, {get(){calls++;throw Error('Unexpected dependency');}});
  await assert.rejects(()=>policyModule.authenticateSignedPolicy(policyModule.SIGNED_POLICY_ANCHORS,null,trap),/PENDING/);
  assert.equal(calls,0);
});
test('signed blob authenticates exact bytes with actual authenticated GET options',async()=>{
  const f=fixture(),r=await authenticate(f);
  assert.ok(r.reviewed.policyBytes.equals(J(f.p)));assert.equal(r.signatureProof.policyBlobSha,f.blobSha);
  assert.equal(r.signatureProof.tagObjectSha,f.tagSha);assert.deepEqual(r.sourceRuns,f.sourceRuns);
  assert.equal(f.calls.length,3);
  for(const c of Object.values(r.captures)) {
    assert.equal(c.method,'GET');assert.equal(c.redirect,'error');assert.ok(Buffer.isBuffer(c.bytes));
    assert.ok(!JSON.stringify({...c,bytes:''}).includes('synthetic-gh-token'));
  }
});
test('signature uses the exact agreed domain and fixed P1363 encoding',()=>{
  const raw=Buffer.from('original bytes'),tag='checkpoint/ios194-owner-audit-synthetic';
  assert.ok(policyModule.policySigningBytes(tag,raw).equals(Buffer.concat([
    Buffer.from('SOGRIM_OWNER_AUDIT_POLICY_V1\0'+REPO+'\0'+tag+'\0'),raw])));
});
test('real context verifier consumes client captures and measured-FS results',async()=>{
  const f=fixture(),{module}=await loadBootstrap(f),auth=await authenticate(f);
  const runtime=module.captureRuntime(f.env,f.now,f.a);
  const result=await module.collectAuthenticatedContext(auth,'synthetic-gh-token',runtime,{fetchImpl:f.fetchImpl,now:f.now});
  assert.equal(result.context.auditJob,'8123');assert.equal(result.context.auditJobKey,'owner_audit');
  assert.equal(result.context.appleKeysAuthorized,false);
  assert.equal(f.calls.length,7); // Ref/tag/blob + original commit/run/jobs reads.
});
function reject(name,edit) {
  test('reject '+name,async()=>{const f=fixture();edit(f);await assert.rejects(()=>authenticate(f));});
}
reject('foreign ref',f=>editResponse(f,f.refUrl,x=>{x.ref='refs/tags/foreign';}));
reject('foreign ref URL',f=>editResponse(f,f.refUrl,x=>{x.url='https://foreign.invalid';}));
reject('lightweight tag',f=>editResponse(f,f.refUrl,x=>{x.object.type='blob';}));
reject('nested tag',f=>editResponse(f,f.tagUrl,x=>{x.object.type='tag';}));
reject('foreign blob URL',f=>editResponse(f,f.tagUrl,x=>{x.object.url='https://foreign.invalid';}));
reject('tag name mismatch',f=>editResponse(f,f.tagUrl,x=>{x.tag='foreign';}));
reject('tag object SHA mismatch',f=>editResponse(f,f.tagUrl,x=>{x.sha='0'.repeat(40);}));
reject('blob size',f=>editResponse(f,f.blobUrl,x=>{x.size++;}));
reject('blob Git SHA',f=>editResponse(f,f.blobUrl,x=>{x.sha='0'.repeat(40);}));
reject('changed original policy bytes',f=>editResponse(f,f.blobUrl,x=>{x.content=Buffer.concat([f.rawPolicy,Buffer.from(' ')]).toString('base64');x.size++;}));
for(const [field,value] of Object.entries({algorithm:'ECDSA-P256-SHA256-DER',repository:'foreign/repo',tag:'foreign',
  keyFingerprint:'0'.repeat(64),policySha256:'0'.repeat(64),signatureBase64:Buffer.alloc(64).toString('base64'),
  policyBlobSha:'0'.repeat(40),controllerSha:'0'.repeat(40),toolkitSha:'0'.repeat(40)}))
  reject('tag annotation '+field,f=>editResponse(f,f.tagUrl,x=>{const m=JSON.parse(x.message);m[field]=value;x.message=J(m).toString();}));
reject('extra annotation field',f=>editResponse(f,f.tagUrl,x=>{const m=JSON.parse(x.message);m.accepted=true;x.message=J(m).toString();}));
reject('DER signature fallback',f=>editResponse(f,f.tagUrl,x=>{
  const m=JSON.parse(x.message);m.signatureBase64=sign('sha256',policyModule.policySigningBytes(f.a.tag,f.rawPolicy),privateKey).toString('base64');x.message=J(m).toString();}));
reject('wrong pinned public key',f=>{f.a.publicSpkiBase64=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'der'}).toString('base64');});
reject('wrong public key curve',f=>{f.a.publicSpkiBase64=generateKeyPairSync('ec',{namedCurve:'secp384r1'}).publicKey.export({type:'spki',format:'der'}).toString('base64');});
for(const [field,value] of Object.entries({repository:'foreign/repo',tag:'foreign',appId:'999',platform:'MAC_OS',version:'4.57',build:'193'}))
  reject('signed payload '+field,f=>repack(f,x=>{x[field]=value;}));
reject('duplicate CI run bindings',f=>repack(f,x=>{x.sourceRuns.windowsRun=x.sourceRuns.qaRun;}));
test('redirected and foreign actual HTTP responses are rejected',async()=>{
  for(const kind of ['redirected','url','status']) {
    const f=fixture();f.fetchImpl=async u=>{const r=new Response(f.responses[u],{status:kind==='status'?403:200});
      Object.defineProperty(r,'url',{value:kind==='url'?'https://foreign.invalid':u});
      if(kind==='redirected')Object.defineProperty(r,'redirected',{value:true});return r;};
    await assert.rejects(()=>authenticate(f));assert.equal(f.calls.length,0);
  }
});
test('shared guard fetch rejects body and POST before any request',async()=>{
  const f=fixture(),client=policyModule.createAuthenticatedGitHub('synthetic-gh-token',[f.refUrl],{fetchImpl:f.fetchImpl,now:f.now});
  for(const options of [{method:'POST',redirect:'error'},{method:'GET',redirect:'error',body:undefined}])
    await assert.rejects(()=>client.guardFetch(f.refUrl,options));
  assert.equal(f.calls.length,0);
});
test('runtime attempt, workflow source and repo rejected before any network',async()=>{
  for(const [key,value] of Object.entries({GITHUB_RUN_ATTEMPT:'2',GITHUB_RUN_NUMBER:'2',GITHUB_WORKFLOW_SHA:'0'.repeat(40),
    GITHUB_REPOSITORY:'foreign/repo',GITHUB_JOB:'8123'})) {
    const f=fixture(),{module}=await loadBootstrap(f);f.env[key]=value;
    assert.throws(()=>module.captureRuntime(f.env,f.now,f.a));assert.equal(f.calls.length,0);
  }
});
test('measured checkout rejects changed bytes',async()=>{
  const f=fixture(),{module,fs}=await loadBootstrap(f),runtime=module.captureRuntime(f.env,f.now,f.a);
  f.p.toolkit.fileSha256['scripts/qa/ios-signing/audit-prekey-bootstrap.mjs']='0'.repeat(64);
  assert.throws(()=>module.measureCheckouts(f.p,runtime,f.now));
});

test('public pre-key helper stays PENDING before option getters',async()=>{
  const f=fixture(),{module}=await loadBootstrap(f);let touched=0;
  const trap=new Proxy({}, {get(){touched++;throw Error('Unexpected options access');}});
  await assert.rejects(()=>module.runSignedAuditPreKey(policyModule.SIGNED_POLICY_ANCHORS,null,trap),/PENDING/);
  assert.equal(touched,0);
});
test('measured checkout rejects dirty state and symlink rather than accepting receipt flags',async()=>{
  for(const mode of ['dirty','symlink']) {
    const f=fixture(),{module}=await loadBootstrap(f),runtime=module.captureRuntime(f.env,f.now,f.a);
    if(mode==='dirty')f.dirty=true;
    else f.symlink='/synthetic/workspace/audit-controller/'+f.a.workflowPath;
    assert.throws(()=>module.measureCheckouts(f.p,runtime,f.now));
  }
});
async function loadPolicyMutation(source=policySource) {
  const newline=source.includes('\r\n')?'\r\n':'\n';
  const needle="assert.equal(verify('sha256', policySigningBytes(a.tag, raw),\n    {key: publicKey, dsaEncoding: 'ieee-p1363'}, signature), true, 'Root policy signature invalid');".replaceAll('\n',newline);
  assert.equal(source.split(needle).length-1,1);
  return import(url(source.replace(needle,()=> 'assert.equal(signature.length,64); // OLD projection omitted signature verification'))+'#old'+serial++);
}
test('identical signature regression fails OLD and passes FINAL',async()=>{
  const f=fixture();editResponse(f,f.tagUrl,x=>{const m=JSON.parse(x.message);m.signatureBase64=Buffer.alloc(64).toString('base64');x.message=J(m).toString();});
  const check=module=>assert.rejects(()=>module.authenticateSignedPolicy(f.a,'synthetic-gh-token',{fetchImpl:f.fetchImpl,now:f.now}));
  // OLD and FINAL use the same rejection assertion; OLD's assertion must fail.
  const lfSource=policySource.replaceAll('\r\n','\n');
  for(const source of [lfSource,lfSource.replaceAll('\n','\r\n')]) {
    const old=await loadPolicyMutation(source);
    await assert.rejects(()=>check(old),{code:'ERR_ASSERTION'});
    await check(await import(url(source)+'#final'+serial++));
  }
  await check(policyModule);
});
const qaRoles=['unit','cross-platform','cross-platform-shard-1','cross-platform-shard-2','two-client-sync',
  'unit-and-mobile','backup-runtime',...['android-mobile','iphone-webkit','ipad-webkit','iphone-large-text','reflow-200'].map(n=>'mobile ('+n+')'),
  'ios-native / native-parity','android-native / native-parity','mobile-iphone-large-text-shard-1',
  'mobile-iphone-large-text-shard-2','mobile-iphone-webkit-shard-1','mobile-iphone-webkit-shard-2'];
function ciFixture(f,missingRole) {
  const p={...f.p,...f.sourceRuns},r={};
  r[API+'/git/commits/'+p.source.sha]={sha:p.source.sha,tree:{sha:p.source.tree}};
  const paths=['qa.yml','qa-windows.yml','cross-engine-font-provenance-qa.yml','ios-auth-return-qa.yml'];
  Object.values(f.sourceRuns).forEach((id,i)=>{
    r[API+'/actions/runs/'+id]={id:Number(id),repository:{full_name:REPO},head_repository:{full_name:REPO},
      head_sha:p.source.sha,head_branch:p.source.branch,path:'.github/workflows/'+paths[i],event:'push',
      status:'completed',conclusion:'success',run_attempt:1,updated_at:'2026-10-15T11:00:00Z'};
    const names=i===0?qaRoles.filter(n=>n!==missingRole):[['windows-unit'],['linux-font-provenance'],['native']][i-1];
    const jobs=names.map((name,j)=>({id:1000+i*100+j,run_id:Number(id),head_sha:p.source.sha,name,status:'completed',conclusion:'success'}));
    r[API+'/actions/runs/'+id+'/attempts/1/jobs?per_page=100&page=1']={total_count:jobs.length,jobs};
  });return {p,r};
}
test('actual shared CI guard and authenticated client execute in sanitized child on synthetic API data',async()=>{
  const f=fixture(),{module}=await loadBootstrap(f),{p,r}=ciFixture(f);
  assert.equal(qaRoles.length,18);
  const guard=guardSource.replace(/export const RELEASE_SOURCE = '[^']+';/,()=> "export const RELEASE_SOURCE = '"+p.source.sha+"';")
    .replace(/export const RELEASE_TREE = '[^']+';/,()=> "export const RELEASE_TREE = '"+p.source.tree+"';")
    .replace(/export const SOURCE_BRANCH = '[^']+';/,()=> "export const SOURCE_BRANCH = '"+p.source.branch+"';");
  const prefix="const records="+JSON.stringify(r)+";globalThis.fetch=async(u,o)=>{if(o.method!=='GET'||o.redirect!=='error'||Object.hasOwn(o,'body')||o.headers.Authorization!=='Bearer synthetic-gh-token')throw Error('Transport mismatch');if(!records[u])throw Error('Unplanned URL');const response=new Response(JSON.stringify(records[u]));Object.defineProperty(response,'url',{value:u});return response;};\n";
  const result=await module.child(process.execPath,['--input-type=module','-e',prefix+module.NODE_CI],
    {policy:p,token:'synthetic-gh-token',guardUrl:url(guard),clientUrl:url(policySource)},
    {PATH:process.env.PATH??'',SOURCE_SHA:p.source.sha});
  assert.equal(result.ci.length,4);assert.equal(result.ci[0].jobs.length,18);assert.equal(result.captures.length,9);
  assert.ok(!JSON.stringify(result).includes('synthetic-gh-token'));
  const missing=ciFixture(f,'cross-platform-shard-2');
  const badPrefix=prefix.replace(JSON.stringify(r),()=>JSON.stringify(missing.r));
  await assert.rejects(()=>module.child(process.execPath,['--input-type=module','-e',badPrefix+module.NODE_CI],
    {policy:p,token:'synthetic-gh-token',guardUrl:url(guard),clientUrl:url(policySource)},
    {PATH:process.env.PATH??'',SOURCE_SHA:p.source.sha}));
});

test('ref replacement with internally consistent hashes cannot authorize unsigned replacement policy',async()=>{
  const f=fixture(),tag=JSON.parse(f.responses[f.tagUrl]),annotation=JSON.parse(tag.message);
  const outer=JSON.parse(f.rawPolicy);outer.sourceRuns.qaRun='999';
  const raw=J(outer),blobSha=H(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw]),'sha1'),blobUrl=API+'/git/blobs/'+blobSha;
  annotation.policySha256=H(raw);annotation.policyBlobSha=blobSha; // Deliberately keep OLD valid signature.
  tag.object={type:'blob',sha:blobSha,url:blobUrl};tag.message=J(annotation).toString();f.responses[f.tagUrl]=J(tag);
  f.responses[blobUrl]=J({sha:blobSha,url:blobUrl,encoding:'base64',size:raw.length,content:raw.toString('base64')});
  await assert.rejects(()=>authenticate(f),/signature invalid/);
});
test('signature from a different domain is rejected without algorithm negotiation',async()=>{
  const f=fixture();editResponse(f,f.tagUrl,x=>{
    const m=JSON.parse(x.message);m.signatureBase64=sign('sha256',Buffer.concat([Buffer.from('WRONG_DOMAIN\0'),f.rawPolicy]),
      {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');x.message=J(m).toString();
  });await assert.rejects(()=>authenticate(f),/signature invalid/);
});
test('GitHub failure has no fallback or retry',async()=>{
  const f=fixture();let attempts=0;
  f.fetchImpl=async u=>{attempts++;const r=new Response('{}',{status:503});Object.defineProperty(r,'url',{value:u});return r;};
  await assert.rejects(()=>authenticate(f));assert.equal(attempts,1);
});
