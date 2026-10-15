import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL('./audit-execution-context.mjs', import.meta.url), 'utf8');
const hash = b => createHash('sha256').update(b).digest('hex');
const bytes = x => Buffer.from(JSON.stringify(x) + '\n');
let serial = 0;
async function load(old = false) {
  let code = SOURCE;
  if (old) {
    const needle = 'assert.equal(g.workflow_sha, p.controller.sha);';
    assert.equal(code.split(needle).length - 1, 1);
    code = code.replace(needle, '/* OLD control omitted independent workflow source check. */');
  }
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64') + '#' + serial++);
}
const BASE = await load();
const API = 'https://api.github.com/repos/yarinn12/sogrim-hashbon';
const repo = {id: 700, full_name: 'yarinn12/sogrim-hashbon'};
// Every identity, file and receipt below is SYNTHETIC; no real run/Build ID is asserted.
function fixture() {
  const p = JSON.parse(JSON.stringify(BASE.AUDIT_EXECUTION_POLICY_TEMPLATE));
  Object.assign(p, {repositoryId: '700', repositoryOwnerId: '701', intakeRun: '101', signingRun: '100'});
  p.source = {sha: 'a'.repeat(40), tree: 'b'.repeat(40), branch: 'codex/synthetic-product'};
  Object.assign(p.build, {buildId: '00000000-0000-4000-8000-000000000194', ipaSha256: hash(Buffer.from('synthetic IPA'))});
  Object.assign(p.toolkit, {sha: 'c'.repeat(40), tree: 'd'.repeat(40)});
  Object.assign(p.controller, {sha: 'e'.repeat(40), tree: 'f'.repeat(40), branch: 'codex/synthetic-audit',
    workflowPath: '.github/workflows/synthetic-audit.yml', event: 'push',
    jobKey: 'owner_audit', jobName: 'Synthetic owner audit'});
  const trusted = {github: {server_url: 'https://github.com', api_url: 'https://api.github.com',
    repository: p.repository, repository_id: '700', repository_owner_id: '701',
    sha: p.controller.sha, workflow_sha: p.controller.sha,
    ref: 'refs/heads/' + p.controller.branch, ref_type: 'branch',
    workflow_ref: p.repository + '/' + p.controller.workflowPath + '@refs/heads/' + p.controller.branch,
    event_name: 'push', run_id: '8100', run_attempt: '1', run_number: '1', job: 'owner_audit'},
    workspace: '/Users/runner/work/synthetic/synthetic',
    workspaceRealPath: '/Users/runner/work/synthetic/synthetic',
    startedAt: '2026-10-15T12:01:00.000Z', checkedAt: '2026-10-15T12:02:00.000Z'};
  const makeCapture = (url, value) => ({url, method: 'GET', redirect: 'error',
    startedAt: '2026-10-15T12:01:10.000Z', completedAt: '2026-10-15T12:01:11.000Z', bytes: bytes(value)});
  const commit = t => ({sha: t.sha, url: API + '/git/commits/' + t.sha,
    tree: {sha: t.tree, url: API + '/git/trees/' + t.tree}});
  const run = {id: 8100, url: API + '/actions/runs/8100', repository: repo, head_repository: {...repo},
    head_sha: p.controller.sha, head_branch: p.controller.branch, path: p.controller.workflowPath,
    event: 'push', run_attempt: 1, run_number: 1, status: 'in_progress', conclusion: null,
    jobs_url: API + '/actions/runs/8100/jobs', created_at: '2026-10-15T12:00:00Z',
    updated_at: '2026-10-15T12:01:00Z'};
  const job = {id: 8123, url: API + '/actions/jobs/8123', run_id: 8100,
    run_url: API + '/actions/runs/8100', head_sha: p.controller.sha, run_attempt: 1,
    name: p.controller.jobName, status: 'in_progress', conclusion: null, started_at: '2026-10-15T12:00:30Z'};
  const evidence = {api: {
    controllerCommit: makeCapture(API + '/git/commits/' + p.controller.sha, commit(p.controller)),
    toolkitCommit: makeCapture(API + '/git/commits/' + p.toolkit.sha, commit(p.toolkit)),
    run: makeCapture(API + '/actions/runs/8100', run),
    jobs: makeCapture(API + '/actions/runs/8100/attempts/1/jobs?per_page=100&page=1', {total_count: 1, jobs: [job]})
  }, checkouts: {}, inputs: {}};
  for (const name of ['controller', 'toolkit']) {
    const t = p[name], root = trusted.workspaceRealPath + '/' + t.namespace;
    const paths = name === 'toolkit' ? Object.keys(t.fileSha256) : [t.workflowPath];
    const files = Object.fromEntries(paths.map(path => [path, {
      bytes: Buffer.from(path.endsWith('audit-execution-context.mjs') ? SOURCE : 'synthetic file: ' + path),
      realPath: root + '/' + path, regularFile: true
    }]));
    t.fileSha256 = Object.fromEntries(paths.map(path => [path, hash(files[path].bytes)]));
    evidence.checkouts[name] = {namespace: t.namespace, realPath: root, gitTopLevel: root,
      headSha: t.sha, headTree: t.tree, statusPorcelain: '', observedAt: '2026-10-15T12:01:20.000Z', files};
  }
  evidence.inputs = {
    'successful-intake-receipt.json': bytes({scope: 'OFFLINE_SUCCESSFUL_INTAKE_EVIDENCE_PREPARATION_ONLY',
      sourceSha: p.source.sha, sourceTree: p.source.tree, sourceBranch: p.source.branch, ...p.build,
      intakeRun: p.intakeRun, signingRun: p.signingRun, ownerAvailabilityAccepted: false,
      databaseAccepted: false, publicReleaseAccepted: false, distributionAllowed: false}),
    'source-metadata.json': bytes({app: {bundleId: p.build.bundleId}, version: {number: '4.58', build: '194'}})
  };
  p.inputs.fileSha256 = Object.fromEntries(Object.entries(evidence.inputs).map(([n,b]) => [n,hash(b)]));
  return {p, trusted, evidence};
}
function reviewed(p) { const policyBytes = bytes(p); return {policyBytes, policySha256: hash(policyBytes)}; }
function editApi(f, name, edit) {
  const value = JSON.parse(f.evidence.api[name].bytes); edit(value); f.evidence.api[name].bytes = bytes(value);
}
function run(f, module = BASE) { return module.verifyAuditExecution(reviewed(f.p), f.trusted, f.evidence); }
test('PENDING policy precedes runtime and evidence access', () => {
  let touched = 0;
  const trap = new Proxy({}, {get() { touched++; throw Error('Unexpected dependency access'); }});
  assert.throws(() => BASE.verifyAuditExecution(reviewed(BASE.AUDIT_EXECUTION_POLICY_TEMPLATE), trap, trap), /PENDING/);
  assert.equal(touched, 0);
});
test('happy path resolves numeric job from API and never treats job key as ID', () => {
  const f = fixture(), output = run(f);
  assert.equal(output.auditRun, '8100'); assert.equal(output.auditJob, '8123');
  assert.equal(output.auditJobKey, 'owner_audit'); assert.equal(output.auditJobName, 'Synthetic owner audit');
  assert.equal(output.auditToolSha, f.p.toolkit.sha); assert.equal(output.controllerSha, f.p.controller.sha);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.inputSha256));
  for (const k of ['appleKeysAuthorized', 'ownerAvailabilityAccepted', 'databaseAccepted', 'publicReleaseAccepted', 'distributionAllowed'])
    assert.equal(output[k], false);
  assert.equal(output.transportAttestation, 'NOT_PROVIDED_BY_PURE_VERIFIER');
});
test('runtime IDs can be resolved after launch without changing reviewed policy', () => {
  const f = fixture(), before = reviewed(f.p).policySha256;
  f.trusted.github.run_id = '9100';
  editApi(f, 'run', r => Object.assign(r, {id: 9100, url: API+'/actions/runs/9100', jobs_url: API+'/actions/runs/9100/jobs'}));
  editApi(f, 'jobs', r => Object.assign(r.jobs[0], {id: 9123, run_id: 9100,
    url: API+'/actions/jobs/9123', run_url: API+'/actions/runs/9100'}));
  f.evidence.api.run.url = API+'/actions/runs/9100';
  f.evidence.api.jobs.url = API+'/actions/runs/9100/attempts/1/jobs?per_page=100&page=1';
  assert.equal(run(f).auditJob, '9123'); assert.equal(reviewed(f.p).policySha256, before);
});
test('independent workflow SHA mismatch is rejected (OLD/FINAL regression)', async () => {
  const f = fixture(); f.trusted.github.workflow_sha = '0'.repeat(40);
  assert.throws(() => run(f));
});
test('OLD projection accepts the workflow SHA mismatch', async () => {
  const f = fixture(); f.trusted.github.workflow_sha = '0'.repeat(40);
  assert.equal(run(f, await load(true)).auditJob, '8123');
});
test('a policy cannot include runtime IDs or a self digest', () => {
  for (const key of ['auditRun', 'auditJob', 'policySha256']) {
    const f = fixture(); f.p[key] = key === 'policySha256' ? '0'.repeat(64) : '8100';
    assert.throws(() => run(f));
  }
});
test('immutable external policy byte digest is checked', () => {
  const f = fixture(), r = reviewed(f.p);
  r.policyBytes = Buffer.concat([r.policyBytes, Buffer.from(' ')]);
  assert.throws(() => BASE.verifyAuditExecution(r, f.trusted, f.evidence), /digest/);
});
function reject(name, edit) {
  test('reject ' + name, () => { const f = fixture(); edit(f); assert.throws(() => run(f)); });
}
for (const [key, value] of Object.entries({
  server_url:'https://foreign.invalid', api_url:'https://foreign.invalid', repository:'foreign/fork',
  repository_id:'702', repository_owner_id:'702', sha:'0'.repeat(40), workflow_sha:'0'.repeat(40),
  ref:'refs/heads/codex/other', ref_type:'tag', workflow_ref:'foreign/fork/.github/workflows/other.yml@main',
  event_name:'pull_request', run_id:'owner_audit', run_attempt:'2', run_number:'2', job:'8123'
})) reject('trusted context '+key, f => { f.trusted.github[key] = value; });
for (const [key,value] of Object.entries({
  id:9100, url:API+'/actions/runs/9100', head_sha:'0'.repeat(40), head_branch:'codex/other',
  path:'.github/workflows/other.yml', event:'workflow_dispatch', run_attempt:2, run_number:2,
  status:'completed', conclusion:'success', jobs_url:API+'/actions/runs/9100/jobs'
})) reject('API run '+key, f => editApi(f,'run',r=>{r[key]=value;}));
reject('API fork', f => editApi(f,'run',r=>{r.head_repository.full_name='foreign/fork';}));
reject('API repository identity', f => editApi(f,'run',r=>{r.repository.id=702;}));
for (const [key,value] of Object.entries({
  id:'8123', run_id:9100, head_sha:'0'.repeat(40), run_attempt:2, name:'Other job',
  status:'completed', conclusion:'success', url:API+'/actions/jobs/9100', run_url:API+'/actions/runs/9100'
})) reject('API job '+key, f => editApi(f,'jobs',r=>{r.jobs[0][key]=value;}));
reject('duplicate numeric jobs',f=>editApi(f,'jobs',r=>{r.jobs.push({...r.jobs[0]});r.total_count=2;}));
reject('ambiguous matching job names',f=>editApi(f,'jobs',r=>{r.jobs.push({...r.jobs[0],id:8124});r.total_count=2;}));
reject('incomplete jobs page',f=>editApi(f,'jobs',r=>{r.total_count=2;}));
reject('missing current job',f=>editApi(f,'jobs',r=>{r.jobs=[];r.total_count=0;}));
reject('runtime equals intake',f=>{f.trusted.github.run_id=f.p.intakeRun;});
reject('runtime equals signing',f=>{f.trusted.github.run_id=f.p.signingRun;});
for(const name of ['controllerCommit','toolkitCommit']) {
  reject(name+' tree',f=>editApi(f,name,r=>{r.tree.sha='0'.repeat(40);}));
  reject(name+' repository URL',f=>editApi(f,name,r=>{r.url='https://foreign.invalid';}));
}
for(const name of ['controller','toolkit']) {
  for(const [key,value] of Object.entries({namespace:'other',realPath:'/tmp/elsewhere',gitTopLevel:'/tmp/elsewhere',
    headSha:'0'.repeat(40),headTree:'0'.repeat(40),statusPorcelain:'?? untracked.mjs\n'}))
    reject(name+' checkout '+key,f=>{f.evidence.checkouts[name][key]=value;});
  reject(name+' changed file bytes',f=>{Object.values(f.evidence.checkouts[name].files)[0].bytes=Buffer.from('changed');});
  reject(name+' symlinked file path',f=>{Object.values(f.evidence.checkouts[name].files)[0].realPath='/tmp/elsewhere';});
  reject(name+' nonregular file',f=>{Object.values(f.evidence.checkouts[name].files)[0].regularFile=false;});
}
reject('reused controller namespace for toolkit',f=>{f.p.toolkit.namespace=f.p.controller.namespace;});
reject('worktree outside real workspace',f=>{f.trusted.workspaceRealPath='/tmp/replaced';});
reject('relative workspace',f=>{f.trusted.workspace='relative';});
reject('traversing manifest path',f=>{f.p.toolkit.fileSha256['../escape.mjs']='0'.repeat(64);});
reject('missing collector file pin',f=>{delete f.p.toolkit.fileSha256['scripts/qa/ios-signing/collect-owner-snapshot.mjs'];});
reject('new unplanned caller github field',f=>{f.trusted.github.event={inputs:{run_id:'8100'}};});
reject('missing original API capture',f=>{delete f.evidence.api.jobs;});
reject('foreign API origin',f=>{f.evidence.api.jobs.url='https://foreign.invalid';});
reject('wrong jobs attempt endpoint',f=>{f.evidence.api.jobs.url=f.evidence.api.jobs.url.replace('/attempts/1/','/attempts/2/');});
reject('POST capture',f=>{f.evidence.api.run.method='POST';});
reject('redirect-following capture',f=>{f.evidence.api.run.redirect='follow';});
reject('capture with request body',f=>{f.evidence.api.run.body={};});
reject('stale capture window',f=>{f.evidence.api.jobs.startedAt='2026-10-15T11:59:00.000Z';});
reject('future capture window',f=>{f.evidence.api.jobs.completedAt='2026-10-15T12:03:00.000Z';});
reject('reused checkout snapshot',f=>{f.evidence.checkouts.toolkit.observedAt='2026-10-15T11:59:00.000Z';});
reject('reversed audit clock',f=>{f.trusted.checkedAt='2026-10-15T11:59:00.000Z';});
reject('changed bound input bytes',f=>{f.evidence.inputs['source-metadata.json']=Buffer.from('{}');});
reject('extra input file',f=>{f.evidence.inputs['extra.json']=Buffer.from('{}');});
function changeInput(f,name,edit) {
  const value=JSON.parse(f.evidence.inputs[name]);edit(value);f.evidence.inputs[name]=bytes(value);
  // Independent test mutation of a reviewed descriptor, to reach semantic cross checks.
  f.p.inputs.fileSha256[name]=hash(f.evidence.inputs[name]);
}
for(const [key,value] of Object.entries({sourceSha:'0'.repeat(40),sourceTree:'0'.repeat(40),
  buildId:'00000000-0000-4000-8000-000000000193',intakeRun:'999',signingRun:'999',
  ipaSha256:'0'.repeat(64),databaseAccepted:true,publicReleaseAccepted:true,distributionAllowed:true}))
  reject('intake receipt '+key,f=>changeInput(f,'successful-intake-receipt.json',r=>{r[key]=value;}));
reject('metadata build',f=>changeInput(f,'source-metadata.json',r=>{r.version.build='193';}));
