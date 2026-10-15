import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const REQUIRED_FILES = Object.freeze([
  'app-store-metadata-he.json', 'upload-origin.json', 'source-before-upload.json',
  'original-artifact-before-upload.json', 'intake-preflight.json', 'intake-postflight.json',
  'testflight-completion.json', 'owner-snapshot.json', 'owner-snapshot-evidence.json',
  'signing-run.json', 'signing-jobs.json', 'signing-artifact.json',
  'intake-run.json', 'intake-jobs.json', 'intake-artifact.json',
  'signing-artifact.zip', 'intake-evidence.zip'
]);
// Preparation only: no runtime override of these bindings, no CLI, IO or transport.
export const ADAPTER_PINS = Object.freeze({
  appId: '6809952514', bundleId: 'com.sogrimhashbon.app', version: '4.58', build: '194',
  ownerGroupId: '4646e3de-7401-4e70-ac32-9a00072e1376',
  ownerTesterId: '5d2040f0-3af9-4d98-a188-fd6eeb5547db',
  sourceSha: 'PENDING', sourceTree: 'PENDING', signingToolSha: 'PENDING', intakeToolSha: 'PENDING',
  signedRunId: 'PENDING', signedJobId: 'PENDING', signedArtifactId: 'PENDING', signedArtifactSize: 'PENDING',
  signedZipSha256: 'PENDING', ipaSha256: 'PENDING',
  intakeRunId: 'PENDING', intakeJobId: 'PENDING', intakeArtifactId: 'PENDING', intakeArtifactSize: 'PENDING',
  intakeZipSha256: 'PENDING', notesSha256: 'PENDING', buildId: 'PENDING',
  previousBuildId: 'PENDING', baselineBuildIdsSha256: 'PENDING',
  qaRunId: 'PENDING', windowsRunId: 'PENDING', fontRunId: 'PENDING', authRunId: 'PENDING',
  signingBranch: 'PENDING', signingWorkflowPath: 'PENDING',
  intakeBranch: 'PENDING', intakeWorkflowPath: 'PENDING', intakeEvent: 'PENDING',
  intakeJobName: 'PENDING', collectorStepName: 'PENDING',
  fileSha256: Object.freeze(Object.fromEntries(REQUIRED_FILES.map(name => [name, 'PENDING'])))
});
const P = ADAPTER_PINS, REPO = 'yarinn12/sogrim-hashbon';
const metadataPath = 'docs/store-submission/app-store-metadata-he.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (x, k) => x !== null && typeof x === 'object' && Object.hasOwn(x, k);
const sorted = values => [...values].sort();
function value(x, k) { assert.ok(own(x, k), 'Missing field: ' + k); return x[k]; }
function id(x) { assert.ok(typeof x === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(x)); return x; }
function sha(x) { assert.match(x, /^[a-f0-9]{64}$/); return x; }
function positive(x) { assert.match(x, /^[1-9][0-9]*$/); return x; }
function numericId(x) { assert.ok(Number.isSafeInteger(x) && x > 0); return String(x); }
function guid(x) { assert.match(x, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i); return x; }
function ids(x) { assert.ok(Array.isArray(x)); x.forEach(id); assert.equal(new Set(x).size, x.length); return x; }
function sameIds(a, b) { assert.deepEqual(sorted(ids(a)), sorted(ids(b))); }
function timestamp(x) { assert.equal(typeof x, 'string'); assert.equal(new Date(x).toISOString(), x); return Date.parse(x); }
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x !== null && typeof x === 'object') {
    assert.equal(Object.getPrototypeOf(x), Object.prototype);
    return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])]));
  }
  assert.ok(x === null || typeof x === 'string' || typeof x === 'boolean' ||
    (typeof x === 'number' && Number.isFinite(x)), 'Lossy JSON value');
  return x;
}
function canonicalBytes(x) { return Buffer.from(JSON.stringify(canonical(x)) + '\n', 'utf8'); }
export function requireAdapterBindings() {
  // Intentionally before ANY access to the caller's input object.
  for (const [k, v] of Object.entries(P)) {
    if (k !== 'fileSha256') assert.notEqual(v, 'PENDING', 'Adapter bindings remain PENDING');
  }
  assert.deepEqual(sorted(Object.keys(P.fileSha256)), sorted(REQUIRED_FILES));
  for (const digest of Object.values(P.fileSha256)) sha(digest);
  for (const k of ['sourceSha', 'sourceTree', 'signingToolSha', 'intakeToolSha']) assert.match(P[k], /^[a-f0-9]{40}$/);
  for (const k of ['signedZipSha256', 'ipaSha256', 'intakeZipSha256', 'notesSha256', 'baselineBuildIdsSha256']) sha(P[k]);
  for (const k of ['signedRunId', 'signedJobId', 'signedArtifactId', 'signedArtifactSize',
    'intakeRunId', 'intakeJobId', 'intakeArtifactId', 'intakeArtifactSize', 'qaRunId',
    'windowsRunId', 'fontRunId', 'authRunId']) positive(P[k]);
  guid(P.buildId); guid(P.previousBuildId); assert.notEqual(P.previousBuildId, P.buildId);
  for (const k of ['signingBranch', 'intakeBranch']) assert.match(P[k], /^codex\/[a-z0-9-]+$/);
  for (const k of ['signingWorkflowPath', 'intakeWorkflowPath']) assert.match(P[k], /^\.github\/workflows\/[a-z0-9-]+\.yml$/);
  assert.ok(['push', 'workflow_dispatch'].includes(P.intakeEvent));
  for (const k of ['intakeJobName', 'collectorStepName']) assert.ok(typeof P[k] === 'string' && P[k].trim().length > 0);
}
function readEvidence(files) {
  assert.ok(files && Object.getPrototypeOf(files) === Object.prototype);
  assert.deepEqual(sorted(Object.keys(files)), sorted(REQUIRED_FILES), 'Missing or unplanned input files');
  const parsed = {}, fingerprints = {};
  for (const name of REQUIRED_FILES) {
    const bytes = files[name]; assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0, 'Original bytes required: ' + name);
    assert.ok(bytes.length <= (name.endsWith('.zip') ? 536870912 : 16777216), 'Oversized evidence');
    fingerprints[name] = hash(bytes); assert.equal(fingerprints[name], P.fileSha256[name], 'Input digest: ' + name);
    if (!name.endsWith('.zip')) {
      const text = bytes.toString('utf8'); assert.ok(Buffer.from(text, 'utf8').equals(bytes), 'Invalid UTF8');
      parsed[name] = JSON.parse(text); canonical(parsed[name]); // Reject Infinity, undefined and non-JSON output.
    }
  }
  assert.equal(fingerprints['signing-artifact.zip'], P.signedZipSha256);
  assert.equal(fingerprints['intake-evidence.zip'], P.intakeZipSha256);
  assert.equal(String(files['signing-artifact.zip'].length), P.signedArtifactSize);
  assert.equal(String(files['intake-evidence.zip'].length), P.intakeArtifactSize);
  return {parsed, fingerprints};
}
function github(run, jobsEnvelope, artifact, prefix) {
  const signing = prefix === 'signed', tool = signing ? P.signingToolSha : P.intakeToolSha;
  const runId = signing ? P.signedRunId : P.intakeRunId;
  const jobId = signing ? P.signedJobId : P.intakeJobId;
  const artifactId = signing ? P.signedArtifactId : P.intakeArtifactId;
  assert.equal(numericId(run.id), runId);
  assert.equal(run.repository?.full_name, REPO); assert.equal(run.head_repository?.full_name, REPO);
  assert.equal(run.head_sha, tool);
  assert.equal(run.head_branch, signing ? P.signingBranch : P.intakeBranch);
  assert.equal(run.path, signing ? P.signingWorkflowPath : P.intakeWorkflowPath);
  assert.equal(run.event, signing ? 'push' : P.intakeEvent);
  assert.equal(run.run_attempt, 1); assert.equal(run.run_number, 1);
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  const jobs = jobsEnvelope.jobs;
  assert.ok(Array.isArray(jobs) && jobs.length > 0);
  assert.equal(jobsEnvelope.total_count, jobs.length, 'Incomplete job capture');
  assert.equal(new Set(jobs.map(j => numericId(j.id))).size, jobs.length);
  for (const j of jobs) {
    assert.equal(numericId(j.run_id), runId); assert.equal(j.head_sha, tool);
    assert.equal(j.status, 'completed'); assert.equal(j.conclusion, 'success');
  }
  if (signing) assert.equal(jobs.length, 1);
  const selected = jobs.filter(j => numericId(j.id) === jobId); assert.equal(selected.length, 1);
  assert.equal(selected[0].name, signing ? 'build-export-verify-private' : P.intakeJobName);
  if (!signing) {
    const steps = selected[0].steps; assert.ok(Array.isArray(steps));
    const collector = steps.filter(s => s.name === P.collectorStepName); assert.equal(collector.length, 1);
    assert.equal(collector[0].status, 'completed'); assert.equal(collector[0].conclusion, 'success');
  }
  assert.equal(numericId(artifact.id), artifactId);
  assert.equal(artifact.name, signing ? 'sogrim-ios-4.58-194-encrypted' : 'ios194-intake-evidence-' + runId);
  assert.equal(artifact.expired, false);
  assert.equal(numericId(artifact.workflow_run?.id), runId); assert.equal(artifact.workflow_run.head_sha, tool);
  assert.equal(artifact.digest, 'sha256:' + (signing ? P.signedZipSha256 : P.intakeZipSha256));
  assert.equal(numericId(artifact.size_in_bytes), signing ? P.signedArtifactSize : P.intakeArtifactSize);
  return {jobId: numericId(selected[0].id)};
}
function sourceProof(r, metadataBytes) {
  assert.equal(r.sourceCommit, P.sourceSha); assert.equal(r.sourceTree, P.sourceTree);
  assert.equal(r.phase, 'before-upload'); assert.equal(r.version, P.version); assert.equal(r.build, P.build);
  assert.equal(r.workflowCommit, P.intakeToolSha); assert.equal(r.buildRunId, P.intakeRunId);
  assert.equal(r.buildRunAttempt, '1'); assert.equal(r.appleUploadPerformed, false);
  const inputs = r.sourceInputs; assert.ok(inputs && Object.keys(inputs).length > 500);
  for (const digest of Object.values(inputs)) sha(digest);
  assert.equal(inputs[metadataPath], hash(metadataBytes), 'Metadata is not from the accepted source fingerprint');
  assert.equal(sha(r.packageSha256), inputs['package.json']);
  assert.equal(sha(r.packageLockSha256), inputs['package-lock.json']);
  const expected = new Map([[P.qaRunId, '.github/workflows/qa.yml'],
    [P.windowsRunId, '.github/workflows/qa-windows.yml'],
    [P.fontRunId, '.github/workflows/cross-engine-font-provenance-qa.yml'],
    [P.authRunId, '.github/workflows/ios-auth-return-qa.yml']]);
  assert.equal(expected.size, 4); assert.ok(Array.isArray(r.ci) && r.ci.length === 4);
  sameIds(r.ci.map(c => c.id), [...expected.keys()]);
  for (const c of r.ci) {
    assert.equal(c.path, expected.get(c.id)); assert.equal(c.source, P.sourceSha);
    assert.equal(c.attempt, 1); assert.equal(c.conclusion, 'success');
    assert.ok(Array.isArray(c.jobs) && c.jobs.length > 0);
    assert.equal(new Set(c.jobs.map(j => numericId(j.id))).size, c.jobs.length);
    for (const j of c.jobs) { assert.equal(j.source, P.sourceSha); assert.equal(j.conclusion, 'success'); }
    const names = c.path === '.github/workflows/qa.yml' ? ['unit', 'cross-platform-shard-1', 'cross-platform-shard-2',
      'cross-platform', 'two-client-sync', 'unit-and-mobile', 'backup-runtime',
      ...['android-mobile', 'iphone-webkit', 'ipad-webkit', 'iphone-large-text', 'reflow-200'].map(p => 'mobile (' + p + ')'),
      'ios-native / native-parity', 'android-native / native-parity', 'mobile-iphone-large-text-shard-1',
      'mobile-iphone-large-text-shard-2', 'mobile-iphone-webkit-shard-1', 'mobile-iphone-webkit-shard-2'] :
      [{'.github/workflows/qa-windows.yml': 'windows-unit', '.github/workflows/cross-engine-font-provenance-qa.yml':
        'linux-font-provenance', '.github/workflows/ios-auth-return-qa.yml': 'native'}[c.path]];
    for (const name of names) assert.equal(c.jobs.filter(j => j.name === name).length, 1);
  }
}
function group(r) {
  assert.ok(Array.isArray(r.groups));
  const found = r.groups.filter(g => g.id === P.ownerGroupId); assert.equal(found.length, 1);
  assert.equal(found[0].isInternalGroup, true); assert.equal(found[0].hasAccessToAllBuilds, false);
  return found[0];
}
function preserveOwnerBaseline(pre, post, snapshot) {
  const before = group(pre), after = group(post), collected = group(snapshot);
  assert.ok(Array.isArray(before.builds) && Array.isArray(after.builds));
  const beforeIds = ids(before.builds.map(b => b.id)), afterIds = ids(after.builds.map(b => b.id));
  sameIds(beforeIds, afterIds); sameIds(afterIds, collected.buildIds);
  for (const b of before.builds) {
    assert.equal(typeof b.build, 'string');
    assert.equal(after.builds.find(x => x.id === b.id)?.build, b.build);
  }
  const baselineBuildIds = sorted(afterIds);
  assert.equal(hash(Buffer.from(JSON.stringify(baselineBuildIds))), P.baselineBuildIdsSha256);
  assert.ok(baselineBuildIds.length > 0, 'Empty baseline requires a separately reviewed core contract');
  assert.ok(baselineBuildIds.includes(P.previousBuildId), 'Selected core baseline ID is not proven in the existing group');
  // No version193 requirement or historical GUID. Root binds this selection only
  // after a real complete baseline and contract review; every baseline ID is preserved.
  return {baselineBuildIds, baselineBuildIdsSha256: P.baselineBuildIdsSha256, previousBuildId: P.previousBuildId};
}
function snapshotProof(s, post, notes) {
  assert.equal(s.schemaVersion, 1);
  assert.deepEqual(s.coverage, {appGroups: true, groupBuilds: true, groupTesters: true,
    buildGroups: true, individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true});
  assert.deepEqual(s.app, {id: P.appId, bundleId: P.bundleId});
  assert.deepEqual(s.build, {id: P.buildId, appId: P.appId, version: P.version, build: P.build, platform: 'IOS',
    processingState: 'VALID', expired: false, usesNonExemptEncryption: false,
    internalBuildState: post.betaState.internalBuildState, externalBuildState: post.betaState.externalBuildState});
  assert.equal(s.build.internalBuildState, 'READY_FOR_BETA_TESTING');
  assert.ok(['READY_FOR_BETA_SUBMISSION', 'NOT_APPLICABLE'].includes(s.build.externalBuildState));
  assert.deepEqual(s.buildGroupIds, []); assert.deepEqual(s.individualTesterIds, []); assert.equal(s.storeVersionId, null);
  const he = s.notes.filter(n => n.locale === 'he'); assert.equal(he.length, 1);
  for (const n of s.notes) { id(n.id); assert.equal(typeof n.locale, 'string'); assert.equal(typeof n.whatsNew, 'string'); }
  assert.equal(new Set(s.notes.map(n => n.locale)).size, s.notes.length);
  assert.equal(he[0].whatsNew, notes); assert.equal(hash(Buffer.from(notes)), P.notesSha256);
  sameIds(s.groups.map(g => g.id), post.groups.map(g => g.id));
  for (const g of s.groups) {
    assert.equal(g.appId, P.appId); assert.equal(typeof g.isInternalGroup, 'boolean');
    assert.equal(typeof g.name, 'string'); ids(g.buildIds); ids(g.testerIds);
    assert.ok(own(g, 'hasAccessToAllBuilds') && own(g, 'publicLinkEnabled'));
    if (g.isInternalGroup) assert.equal(g.hasAccessToAllBuilds, false);
    else { assert.ok(g.hasAccessToAllBuilds === false || g.hasAccessToAllBuilds === null); assert.equal(g.publicLinkEnabled, false); }
    assert.ok(g.publicLinkEnabled === false || (g.isInternalGroup && g.publicLinkEnabled === null));
    assert.ok(!g.buildIds.includes(P.buildId));
    const old = post.groups.find(x => x.id === g.id);
    for (const k of ['name', 'isInternalGroup', 'hasAccessToAllBuilds', 'publicLinkEnabled']) assert.equal(g[k], value(old, k));
    sameIds(g.buildIds, old.builds.map(b => b.id));
  }
  sameIds(group(s).testerIds, [P.ownerTesterId]);
  const all = [...new Set(s.groups.flatMap(g => g.testerIds))]; sameIds(s.testers.map(t => t.id), all);
  for (const t of s.testers) sameIds(t.groupIds, s.groups.filter(g => g.testerIds.includes(t.id)).map(g => g.id));
  assert.ok(Array.isArray(s.appStoreVersions) && s.appStoreVersions.length > 0);
  sameIds(s.appStoreVersions.map(v => v.id), post.appStoreVersions.map(v => v.id));
  for (const v of s.appStoreVersions) {
    const old = post.appStoreVersions.find(x => x.id === v.id);
    for (const k of ['id', 'version', 'state', 'releaseType']) assert.equal(v[k], old[k]);
    assert.ok(own(v, 'buildId') && (v.buildId === null || typeof v.buildId === 'string'));
    assert.notEqual(v.buildId, P.buildId);
  }
}
function collectorProof(e, s) {
  assert.equal(e.schemaVersion, 1); assert.equal(e.mode, 'INJECTED_API_GET_ONLY');
  assert.equal(e.appId, P.appId); assert.equal(e.buildId, P.buildId); assert.equal(e.complete, true);
  assert.equal(e.startedAt, s.observedAt); assert.ok(timestamp(e.completedAt) >= timestamp(e.startedAt));
  assert.equal(e.transportAttestation, 'NOT_PROVIDED_BY_THIS_COLLECTOR');
  assert.ok(e.derivations?.testerGroupIds?.includes('no global tester request'));
  assert.ok(Array.isArray(e.requests) && e.requests.length > 0 && e.requests.length <= 2000);
  const requestHashes = new Set(), requestByHash = new Map();
  for (const r of e.requests) {
    assert.equal(r.method, 'GET'); assert.equal(r.completed, true); sha(r.requestSha256);
    assert.ok(!requestHashes.has(r.requestSha256)); requestHashes.add(r.requestSha256); requestByHash.set(r.requestSha256, r);
    assert.ok(r.cursorSha256 === null || /^[a-f0-9]{64}$/.test(r.cursorSha256));
    assert.ok(typeof r.path === 'string' && r.path.startsWith('/v1/') && !/[\\#\s]/.test(r.path));
    const u = new URL(r.path, 'https://api.appstoreconnect.apple.com');
    assert.ok(!u.searchParams.has('cursor'));
    assert.ok(!u.pathname.startsWith('/v1/betaTesters'), 'Unexpected account-wide tester read');
    if (u.pathname === '/v1/betaGroups') {
      assert.equal(u.searchParams.get('filter[app]'), P.appId);
      assert.equal(u.searchParams.get('filter[builds]'), P.buildId);
    }
  }
  assert.ok(Array.isArray(e.collections) && e.collections.length > 0);
  const key = path => {
    assert.ok(typeof path === 'string' && path.startsWith('/v1/') && !/[\s\\#]/.test(path), 'Foreign or malformed evidence path');
    const u = new URL(path, 'https://api.appstoreconnect.apple.com');
    assert.equal(u.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(new Set(u.searchParams.keys()).size, [...u.searchParams.keys()].length);
    assert.ok(!u.searchParams.has('cursor')); u.searchParams.sort(); return u.pathname + u.search;
  };
  const q = (path, params) => path + '?' + new URLSearchParams(params);
  const expected = new Map();
  const add = (path, type, list) => expected.set(key(path), {type, list: sorted(list)});
  add(q('/v1/builds/' + P.buildId + '/betaBuildLocalizations', {'fields[betaBuildLocalizations]': 'locale,whatsNew', limit: '200'}), 'betaBuildLocalizations', s.notes.map(n => n.id));
  const gf = {'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled', limit: '200'};
  add(q('/v1/apps/' + P.appId + '/betaGroups', gf), 'betaGroups', s.groups.map(g => g.id));
  for (const g of s.groups) {
    add(q('/v1/betaGroups/' + g.id + '/relationships/builds', {limit: '200'}), 'builds', g.buildIds);
    add(q('/v1/betaGroups/' + g.id + '/relationships/betaTesters', {limit: '200'}), 'betaTesters', g.testerIds);
  }
  add(q('/v1/betaGroups', {'filter[app]': P.appId, 'filter[builds]': P.buildId, ...gf}), 'betaGroups', s.buildGroupIds);
  add(q('/v1/builds/' + P.buildId + '/relationships/individualTesters', {limit: '200'}), 'betaTesters', s.individualTesterIds);
  add(q('/v1/apps/' + P.appId + '/appStoreVersions', {'filter[platform]': 'IOS',
    'fields[appStoreVersions]': 'platform,versionString,appStoreState,releaseType', limit: '200'}), 'appStoreVersions', s.appStoreVersions.map(v => v.id));
  assert.equal(e.collections.length, expected.size);
  const seen = new Set();
  for (const c of e.collections) {
    const k = key(c.initialPath); assert.ok(expected.has(k) && !seen.has(k)); seen.add(k);
    const want = expected.get(k); assert.equal(c.type, want.type); assert.equal(c.complete, true);
    assert.equal(c.total, want.list.length); assert.equal(c.idsSha256, hash(Buffer.from(JSON.stringify(want.list))));
    assert.ok(Array.isArray(c.pages) && c.pages.length > 0 && c.pages.length <= 20);
    let count = 0; const pageSeen = new Set();
    for (const [index, page] of c.pages.entries()) {
      assert.ok(Number.isSafeInteger(page.count) && page.count >= 0 && page.count <= 200);
      count += page.count; sha(page.idsSha256);
      assert.ok(requestHashes.has(page.request?.requestSha256), 'Page not linked to recorded GET');
      const observed = requestByHash.get(page.request.requestSha256);
      assert.deepEqual(page.request, {path: observed.path, requestSha256: observed.requestSha256, cursorSha256: observed.cursorSha256});
      assert.ok(!pageSeen.has(page.request.requestSha256), 'Page GET reused'); pageSeen.add(page.request.requestSha256);
      assert.equal(key(page.request.path), k);
      if (index === c.pages.length - 1) assert.equal(page.nextRequest, null);
      else { assert.ok(page.count > 0); assert.deepEqual(page.nextRequest, c.pages[index + 1].request); }
    }
    assert.equal(count, c.total);
  }
  const expectedReads = [
    q('/v1/apps/' + P.appId, {'fields[apps]': 'bundleId'}),
    q('/v1/builds/' + P.buildId, {'fields[builds]': 'version,processingState,expired,usesNonExemptEncryption'}),
    q('/v1/builds/' + P.buildId + '/preReleaseVersion', {'fields[preReleaseVersions]': 'version,platform'}),
    q('/v1/builds/' + P.buildId + '/buildBetaDetail', {'fields[buildBetaDetails]': 'internalBuildState,externalBuildState'}),
    '/v1/builds/' + P.buildId + '/relationships/appStoreVersion'
  ];
  for (const g of s.groups) {
    expectedReads.push('/v1/betaGroups/' + g.id + '/relationships/app');
    expectedReads.push(q('/v1/betaGroups/' + g.id,
      {'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled'}));
  }
  for (const build of new Set([P.buildId, ...s.groups.flatMap(g => g.buildIds),
    ...s.appStoreVersions.map(v => v.buildId).filter(x => x !== null)]))
    expectedReads.push(q('/v1/builds/' + build + '/app', {'fields[apps]': 'bundleId'}));
  const observedReadKeys = new Set(e.requests.map(r => key(r.path)));
  for (const path of expectedReads) assert.ok(observedReadKeys.has(key(path)), 'Missing required scoped read');
  for (const v of s.appStoreVersions) expectedReads.push(q('/v1/appStoreVersions/' + v.id + '/build', {'fields[builds]': 'version'}));
  const allowedReadKeys = new Set([...expected.keys(), ...expectedReads.map(key)]);
  for (const path of expectedReads) assert.ok(observedReadKeys.has(key(path)), 'Missing required scoped read');
  for (const path of observedReadKeys) assert.ok(allowedReadKeys.has(path), 'Unplanned or account-wide GET');
}
export function adaptIntakeToOwnerReceipt(files) {
  requireAdapterBindings();
  const {parsed: d, fingerprints} = readEvidence(files);
  const signing = github(d['signing-run.json'], d['signing-jobs.json'], d['signing-artifact.json'], 'signed');
  const intake = github(d['intake-run.json'], d['intake-jobs.json'], d['intake-artifact.json'], 'intake');
  const m = d['app-store-metadata-he.json'], origin = d['upload-origin.json'];
  assert.equal(m.app?.bundleId, P.bundleId); assert.equal(m.version?.number, P.version); assert.equal(m.version?.build, P.build);
  const notes = value(m.version, 'releaseNotes'); assert.equal(typeof notes, 'string');
  const normalizedNotes = notes.trim(); assert.ok(normalizedNotes.length > 0 && normalizedNotes.length <= 4000);
  sourceProof(d['source-before-upload.json'], files['app-store-metadata-he.json']);
  const original = d['original-artifact-before-upload.json'];
  for (const r of [origin, original]) {
    assert.equal(r.sourceCommit, P.sourceSha); assert.equal(r.sourceTree, P.sourceTree);
    assert.equal(r.ipaSha256, P.ipaSha256); assert.equal(r.appleUploadPerformed, false);
  }
  assert.equal(origin.scope, 'PACKAGE_INTAKE_ONLY');
  assert.equal(origin.signingTools, P.signingToolSha); assert.equal(origin.signingRunId, P.signedRunId);
  assert.equal(origin.signingRunAttempt, '1'); assert.equal(origin.artifactId, P.signedArtifactId);
  assert.equal(origin.artifactDigest, 'sha256:' + P.signedZipSha256);
  for (const k of ['databaseAccepted', 'publicReleaseAccepted', 'distributionAllowed']) assert.equal(origin[k], false);
  assert.equal(original.originalSigningRunId, P.signedRunId); assert.equal(original.rebuilt, false);
  for (const k of ['signatureReverified', 'everyOriginalWebAssetMatches', 'everyOriginalWebAssetMatchesCanonicalGitBuild',
    'originalSourceInputsMatchCurrentGit']) assert.equal(original[k], true);
  assert.equal(original.profile?.profileValidAtVerification, true); assert.equal(original.profile.knownCertificateIncluded, true);
  const pre = d['intake-preflight.json'], post = d['intake-postflight.json'], completion = d['testflight-completion.json'];
  assert.equal(pre.appId, P.appId); assert.equal(pre.mode, 'GET_ONLY'); assert.equal(pre.build, null);
  assert.equal(post.appId, P.appId); assert.equal(post.scope, 'PACKAGE_INTAKE_ONLY');
  assert.equal(post.mode, 'GET_ONLY'); assert.deepEqual(post.build, {id: P.buildId, build: P.build, version: P.version, processingState: 'VALID'});
  for (const k of ['databaseAccepted', 'publicReleaseAccepted', 'distributionAllowed']) assert.equal(post[k], false);
  assert.deepEqual(post.assignedGroups, []); assert.equal(post.assignedIndividualTesters, 0); assert.equal(post.appStoreVersion, null);
  assert.deepEqual(pre.appStoreVersions, post.appStoreVersions);
  for (const r of [pre, post]) for (const g of r.groups) assert.ok(!g.builds.some(b => b.id === P.buildId || b.build === P.build));
  for (const [k, v] of Object.entries({appId: P.appId, buildId: P.buildId, version: P.version, build: P.build,
    processingState: 'VALID', hebrewReleaseNotesVerified: true})) assert.equal(completion[k], v);
  const s = d['owner-snapshot.json']; snapshotProof(s, post, normalizedNotes); collectorProof(d['owner-snapshot-evidence.json'], s);
  const baseline = preserveOwnerBaseline(pre, post, s);
  assert.ok(timestamp(d['source-before-upload.json'].checkedAt) <= timestamp(completion.checkedAt));
  assert.ok(timestamp(completion.checkedAt) <= timestamp(post.checkedAt));
  assert.ok(timestamp(post.checkedAt) <= timestamp(s.observedAt), 'Snapshot must be collected after intake postflight');
  const r = {schemaVersion: 1, scope: post.scope, appId: post.appId, bundleId: s.app.bundleId,
    version: completion.version, build: completion.build, buildId: completion.buildId,
    sourceSha: origin.sourceCommit, sourceTree: origin.sourceTree, signingToolSha: origin.signingTools,
    signedRunId: origin.signingRunId, signedJobId: signing.jobId, signedArtifactId: origin.artifactId,
    signedArtifactSize: String(d['signing-artifact.json'].size_in_bytes), signedZipSha256: fingerprints['signing-artifact.zip'],
    ipaSha256: original.ipaSha256, intakeToolSha: d['source-before-upload.json'].workflowCommit,
    intakeRunId: d['source-before-upload.json'].buildRunId, intakeJobId: intake.jobId,
    intakeArtifactId: String(d['intake-artifact.json'].id), intakeZipSha256: fingerprints['intake-evidence.zip'],
    notesSha256: hash(Buffer.from(normalizedNotes)), hebrewReleaseNotesVerified: completion.hebrewReleaseNotesVerified,
    snapshot: s};
  const receiptBytes = canonicalBytes(r);
  return {receiptBytes, receiptSha256: hash(receiptBytes), ...baseline, inputSha256: fingerprints,
    scope: 'DERIVED_OWNER_RECEIPT_PREPARATION_ONLY', databaseAccepted: false, publicReleaseAccepted: false};
}
