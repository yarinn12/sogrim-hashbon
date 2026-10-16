import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir,homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const L=readFileSync(new URL('../scripts/qa/ios-signing/owner-audit-launcher.mjs',import.meta.url),'utf8');
const C=readFileSync(new URL('../scripts/qa/ios-signing/controller-owner-audit.mjs',import.meta.url),'utf8');
const A=readFileSync(new URL('../scripts/lib/app-store-release.mjs',import.meta.url),'utf8');
const K=readFileSync(new URL('../scripts/qa/ios-signing/collect-owner-snapshot.mjs',import.meta.url),'utf8');
const Q=readFileSync(new URL('../scripts/qa/ios-signing/owner-post-intake-audit-template.test.mjs',import.meta.url),'utf8');
const F=readFileSync(new URL('./auditSignedPolicyBootstrap.test.mjs',import.meta.url),'utf8');
const ROOT_FILES=new URL('../scripts/qa/ios-signing/',import.meta.url);
const text=name=>readFileSync(new URL(name,ROOT_FILES),'utf8');
const H=b=>createHash('sha256').update(b).digest('hex'),J=x=>Buffer.from(JSON.stringify(x)+'\n');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const ROOT='scripts/qa/ios-signing/',API='https://api.github.com/repos/yarinn12/sogrim-hashbon',REPO='yarinn12/sogrim-hashbon';
const P=text('signed-audit-policy.mjs'),B=text('audit-prekey-bootstrap.mjs'),X=text('audit-execution-context.mjs'),G=text('intake-source-guard.mjs');
let helper=F.slice(0,F.indexOf("test('PENDING anchors before"));
for(const [name,value] of Object.entries({policySource:P,bootstrapSource:B,contextSource:X,guardSource:G,appleReadRetrySource:text('apple-read-retry.mjs')}))
  helper=helper.replace(new RegExp('const '+name+'=readFileSync[^\\n]+;'),()=> 'const '+name+'='+JSON.stringify(value)+';');
helper+='\nexport {fixture,repack,loadBootstrap,policyModule};';
const HF=await import(url(helper));
let serial=0;
async function memoryLauncher(f) {
  const {module:bootstrap}=await HF.loadBootstrap(f);
  const slot='__ownerLauncherTest'+serial++;
  const files={};
  for(const [n,b] of Object.entries(f.toolFiles))files['/synthetic/workspace/audit-tools/'+n]=b;
  const canon=p=>p.replaceAll('\\','/');
  const fs={realpathSync:p=>p,lstatSync:p=>({dev:1,ino:1,size:files[canon(p)].length,mtimeMs:1,ctimeMs:1,isFile:()=>true,isSymbolicLink:()=>false}),
    readFileSync:p=>Buffer.from(files[canon(p)])};
  const modules={'scripts/lib/app-store-release.mjs':url(A),'scripts/qa/ios-signing/collect-owner-snapshot.mjs':url(K)};
  globalThis[slot]={fs,modules};
  let source=L.replace("import {realpathSync,lstatSync,readFileSync} from 'node:fs';",()=>
      'const {realpathSync,lstatSync,readFileSync}=globalThis['+JSON.stringify(slot)+'].fs;')
    .replace("'./audit-prekey-bootstrap.mjs'",()=>JSON.stringify(url(
      B.replace("'./signed-audit-policy.mjs'",()=>JSON.stringify(url(P))).replace("'./audit-execution-context.mjs'",()=>JSON.stringify(url(X))))))
    .replace("'./signed-audit-policy.mjs'",()=>JSON.stringify(url(P)))
    .replace('return import(pathToFileURL(full).href);',()=>'return import(globalThis['+JSON.stringify(slot)+'].modules[relative]);');
  source+='\nexport {collectValidatedAudit,scopedCollectorClient};';
  const module=await import(url(source)+'#'+serial++);
  return {module,bootstrap,cleanup:()=>delete globalThis[slot]};
}
async function prekeyFixture() {
  const f=HF.fixture();
  f.toolFiles['scripts/lib/app-store-release.mjs']=Buffer.from(A);
  f.toolFiles['scripts/qa/ios-signing/owner-audit-launcher.mjs']=Buffer.from(L);
  f.toolFiles['scripts/qa/ios-signing/collect-owner-snapshot.mjs']=Buffer.from(K);
  for(const [n,b] of Object.entries(f.toolFiles))f.p.toolkit.fileSha256[n]=H(b);
  HF.repack(f);
  const {module:boot}=await HF.loadBootstrap(f);
  const auth=await HF.policyModule.authenticateSignedPolicy(f.a,'synthetic-gh-token',{fetchImpl:f.fetchImpl,now:f.now});
  const runtime=boot.captureRuntime(f.env,f.now,f.a);
  const m=await boot.collectAuthenticatedContext(auth,'synthetic-gh-token',runtime,{fetchImpl:f.fetchImpl,now:f.now});
  return {f,prekey:{scope:'SIGNED_AUDIT_PREKEY_PREPARATION_ONLY',...m,signatureProof:auth.signatureProof,
    validatedPolicy:auth.policy,reviewedPolicyBytes:auth.reviewed.policyBytes,toolkitRoot:'/synthetic/workspace/audit-tools',
    auditApiCaptures:m.api,bootstrapCaptures:auth.captures,gates:{successfulIntake:{receiptSha256:f.p.inputs.fileSha256['successful-intake-receipt.json']},
      sourceCi:{ci:Object.values(f.sourceRuns).map(id=>({id}))}},
    appleKeysAuthorized:false,ownerAvailabilityAccepted:false,databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false}};
}
function appleFixture(buildId) {
  const start=Q.indexOf('function collectorTransport('),end=Q.indexOf('\nfor(const assigned',start);
  assert.ok(start>=0&&end>start);
  // Existing complex route fixture; real client/collector are imported below, not a fabricated snapshot.
  return import(url("import assert from 'node:assert/strict';\n"+
    "const A='6809952514',B='com.sogrimhashbon.app',T="+JSON.stringify(buildId)+
    ",G='11111111-1111-4111-8111-111111111111',OLD='22222222-2222-4222-8222-222222222222',S='77777777-7777-4777-8777-777777777777';\n"+
    "const opts={method:'GET',redirect:'error'};\n"+Q.slice(start,end)+'\nexport {collectorTransport};'));
}
test('actual failed bootstrap cannot read credentials, call Apple or accept a passed marker',async()=>{
  const f=HF.fixture(),m=await memoryLauncher(f);let credentials=0,apple=0;
  try{
    await assert.rejects(()=>m.module.runOwnerAuditLauncher(HF.policyModule.SIGNED_POLICY_ANCHORS,{
      githubToken:'synthetic-gh-token',passed:true,snapshot:{},
      credentialGetter:()=>{credentials++;throw Error('Unexpected');},appleFetch:()=>{apple++;throw Error('Unexpected');}}),/PENDING/);
    f.env.GITHUB_RUN_ATTEMPT='2';
    await assert.rejects(()=>m.module.runOwnerAuditLauncher(f.a,{githubToken:'synthetic-gh-token',env:f.env,
      githubFetch:f.fetchImpl,credentialGetter:()=>{credentials++;throw Error('Unexpected');},
      appleFetch:()=>{apple++;throw Error('Unexpected');}}));
    assert.equal(credentials,0);assert.equal(apple,0);
  }finally{m.cleanup();}
});
test('private post-gate unit uses existing client+collector and preserves adapter original-byte contract',async()=>{
  const {f,prekey}=await prekeyFixture(),m=await memoryLauncher(f);
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),fixture=(await appleFixture(f.p.build.buildId)).collectorTransport(false);
  let credentials=0;
  const fetchImpl=async(u,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.ok(!Object.hasOwn(options,'body'));assert.match(options.headers.Authorization,/^Bearer /);
    const data=await fixture.fetchImpl(u,{method:'GET',redirect:'error'});
    return new Response(JSON.stringify(data),{status:200});
  };
  try {
    const result=await m.module.collectValidatedAudit(prekey,()=>{
      credentials++;return {issuerId:'00000000-0000-4000-8000-000000000001',keyId:'TSTKEY0001',
        privateKey:privateKey.export({type:'pkcs8',format:'pem'})};
    },fetchImpl);
    assert.equal(credentials,1);assert.ok(fixture.calls.length>20);
    const provenance=JSON.parse(result.provenance),snapshot=JSON.parse(result.snapshot);
    assert.equal(provenance.runtime.auditRun,'8100');assert.equal(provenance.runtime.auditJob,'8123');
    assert.equal(provenance.runtime.auditJobKey,'owner_audit');assert.equal(provenance.buildId,f.p.build.buildId);
    assert.equal(snapshot.groups.find(g=>!g.isInternalGroup).hasAccessToAllBuilds,null);
    assert.equal(snapshot.notes[0].whatsNew,' Synthetic note \n');
    assert.equal(provenance.distributionAllowed,false);
    const map={controllerCommit:'audit-controller-commit.json',toolkitCommit:'audit-tool-commit.json',
      run:'audit-context-run.json',jobs:'audit-context-jobs.json'};
    for(const [key,name] of Object.entries(map)){
      assert.ok(result.files[name].equals(prekey.auditApiCaptures[key].bytes));
      assert.equal(H(result.files[name]),prekey.context.apiSha256[key]);
    }
    assert.deepEqual(JSON.parse(result.files['audit-execution-context.json']),prekey.context);
  }finally{m.cleanup();}
});
test('scoped wrapper denies POST, body and global routes before actual Apple client fetch',async()=>{
  const f=HF.fixture(),m=await memoryLauncher(f),{createAppStoreClient}=await import(url(A));
  let calls=0;
  const api=m.module.scopedCollectorClient(createAppStoreClient,{},async()=>{calls++;throw Error('Unexpected');},f.p.build.buildId);
  try{
    for(const [path,opt] of [['/v1/apps',{method:'GET',redirect:'error'}],
      ['/v1/builds/'+f.p.build.buildId,{method:'POST',redirect:'error'}],
      ['/v1/apps/6809952514?fields[apps]=bundleId',{method:'GET',redirect:'error',body:{}}]])
      await assert.rejects(()=>api(path,opt));
    assert.equal(calls,0);
  }finally{m.cleanup();}
});

test('controller CLI remains PENDING without importing toolkit or reading runtime',async()=>{
  const cli=await import(url(C));
  await assert.rejects(()=>cli.main(),/PENDING/);
});

test('actual Python original-intake fixture produces bound verifier source and exact receipt bytes',()=>{
  const origin=originalIntakeFixture();
  assert.equal(Object.keys(origin.files).length,12);
  assert.equal(JSON.parse(Buffer.from(origin.receipt,'base64')).buildId,origin.pins.buildId);
  assert.ok(origin.boundSource.includes('PINS = _freeze('));
});

// FULL_JOIN_TESTS_BEGIN: uses owned real temporary Git repositories and actual Node/Python children.
function projectWindowsFixturePaths(source) {
  if(process.platform!=='win32')return source;
  // TEST COPY ONLY: native filesystem/Git/regular-file/open/children remain actual.
  // Serialize drive paths narrowly as /C:/... for the unchanged POSIX context schema.
  const replacements=[
    ["const stamp = () => new Date().toISOString();","const stamp = () => new Date().toISOString();\n"+
      "function wirePath(p){const v=p.replaceAll('\\\\','/');return /^[A-Za-z]:\\//.test(v)?'/'+v[0].toUpperCase()+v.slice(1):v;}\n"+
      "function nativePath(p){return /^\\/[A-Za-z]:\\//.test(p)?p.slice(1).replaceAll('/','\\\\'):p;}\n"],
    ["gitTopLevel:git(root,['rev-parse','--show-toplevel'])","gitTopLevel:wirePath(git(root,['rev-parse','--show-toplevel']))"],
    ["const workspace=env.GITHUB_WORKSPACE;","const nativeWorkspace=env.GITHUB_WORKSPACE,workspace=wirePath(nativeWorkspace);"],
    ["workspaceRealPath:realpathSync(workspace)","workspaceRealPath:wirePath(realpathSync(nativeWorkspace))"],
    ["const expected=p[name],root=posix.join(runtime.workspaceRealPath,expected.namespace);\n    assert.equal(realpathSync(root),root);\n    const before=gitIdentity(root);",
      "const expected=p[name],root=posix.join(runtime.workspaceRealPath,expected.namespace),nativeRoot=nativePath(root);\n"+
      "    assert.equal(wirePath(realpathSync(nativeRoot)),root);\n    const before=gitIdentity(nativeRoot);"],
    ["const full=posix.join(root,path),bytes=regularBytes(full,full);","const full=posix.join(root,path),native=nativePath(full),bytes=regularBytes(native,native);"],
    ["assert.deepEqual(gitIdentity(root),before,'Checkout changed during measurement');","assert.deepEqual(gitIdentity(nativeRoot),before,'Checkout changed during measurement');"],
    ["const root=posix.join(runtime.workspaceRealPath,'audit-inputs');assert.equal(realpathSync(root),root);",
      "const root=posix.join(runtime.workspaceRealPath,'audit-inputs');assert.equal(wirePath(realpathSync(nativePath(root))),root);"],
    ["const full=posix.join(root,name),raw=regularBytes(full,full);","const full=nativePath(posix.join(root,name)),raw=regularBytes(full,full);"],
    ["const root=measured.checkouts.toolkit.realPath;","const root=nativePath(measured.checkouts.toolkit.realPath);"],
    ["toolkitRoot:after.toolkit.realPath,","toolkitRoot:nativePath(after.toolkit.realPath),"]
  ];
  // LF projection is explicit for this test copy; original runtime/source on disk is untouched.
  let result=source.replace(/\r\n/g,'\n');
  for(const [old,value] of replacements){
    assert.equal(result.split(old).length-1,1,'Windows fixture path projection anchor');
    result=result.replace(old,()=>value);
  }
  return result;
}

const PYTHON=process.env.SOGRIM_TEST_PYTHON || (process.platform==='win32'?
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
const safeEnvironment=()=>({PATH:process.env.PATH??'',...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{})});
function originalIntakeFixture() {
  const program=[
    'import runpy,sys,json,base64',
    'n=runpy.run_path(sys.argv[1])',
    'files,pins,members=n["fixture"]()',
    'group={"id":"4646e3de-7401-4e70-ac32-9a00072e1376","name":"Existing synthetic owner","isInternalGroup":True,"hasAccessToAllBuilds":False,"publicLinkEnabled":False,"builds":[]}',
    'store={"id":"77777777-7777-4777-8777-777777777777","version":"4.55","state":"READY_FOR_SALE","releaseType":"AFTER_APPROVAL"}',
    'for name in ("intake-preflight.json","intake-postflight.json"):',
    ' x=json.loads(members[name]);x["groups"]=[group];x["appStoreVersions"]=[store];members[name]=n["jbytes"](x)',
    'n["refresh_zip"](files,pins,members)',
    'for prefix in ("signing","intake"):',
    ' name=prefix+"-run.json";x=json.loads(files[name])',
    ' for field in ("repository","head_repository"):x[field].update(id=700,owner={"id":701})',
    ' files[name]=n["jbytes"](x)',
    'n["refresh_inputs"](files,pins)',
    'r=n["load_verifier"](pins).verify_successful_intake(files,now_utc=n["NOW"])',
    'source=n["SOURCE_TEXT"];a=source.index("# BEGIN IMMUTABLE BINDINGS");b=source.index("# END IMMUTABLE BINDINGS")+len("# END IMMUTABLE BINDINGS")',
    'bound=source[:a]+"PINS = _freeze("+repr(pins)+")\\n"+source[b:]',
    'print(json.dumps({"files":{k:base64.b64encode(v).decode() for k,v in files.items()},"pins":pins,"boundSource":bound,"receipt":base64.b64encode(r["receiptBytes"]).decode()}))'
  ].join('\n');
  const result=spawnSync(PYTHON,['-B','-c',program,fileURLToPath(new URL('test_successful_intake.py',ROOT_FILES))],
    {encoding:'utf8',env:{...safeEnvironment(),PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'},maxBuffer:32*1024*1024,windowsHide:true});
  assert.equal(result.status,0,'Synthetic original-intake fixture generation failed: '+result.stderr);
  return JSON.parse(result.stdout);
}
const gitEnv=()=>({...safeEnvironment(),GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.autocrlf',
  GIT_CONFIG_VALUE_0:'false',GIT_CONFIG_KEY_1:'commit.gpgSign',GIT_CONFIG_VALUE_1:'false'});
function gitAt(root,args) {
  const r=spawnSync('git',['-c','user.name=Synthetic Audit Test','-c','user.email=synthetic@example.invalid',...args],
    {cwd:root,env:gitEnv(),encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  assert.equal(r.status,0,'Temporary Git operation failed: '+r.stderr);return r.stdout.trim();
}
function write(root,path,bytes) {mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),bytes);}
function commit(root,branch) {
  gitAt(root,['init','-q']);gitAt(root,['checkout','-q','-b',branch]);gitAt(root,['add','.']);
  gitAt(root,['commit','-q','-m','Synthetic offline audit fixture']);
  return {sha:gitAt(root,['rev-parse','HEAD']),tree:gitAt(root,['rev-parse','HEAD^{tree}'])};
}
function sourceRecords(source,runs,missing) {
  const r={[API+'/git/commits/'+source.sha]:{sha:source.sha,tree:{sha:source.tree}}};
  const paths=['qa.yml','qa-windows.yml','cross-engine-font-provenance-qa.yml','ios-auth-return-qa.yml'];
  const roles=['unit','cross-platform','cross-platform-shard-1','cross-platform-shard-2','two-client-sync',
    'unit-and-mobile','backup-runtime',...['android-mobile','iphone-webkit','ipad-webkit','iphone-large-text','reflow-200'].map(n=>'mobile ('+n+')'),
    'ios-native / native-parity','android-native / native-parity','mobile-iphone-large-text-shard-1',
    'mobile-iphone-large-text-shard-2','mobile-iphone-webkit-shard-1','mobile-iphone-webkit-shard-2'];
  Object.values(runs).forEach((id,i)=>{
    r[API+'/actions/runs/'+id]={id:Number(id),repository:{full_name:REPO},head_repository:{full_name:REPO},
      head_sha:source.sha,head_branch:source.branch,path:'.github/workflows/'+paths[i],event:'push',status:'completed',
      conclusion:'success',run_attempt:1,updated_at:'2026-10-15T10:00:00Z'};
    const names=i===0?roles.filter(n=>n!==missing):[['windows-unit'],['linux-font-provenance'],['native']][i-1];
    const jobs=names.map((name,j)=>({id:1000+i*100+j,run_id:Number(id),head_sha:source.sha,name,status:'completed',conclusion:'success'}));
    r[API+'/actions/runs/'+id+'/attempts/1/jobs?per_page=100&page=1']={total_count:jobs.length,jobs};
  });return r;
}
function syntheticFetchProgram(records) {
  return 'const __records='+JSON.stringify(records)+';globalThis.fetch=async(u,o)=>{'+
    'if(o.method!=="GET"||o.redirect!=="error"||Object.hasOwn(o,"body")||o.headers.Authorization!=="Bearer synthetic-gh-token")throw Error("Synthetic transport mismatch");'+
    'const data=__records[String(u)];if(!data)throw Error("Unplanned synthetic URL");const response=new Response(JSON.stringify(data));'+
    'Object.defineProperty(response,"url",{value:String(u)});return response;};\n';
}
function ownedCleanup(root) {
  const absolute=realpathSync(root),parent=realpathSync(tmpdir());
  assert.equal(dirname(absolute),parent);assert.ok(basename(absolute).startsWith('sogrim-owner-audit-'));
  rmSync(absolute,{recursive:true,force:true});
}
function fullFixture(mode) {
  const root=mkdtempSync(join(realpathSync(tmpdir()),'sogrim-owner-audit-'));
  try {
    const workspace=join(root,'workspace'),tools=join(workspace,'audit-tools'),controller=join(workspace,'audit-controller');
    mkdirSync(tools,{recursive:true});mkdirSync(controller,{recursive:true});
    const origin=originalIntakeFixture(),pins=origin.pins,source={sha:pins.sourceSha,tree:pins.sourceTree,branch:pins.sourceBranch};
    const sourceRuns={qaRun:pins.qaRun,windowsRun:pins.windowsRun,fontRun:pins.fontRun,authRun:pins.authRun};
    const ci=sourceRecords(source,sourceRuns,mode==='missing-role'?'cross-platform-shard-2':null);
    let guard=G.replace(/export const RELEASE_SOURCE = '[^']+';/,()=> "export const RELEASE_SOURCE = '"+source.sha+"';")
      .replace(/export const RELEASE_TREE = '[^']+';/,()=> "export const RELEASE_TREE = '"+source.tree+"';")
      .replace(/export const SOURCE_BRANCH = '[^']+';/,()=> "export const SOURCE_BRANCH = '"+source.branch+"';");
    const marker='const NODE_CI = String.raw'+String.fromCharCode(96);
    assert.equal(B.split(marker).length-1,1);
    // TEST COPY ONLY: only the child's underlying fetch is synthetic. Original shared guard/client execute.
    const boundBootstrap=projectWindowsFixturePaths(B).replace(marker,()=>marker+'\n'+syntheticFetchProgram(ci));
    const modules={
      [ROOT+'signed-audit-policy.mjs']:P,[ROOT+'audit-prekey-bootstrap.mjs']:boundBootstrap,
      [ROOT+'audit-execution-context.mjs']:X,[ROOT+'intake-source-guard.mjs']:guard,
      [ROOT+'apple-read-retry.mjs']:text('apple-read-retry.mjs'),
      [ROOT+'verify_successful_intake.py']:origin.boundSource,[ROOT+'owner-audit-launcher.mjs']:L,
      ['scripts/lib/app-store-release.mjs']:A,[ROOT+'collect-owner-snapshot.mjs']:K,
      [ROOT+'owner-post-intake-audit-template.mjs']:text('owner-post-intake-audit-template.mjs')
    };
    for(const [path,value] of Object.entries(modules))write(tools,path,Buffer.from(value));
    const toolkit=commit(tools,'codex/synthetic-tools');
    const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const der=publicKey.export({type:'spki',format:'der'});
    const anchors={repository:REPO,tag:'checkpoint/ios194-owner-audit-fulljoin',publicSpkiBase64:der.toString('base64'),
      controllerBranch:'codex/synthetic-audit',workflowPath:'.github/workflows/synthetic-audit.yml',
      jobKey:'owner_audit',jobName:'Synthetic full owner audit'};
    const initial={...toolkit,fileSha256:Object.fromEntries(Object.keys(modules).filter(n=>[
      ROOT+'owner-audit-launcher.mjs',ROOT+'audit-prekey-bootstrap.mjs',ROOT+'signed-audit-policy.mjs',ROOT+'audit-execution-context.mjs'
    ].includes(n)).map(n=>[n,H(Buffer.from(modules[n]))]))};
    let cli=C.replace(/export const CONTROLLER_PUBLIC_ANCHORS=Object.freeze\(\{[\s\S]*?\}\);/,
      ()=> 'export const CONTROLLER_PUBLIC_ANCHORS=Object.freeze('+JSON.stringify(anchors)+');');
    const begin=cli.indexOf('export const INITIAL_TOOLKIT='),end=cli.indexOf('const hash=',begin);
    assert.ok(begin>=0&&end>begin);
    cli=cli.slice(0,begin)+'export const INITIAL_TOOLKIT=Object.freeze('+JSON.stringify(initial)+');\n'+cli.slice(end);
    cli=cli.replace('mkdirSync,writeFileSync}','mkdirSync,writeFileSync,appendFileSync}');
    const call='runOwnerAuditLauncher(CONTROLLER_PUBLIC_ANCHORS,{githubToken:process.env.GH_TOKEN})';
    assert.equal(cli.split(call).length-1,1);
    cli=cli.replace(call,()=> 'runOwnerAuditLauncher(CONTROLLER_PUBLIC_ANCHORS,{githubToken:process.env.GH_TOKEN,pythonExecutable:'+
      JSON.stringify(PYTHON)+',credentialGetter:()=>{appendFileSync(process.env.SYNTHETIC_CREDENTIAL_COUNTER,"read\\n");'+
      'return {issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,privateKey:process.env.APPSTORE_API_PRIVATE_KEY};}})');
    const entry=ROOT+'controller-owner-audit.mjs',workflow=Buffer.from('name: synthetic offline fixture\n');
    write(controller,entry,cli);write(controller,anchors.workflowPath,workflow);
    const controllerIdentity=commit(controller,anchors.controllerBranch);
    const policy=contextModuleTemplate();
    policy.repositoryId='700';policy.repositoryOwnerId='701';policy.source=source;
    policy.build={appId:'6809952514',bundleId:'com.sogrimhashbon.app',platform:'IOS',version:'4.58',build:'194',
      buildId:pins.buildId,ipaSha256:pins.ipaSha256};
    policy.toolkit={...toolkit,namespace:'audit-tools',fileSha256:Object.fromEntries(Object.entries(modules).map(([n,v])=>[n,H(Buffer.from(v))]))};
    policy.controller={...controllerIdentity,namespace:'audit-controller',branch:anchors.controllerBranch,workflowPath:anchors.workflowPath,
      event:'push',jobKey:anchors.jobKey,jobName:anchors.jobName,fileSha256:{[entry]:H(Buffer.from(cli)),[anchors.workflowPath]:H(workflow)}};
    policy.intakeRun=pins.intakeRun;policy.signingRun=pins.signingRun;
    const inputs=Object.fromEntries(Object.entries(origin.files).map(([n,v])=>[n,Buffer.from(v,'base64')]));
    inputs['successful-intake-receipt.json']=Buffer.from(origin.receipt,'base64');
    policy.inputs={fileSha256:Object.fromEntries(Object.entries(inputs).map(([n,b])=>[n,H(b)]))};
    for(const [n,b] of Object.entries(inputs))write(workspace,'audit-inputs/'+n,b);
    if(mode==='changed-input')writeFileSync(join(workspace,'audit-inputs/source-metadata.json'),Buffer.concat([inputs['source-metadata.json'],Buffer.from(' ')]));
    const raw=J({schemaVersion:1,repository:REPO,tag:anchors.tag,scope:'INDEPENDENT_POST_INTAKE_GET_ONLY',appId:'6809952514',
      platform:'IOS',version:'4.58',build:'194',sourceRuns,executionPolicyBase64:J(policy).toString('base64')});
    const blobSha=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex'),tagSha='9'.repeat(40);
    const signature=sign('sha256',HF.policyModule.policySigningBytes(anchors.tag,raw),{key:privateKey,dsaEncoding:'ieee-p1363'});
    const annotation={schemaVersion:1,scope:'INDEPENDENT_POST_INTAKE_GET_ONLY',repository:REPO,tag:anchors.tag,
      algorithm:'ECDSA-P256-SHA256-P1363',keyFingerprint:H(der),policySha256:H(raw),policyBlobSha:blobSha,
      controllerSha:controllerIdentity.sha,toolkitSha:toolkit.sha,signatureBase64:signature.toString('base64')};
    const records={};
    records[API+'/git/ref/tags/'+anchors.tag]={ref:'refs/tags/'+anchors.tag,url:API+'/git/refs/tags/'+anchors.tag,object:{type:'tag',sha:tagSha,url:API+'/git/tags/'+tagSha}};
    records[API+'/git/tags/'+tagSha]={sha:tagSha,url:API+'/git/tags/'+tagSha,tag:anchors.tag,object:{type:'blob',sha:blobSha,url:API+'/git/blobs/'+blobSha},message:J(annotation).toString()};
    records[API+'/git/blobs/'+blobSha]={sha:blobSha,url:API+'/git/blobs/'+blobSha,encoding:'base64',size:raw.length,content:raw.toString('base64')};
    for(const p of [toolkit,controllerIdentity])records[API+'/git/commits/'+p.sha]={sha:p.sha,url:API+'/git/commits/'+p.sha,tree:{sha:p.tree,url:API+'/git/trees/'+p.tree}};
    const repo={id:700,full_name:REPO,owner:{id:701}};
    records[API+'/actions/runs/8100']={id:8100,url:API+'/actions/runs/8100',repository:repo,head_repository:repo,
      head_sha:controllerIdentity.sha,head_branch:anchors.controllerBranch,path:anchors.workflowPath,event:'push',
      run_attempt:1,run_number:1,status:'in_progress',conclusion:null,jobs_url:API+'/actions/runs/8100/jobs',
      created_at:'2026-10-15T10:29:00.000Z',updated_at:'2026-10-15T10:29:05.000Z'};
    records[API+'/actions/runs/8100/attempts/1/jobs?per_page=100&page=1']={total_count:1,jobs:[{id:8123,url:API+'/actions/jobs/8123',
      run_id:8100,run_url:API+'/actions/runs/8100',head_sha:controllerIdentity.sha,run_attempt:1,name:anchors.jobName,
      status:'in_progress',conclusion:null,started_at:'2026-10-15T10:29:10.000Z'}]};
    const credentialCounter=join(root,'credential-reads'),appleCounter=join(root,'apple-requests');
    const notes=JSON.parse(inputs['source-metadata.json']).version.releaseNotes.trim();
    const transport=join(root,'synthetic-transport.mjs');
    const clock='const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:["2026-10-15T10:30:00.000Z"]));}static now(){return NativeDate.parse("2026-10-15T10:30:00.000Z");}};\n';
    const apple=syntheticAppleProgram(pins.buildId,notes,appleCounter);
    writeFileSync(transport,clock+syntheticFetchProgram(records).replace('globalThis.fetch=async(u,o)=>','const githubFetch=async(u,o)=>')+
      apple+'\nglobalThis.fetch=(u,o)=>String(u).startsWith("https://api.github.com/")?githubFetch(u,o):appleFetch(u,o);\n');
    const {privateKey:appleKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const env={...gitEnv(),GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',GITHUB_REPOSITORY:REPO,
      GITHUB_REPOSITORY_ID:'700',GITHUB_REPOSITORY_OWNER_ID:'701',GITHUB_SHA:controllerIdentity.sha,GITHUB_WORKFLOW_SHA:controllerIdentity.sha,
      GITHUB_REF:'refs/heads/'+anchors.controllerBranch,GITHUB_REF_TYPE:'branch',GITHUB_WORKFLOW_REF:REPO+'/'+anchors.workflowPath+'@refs/heads/'+anchors.controllerBranch,
      GITHUB_EVENT_NAME:'push',GITHUB_RUN_ID:'8100',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'1',GITHUB_JOB:anchors.jobKey,GITHUB_WORKSPACE:workspace,
      GH_TOKEN:'synthetic-gh-token',SYNTHETIC_CREDENTIAL_COUNTER:credentialCounter,
      APPSTORE_ISSUER_ID:'00000000-0000-4000-8000-000000000001',APPSTORE_API_KEY_ID:'TSTKEY0001',
      APPSTORE_API_PRIVATE_KEY:appleKey.export({type:'pkcs8',format:'pem'})};
    const result=spawnSync(process.execPath,['--import',pathToFileURL(transport).href,join(controller,entry)],
      {env,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:120000});
    return {root,workspace,result,credentialCounter,appleCounter,policy,records};
  }catch(error){ownedCleanup(root);throw error;}
}
function contextModuleTemplate() {
  const start=X.indexOf('export const AUDIT_EXECUTION_POLICY_TEMPLATE = freeze('),end=X.indexOf('\nconst REPO',start);
  assert.ok(start>=0&&end>start);
  // Use the public helper fixture's existing canonical shape; no execution/acceptance callback.
  return JSON.parse(JSON.stringify(HF.fixture().p));
}
function syntheticAppleProgram(build,notes,counter) {
  return "import {appendFileSync} from 'node:fs';\nconst appleBuild="+JSON.stringify(build)+",notes="+JSON.stringify(notes)+
    ",counter="+JSON.stringify(counter)+";const row=(type,id,attributes)=>({type,id,...(attributes?{attributes}:{})});"+
    "const group=row('betaGroups','4646e3de-7401-4e70-ac32-9a00072e1376',{name:'Existing synthetic owner',isInternalGroup:true,hasAccessToAllBuilds:false,publicLinkEnabled:false});"+
    "const collection=data=>({data,links:{next:null},meta:{paging:{total:data.length,limit:200}}});"+
    "const appleFetch=async(u,o)=>{if(o.method!=='GET'||o.redirect!=='error'||Object.hasOwn(o,'body')||!o.headers.Authorization.startsWith('Bearer '))throw Error('Apple scope mismatch');"+
    "appendFileSync(counter,JSON.stringify({url:String(u),method:o.method})+'\\n');const p=new URL(u).pathname;let r;"+
    "if(p==='/v1/apps/6809952514'||/^\\/v1\\/builds\\/[^/]+\\/app$/.test(p))r={data:row('apps','6809952514',{bundleId:'com.sogrimhashbon.app'})};"+
    "else if(p==='/v1/builds/'+appleBuild)r={data:row('builds',appleBuild,{version:'194',processingState:'VALID',expired:false,usesNonExemptEncryption:false})};"+
    "else if(p.endsWith('/preReleaseVersion'))r={data:row('preReleaseVersions','synthetic-pre',{version:'4.58',platform:'IOS'})};"+
    "else if(p.endsWith('/buildBetaDetail'))r={data:row('buildBetaDetails','synthetic-beta',{internalBuildState:'READY_FOR_BETA_TESTING',externalBuildState:'READY_FOR_BETA_SUBMISSION'})};"+
    "else if(p.endsWith('/betaBuildLocalizations'))r=collection([row('betaBuildLocalizations','synthetic-he',{locale:'he',whatsNew:notes})]);"+
    "else if(p==='/v1/apps/6809952514/betaGroups')r=collection([group]);"+
    "else if(p==='/v1/betaGroups')r=collection([]);"+
    "else if(p.endsWith('/relationships/app'))r={data:row('apps','6809952514')};"+
    "else if(p==='/v1/betaGroups/'+group.id)r={data:group};"+
    "else if(p.endsWith('/relationships/builds'))r=collection([]);"+
    "else if(p.endsWith('/relationships/betaTesters'))r=collection([row('betaTesters','5d2040f0-3af9-4d98-a188-fd6eeb5547db')]);"+
    "else if(p.endsWith('/relationships/individualTesters'))r=collection([]);"+
    "else if(p.endsWith('/relationships/appStoreVersion'))r={data:null};"+
    "else if(p==='/v1/apps/6809952514/appStoreVersions')r=collection([row('appStoreVersions','77777777-7777-4777-8777-777777777777',{platform:'IOS',versionString:'4.55',appStoreState:'READY_FOR_SALE',releaseType:'AFTER_APPROVAL'})]);"+
    "else if(/^\\/v1\\/appStoreVersions\\/[^/]+\\/build$/.test(p))r={data:row('builds','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{version:'191'})};"+
    "else throw Error('Unplanned Apple route');return new Response(JSON.stringify(r),{status:200});};";
}
for(const mode of ['success','missing-role','changed-input'])test('real Git + Node + Python + CLI full join: '+mode,()=>{
  const f=fullFixture(mode);
  try {
    if(mode==='success') {
      assert.equal(f.result.status,0,'Synthetic CLI failed: '+f.result.stderr);
      assert.equal(readFileSync(f.credentialCounter,'utf8'),'read\n');
      assert.ok(readFileSync(f.appleCounter,'utf8').trim().split('\n').length>10);
      const out=join(f.workspace,'audit-output');
      for(const n of ['owner-snapshot.json','owner-snapshot-evidence.json','audit-execution-context.json',
        'audit-controller-commit.json','audit-tool-commit.json','audit-context-run.json','audit-context-jobs.json'])assert.ok(existsSync(join(out,n)),n);
      const ctx=JSON.parse(readFileSync(join(out,'audit-execution-context.json')));
      assert.equal(ctx.auditRun,'8100');assert.equal(ctx.auditJob,'8123');assert.equal(ctx.auditJobKey,'owner_audit');
      for(const [k,n] of Object.entries({controllerCommit:'audit-controller-commit.json',toolkitCommit:'audit-tool-commit.json',
        run:'audit-context-run.json',jobs:'audit-context-jobs.json'}))assert.equal(H(readFileSync(join(out,n))),ctx.apiSha256[k]);
      const snap=JSON.parse(readFileSync(join(out,'owner-snapshot.json')));
      assert.equal(snap.build.id,f.policy.build.buildId);assert.equal(snap.groups[0].hasAccessToAllBuilds,false);
      assert.equal(JSON.parse(readFileSync(join(out,'audit-provenance.json'))).distributionAllowed,false);
    } else {
      assert.notEqual(f.result.status,0);assert.equal(existsSync(f.credentialCounter),false);
      assert.equal(existsSync(f.appleCounter),false);assert.equal(existsSync(join(f.workspace,'audit-output')),false);
    }
  }finally{ownedCleanup(f.root);}
});
