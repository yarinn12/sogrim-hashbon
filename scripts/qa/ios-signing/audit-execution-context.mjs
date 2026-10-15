import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';

// Pure preparation helper. The reviewed policy lives OUTSIDE every commit it describes.
// No audit run/job IDs or this policy's own digest belong inside that policy.
const freeze = x => {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
};
export const AUDIT_EXECUTION_POLICY_TEMPLATE = freeze({
  schemaVersion: 1, scope: 'INDEPENDENT_POST_INTAKE_GET_ONLY',
  repository: 'yarinn12/sogrim-hashbon', repositoryId: 'PENDING', repositoryOwnerId: 'PENDING',
  source: {sha: 'PENDING', tree: 'PENDING', branch: 'PENDING'},
  build: {appId: '6809952514', bundleId: 'com.sogrimhashbon.app', platform: 'IOS',
    version: '4.58', build: '194', buildId: 'PENDING', ipaSha256: 'PENDING'},
  toolkit: {sha: 'PENDING', tree: 'PENDING', namespace: 'audit-tools', fileSha256: {
    'scripts/qa/ios-signing/collect-owner-snapshot.mjs': 'PENDING',
    'scripts/lib/app-store-release.mjs': 'PENDING',
    'scripts/qa/ios-signing/owner-post-intake-audit-template.mjs': 'PENDING',
    'scripts/qa/ios-signing/audit-execution-context.mjs': 'PENDING',
    'scripts/qa/ios-signing/verify_successful_intake.py': 'PENDING'
  }},
  controller: {sha: 'PENDING', tree: 'PENDING', namespace: 'audit-controller',
    branch: 'PENDING', workflowPath: 'PENDING', event: 'PENDING',
    jobKey: 'PENDING', jobName: 'PENDING', fileSha256: 'PENDING'},
  inputs: {fileSha256: 'PENDING'},
  intakeRun: 'PENDING', signingRun: 'PENDING'
});
const REPO = 'yarinn12/sogrim-hashbon', API = 'https://api.github.com/repos/' + REPO;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const keys = (x, expected, label) => {
  assert.ok(x && Object.getPrototypeOf(x) === Object.prototype, label + ' object required');
  assert.deepEqual(Object.keys(x).sort(), [...expected].sort(), label + ' fields');
};
const sha = (value, length = 40) => assert.match(value ?? '', new RegExp('^[a-f0-9]{' + length + '}$'));
const positive = value => assert.match(value ?? '', /^[1-9][0-9]*$/);
const numeric = value => { assert.ok(Number.isSafeInteger(value) && value > 0); return String(value); };
const timestamp = value => {
  assert.match(value ?? '', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/);
  const result = Date.parse(value); assert.ok(Number.isFinite(result)); return result;
};
function json(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 16 * 1024 * 1024);
  const text = bytes.toString('utf8'); assert.ok(Buffer.from(text).equals(bytes), 'Original UTF8 bytes required');
  return JSON.parse(text);
}
function relative(path) {
  assert.ok(typeof path === 'string' && path && !/[\s\\:\x00]/.test(path));
  assert.ok(!path.startsWith('/') && posix.normalize(path) === path
    && path.split('/').every(s => s !== '.' && s !== '..' && s), 'Unsafe relative path');
}
function filePins(map, required) {
  assert.ok(map && Object.getPrototypeOf(map) === Object.prototype);
  assert.ok(Object.keys(map).length > 0 && Object.keys(map).length <= 128);
  for (const path of required) assert.ok(Object.hasOwn(map, path), 'Missing reviewed file pin');
  for (const [path, digest] of Object.entries(map)) { relative(path); sha(digest, 64); }
}
function requirePolicy(p) {
  const noPending = x => {
    if (x && typeof x === 'object') Object.values(x).forEach(noPending);
    else assert.notEqual(x, 'PENDING', 'Audit execution policy remains PENDING');
  };
  noPending(p);
  keys(p, Object.keys(AUDIT_EXECUTION_POLICY_TEMPLATE), 'Policy');
  assert.equal(p.schemaVersion, 1); assert.equal(p.scope, 'INDEPENDENT_POST_INTAKE_GET_ONLY');
  assert.equal(p.repository, REPO); positive(p.repositoryId); positive(p.repositoryOwnerId);
  keys(p.source, ['sha', 'tree', 'branch'], 'Source');
  sha(p.source.sha); sha(p.source.tree); assert.match(p.source.branch, /^codex\/[a-z0-9-]+$/);
  keys(p.build, Object.keys(AUDIT_EXECUTION_POLICY_TEMPLATE.build), 'Build');
  for (const key of ['appId', 'bundleId', 'platform', 'version', 'build'])
    assert.equal(p.build[key], AUDIT_EXECUTION_POLICY_TEMPLATE.build[key]);
  assert.match(p.build.buildId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  sha(p.build.ipaSha256, 64); positive(p.intakeRun); positive(p.signingRun);
  assert.notEqual(p.intakeRun, p.signingRun);
  for (const name of ['toolkit', 'controller']) {
    const t = p[name]; keys(t, Object.keys(AUDIT_EXECUTION_POLICY_TEMPLATE[name]), name);
    sha(t.sha); sha(t.tree); assert.equal(t.namespace, AUDIT_EXECUTION_POLICY_TEMPLATE[name].namespace);
  }
  filePins(p.toolkit.fileSha256, Object.keys(AUDIT_EXECUTION_POLICY_TEMPLATE.toolkit.fileSha256));
  const c = p.controller;
  assert.match(c.branch, /^codex\/[a-z0-9-]+$/);
  assert.match(c.workflowPath, /^\.github\/workflows\/[a-z0-9-]+\.yml$/);
  assert.ok(['push', 'workflow_dispatch'].includes(c.event));
  assert.match(c.jobKey, /^[a-zA-Z_][a-zA-Z0-9_-]*$/);
  assert.ok(typeof c.jobName === 'string' && c.jobName.trim());
  filePins(c.fileSha256, [c.workflowPath]);
  keys(p.inputs, ['fileSha256'], 'Inputs');
  filePins(p.inputs.fileSha256, ['successful-intake-receipt.json', 'source-metadata.json']);
}
function commitProof(record, shaValue, tree) {
  assert.equal(record.sha, shaValue); assert.equal(record.tree?.sha, tree);
  assert.equal(record.url, API + '/git/commits/' + shaValue);
  assert.equal(record.tree?.url, API + '/git/trees/' + tree);
}
function readApi(captures, name, url, start, end) {
  const r = captures[name];
  keys(r, ['url', 'method', 'redirect', 'startedAt', 'completedAt', 'bytes'], 'API capture');
  assert.equal(r.url, url); assert.equal(r.method, 'GET'); assert.equal(r.redirect, 'error');
  assert.ok(start <= timestamp(r.startedAt) && timestamp(r.startedAt) <= timestamp(r.completedAt)
    && timestamp(r.completedAt) <= end, 'Capture window');
  return json(r.bytes);
}
function checkoutProof(observed, expected, workspaceRealPath, start, end) {
  keys(observed, ['namespace', 'realPath', 'gitTopLevel', 'headSha', 'headTree', 'statusPorcelain',
    'observedAt', 'files'], 'Checkout');
  assert.equal(observed.namespace, expected.namespace);
  const root = posix.join(workspaceRealPath, expected.namespace);
  assert.equal(observed.realPath, root); assert.equal(observed.gitTopLevel, root);
  assert.equal(observed.headSha, expected.sha); assert.equal(observed.headTree, expected.tree);
  assert.equal(observed.statusPorcelain, '', 'Checkout must include no tracked or untracked changes');
  assert.ok(start <= timestamp(observed.observedAt) && timestamp(observed.observedAt) <= end);
  keys(observed.files, Object.keys(expected.fileSha256), 'Checkout files');
  for (const [path, digest] of Object.entries(expected.fileSha256)) {
    const file = observed.files[path];
    keys(file, ['bytes', 'realPath', 'regularFile'], 'Checkout file');
    assert.equal(file.realPath, posix.join(root, path)); assert.equal(file.regularFile, true);
    assert.ok(Buffer.isBuffer(file.bytes)); assert.equal(hash(file.bytes), digest, 'Reviewed checkout bytes');
  }
}

// reviewed.policySha256 is an OUT-OF-BAND Root trust anchor supplied by a reviewed caller,
// never a dispatch input or a value read from the policy itself.
// trusted is a measured allowlist of built-in GitHub context + runner filesystem/clock data.
// evidence contains original API buffers and freshly measured checkout/input buffers.
// This pure helper cannot authenticate the origins of these arguments.
export function verifyAuditExecution(reviewed, trusted, evidence) {
  keys(reviewed, ['policyBytes', 'policySha256'], 'Reviewed policy anchor');
  sha(reviewed.policySha256, 64);
  assert.ok(Buffer.isBuffer(reviewed.policyBytes));
  assert.equal(hash(reviewed.policyBytes), reviewed.policySha256, 'Reviewed policy byte digest');
  const p = json(reviewed.policyBytes);
  requirePolicy(p); // Before ANY access to trusted runtime or API/checkout inputs.
  keys(trusted, ['github', 'workspace', 'workspaceRealPath', 'startedAt', 'checkedAt'], 'Trusted runtime');
  const g = trusted.github;
  keys(g, ['server_url', 'api_url', 'repository', 'repository_id', 'repository_owner_id',
    'sha', 'ref', 'ref_type', 'workflow_ref', 'workflow_sha', 'event_name',
    'run_id', 'run_attempt', 'run_number', 'job'], 'Built-in GitHub allowlist');
  assert.equal(g.server_url, 'https://github.com'); assert.equal(g.api_url, 'https://api.github.com');
  assert.equal(g.repository, REPO); assert.equal(g.repository_id, p.repositoryId);
  assert.equal(g.repository_owner_id, p.repositoryOwnerId);
  assert.equal(g.sha, p.controller.sha); assert.equal(g.workflow_sha, p.controller.sha);
  const ref = 'refs/heads/' + p.controller.branch;
  assert.equal(g.ref_type, 'branch'); assert.equal(g.ref, ref);
  assert.equal(g.workflow_ref, REPO + '/' + p.controller.workflowPath + '@' + ref);
  assert.equal(g.event_name, p.controller.event);
  positive(g.run_id); assert.equal(g.run_attempt, '1'); assert.equal(g.run_number, '1');
  assert.equal(g.job, p.controller.jobKey, 'GITHUB_JOB is a key, never a numeric job ID');
  assert.notEqual(g.run_id, p.intakeRun); assert.notEqual(g.run_id, p.signingRun);
  for (const path of [trusted.workspace, trusted.workspaceRealPath]) {
    assert.ok(typeof path === 'string' && path.startsWith('/') && path !== '/'
      && posix.normalize(path) === path && !/[\x00\r\n]/.test(path), 'Trusted absolute workspace required');
  }
  const start = timestamp(trusted.startedAt), end = timestamp(trusted.checkedAt);
  assert.ok(start <= end);
  keys(evidence, ['api', 'checkouts', 'inputs'], 'Evidence');
  keys(evidence.api, ['controllerCommit', 'toolkitCommit', 'run', 'jobs'], 'Original API records');
  const call = (name, route) => readApi(evidence.api, name, API + route, start, end);
  commitProof(call('controllerCommit', '/git/commits/' + p.controller.sha), p.controller.sha, p.controller.tree);
  commitProof(call('toolkitCommit', '/git/commits/' + p.toolkit.sha), p.toolkit.sha, p.toolkit.tree);
  const run = call('run', '/actions/runs/' + g.run_id);
  assert.equal(numeric(run.id), g.run_id);
  assert.equal(run.url, API + '/actions/runs/' + g.run_id);
  for (const repo of [run.repository, run.head_repository]) {
    assert.equal(repo?.full_name, REPO); assert.equal(numeric(repo?.id), p.repositoryId);
  }
  assert.equal(run.head_sha, p.controller.sha); assert.equal(run.head_branch, p.controller.branch);
  assert.equal(run.path, p.controller.workflowPath); assert.equal(run.event, p.controller.event);
  assert.equal(run.run_attempt, 1); assert.equal(run.run_number, 1);
  assert.equal(run.status, 'in_progress'); assert.equal(run.conclusion, null);
  assert.equal(run.jobs_url, API + '/actions/runs/' + g.run_id + '/jobs');
  assert.ok(timestamp(run.created_at) <= start && timestamp(run.updated_at) <= end);
  const envelope = call('jobs', '/actions/runs/' + g.run_id + '/attempts/1/jobs?per_page=100&page=1');
  const jobs = envelope.jobs;
  assert.ok(Array.isArray(jobs) && jobs.length > 0 && jobs.length <= 100);
  assert.equal(envelope.total_count, jobs.length, 'Incomplete jobs page');
  assert.equal(new Set(jobs.map(j => numeric(j.id))).size, jobs.length, 'Duplicate numeric jobs');
  for (const job of jobs) {
    assert.equal(numeric(job.run_id), g.run_id); assert.equal(job.head_sha, p.controller.sha);
    assert.equal(job.run_attempt, 1);
    assert.ok(['queued', 'in_progress', 'completed'].includes(job.status));
    assert.equal(job.conclusion, job.status === 'completed' ? 'success' : null);
  }
  const matches = jobs.filter(job => job.name === p.controller.jobName);
  assert.equal(matches.length, 1, 'Exactly one reviewed job name must resolve');
  const job = matches[0], jobId = numeric(job.id);
  assert.equal(job.status, 'in_progress'); assert.equal(job.conclusion, null);
  assert.equal(job.url, API + '/actions/jobs/' + jobId);
  assert.equal(job.run_url, API + '/actions/runs/' + g.run_id);
  assert.ok(timestamp(run.created_at) <= timestamp(job.started_at) && timestamp(job.started_at) <= start);
  keys(evidence.checkouts, ['controller', 'toolkit'], 'Checkouts');
  for (const name of ['controller', 'toolkit'])
    checkoutProof(evidence.checkouts[name], p[name], trusted.workspaceRealPath, start, end);
  keys(evidence.inputs, Object.keys(p.inputs.fileSha256), 'Audit inputs');
  for (const [name, digest] of Object.entries(p.inputs.fileSha256)) {
    assert.ok(Buffer.isBuffer(evidence.inputs[name]));
    assert.equal(hash(evidence.inputs[name]), digest, 'Reviewed audit input bytes');
  }
  // Links only: this does NOT substitute for running the successful-intake verifier.
  const receipt = json(evidence.inputs['successful-intake-receipt.json']);
  assert.equal(receipt.scope, 'OFFLINE_SUCCESSFUL_INTAKE_EVIDENCE_PREPARATION_ONLY');
  for (const [key, value] of Object.entries({sourceSha: p.source.sha, sourceTree: p.source.tree,
    sourceBranch: p.source.branch, appId: p.build.appId, bundleId: p.build.bundleId,
    platform: 'IOS', version: '4.58', build: '194', buildId: p.build.buildId,
    ipaSha256: p.build.ipaSha256, intakeRun: p.intakeRun, signingRun: p.signingRun})) assert.equal(receipt[key], value);
  for (const key of ['ownerAvailabilityAccepted', 'databaseAccepted', 'publicReleaseAccepted', 'distributionAllowed'])
    assert.equal(receipt[key], false);
  const metadata = json(evidence.inputs['source-metadata.json']);
  assert.equal(metadata.app?.bundleId, p.build.bundleId);
  assert.equal(metadata.version?.number, '4.58'); assert.equal(metadata.version?.build, '194');
  return freeze({
    schemaVersion: 1, scope: 'AUDIT_EXECUTION_CONTEXT_PREPARATION_ONLY',
    auditMode: p.scope, reviewedPolicySha256: reviewed.policySha256,
    sourceSha: p.source.sha, sourceTree: p.source.tree,
    auditToolSha: p.toolkit.sha, auditToolTree: p.toolkit.tree,
    controllerSha: p.controller.sha, controllerTree: p.controller.tree,
    auditRun: g.run_id, auditJob: jobId, auditJobKey: g.job, auditJobName: job.name,
    runAttempt: 1, runNumber: 1, workflowPath: p.controller.workflowPath, event: p.controller.event,
    checkedAt: trusted.checkedAt,
    apiSha256: Object.fromEntries(Object.entries(evidence.api).map(([name, r]) => [name, hash(r.bytes)])),
    inputSha256: {...p.inputs.fileSha256},
    appleKeysAuthorized: false, ownerAvailabilityAccepted: false,
    databaseAccepted: false, publicReleaseAccepted: false, distributionAllowed: false,
    transportAttestation: 'NOT_PROVIDED_BY_PURE_VERIFIER'
  });
}
