import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ADAPTER_PINS, adaptIntakeToOwnerReceipt} from './owner-intake-receipt-adapter.mjs';
const adapterSource = readFileSync(new URL('./owner-intake-receipt-adapter.mjs', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('./owner-availability-guard.mjs', import.meta.url), 'utf8');
let serial = 0;
async function bindModule(source, declaration, pins) {
  const replacement = declaration === 'ADAPTER_PINS'
    ? /export const ADAPTER_PINS = Object.freeze\(\{[\s\S]*?\n\}\);/
    : /export const PINS = Object.freeze\(\{[\s\S]*?\n\}\);/;
  const changed = source.replace(replacement, 'export const ' + declaration + ' = Object.freeze(' + JSON.stringify(pins) + ');');
  assert.notEqual(changed, source);
  return import('data:text/javascript;base64,' + Buffer.from(changed + '\n//' + serial++).toString('base64'));
}

// HARNESS: same bodies can be exercised with literal, in-memory bound modules.
export async function runAdapterControls(loadAdapter, unboundAdapter, loadCore, basePins) {
  const results = [], hash = x => createHash('sha256').update(x).digest('hex');
  const APP = basePins.appId, G = basePins.ownerGroupId, T = basePins.ownerTesterId;
  const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const EXTERNAL = 'external-group', XT = 'external-tester', X = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const copy = structuredClone;
  const q = (p, params) => p + '?' + new URLSearchParams(params);
  const time = offset => new Date(Date.now() - 10000 + offset).toISOString();
  async function check(name, fn) { try { await fn(); results.push({name, passed: true}); }
    catch (error) { results.push({name, passed: false, error: error.message}); } }
  function makeEvidence(s) {
    const e = {schemaVersion: 1, mode: 'INJECTED_API_GET_ONLY', appId: APP, buildId: TARGET,
      startedAt: s.observedAt, completedAt: time(8000), complete: true,
      transportAttestation: 'NOT_PROVIDED_BY_THIS_COLLECTOR', requests: [], collections: [],
      derivations: {testerGroupIds: 'Union of membership IDs from every app group; no global tester request'}};
    const pathKey = path => { const u = new URL(path, 'https://api.appstoreconnect.apple.com'); u.searchParams.sort(); return u.pathname + u.search; };
    const request = path => {
      const record = {method: 'GET', path: pathKey(path), requestSha256: hash(Buffer.from(JSON.stringify(pathKey(path)))),
        cursorSha256: null, completed: true};
      e.requests.push(record); return {...record};
    };
    const add = (path, type, list) => {
      const req = request(path), sorted = [...list].sort();
      e.collections.push({initialPath: path, type, total: list.length, complete: true,
        pages: [{request: {path: req.path, requestSha256: req.requestSha256, cursorSha256: null},
          count: list.length, idsSha256: hash(Buffer.from(JSON.stringify(list))), nextRequest: null}],
        idsSha256: hash(Buffer.from(JSON.stringify(sorted)))});
    };
    add(q('/v1/builds/' + TARGET + '/betaBuildLocalizations', {'fields[betaBuildLocalizations]': 'locale,whatsNew', limit: '200'}),
      'betaBuildLocalizations', s.notes.map(n => n.id));
    const gf = {'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled', limit: '200'};
    add(q('/v1/apps/' + APP + '/betaGroups', gf), 'betaGroups', s.groups.map(g => g.id));
    for (const g of s.groups) {
      add(q('/v1/betaGroups/' + g.id + '/relationships/builds', {limit: '200'}), 'builds', g.buildIds);
      add(q('/v1/betaGroups/' + g.id + '/relationships/betaTesters', {limit: '200'}), 'betaTesters', g.testerIds);
    }
    add(q('/v1/betaGroups', {'filter[app]': APP, 'filter[builds]': TARGET, ...gf}), 'betaGroups', []);
    add(q('/v1/builds/' + TARGET + '/relationships/individualTesters', {limit: '200'}), 'betaTesters', []);
    add(q('/v1/apps/' + APP + '/appStoreVersions', {'filter[platform]': 'IOS',
      'fields[appStoreVersions]': 'platform,versionString,appStoreState,releaseType', limit: '200'}),
      'appStoreVersions', s.appStoreVersions.map(v => v.id));
    for (const path of [
      q('/v1/apps/' + APP, {'fields[apps]': 'bundleId'}),
      q('/v1/builds/' + TARGET, {'fields[builds]': 'version,processingState,expired,usesNonExemptEncryption'}),
      q('/v1/builds/' + TARGET + '/preReleaseVersion', {'fields[preReleaseVersions]': 'version,platform'}),
      q('/v1/builds/' + TARGET + '/buildBetaDetail', {'fields[buildBetaDetails]': 'internalBuildState,externalBuildState'}),
      '/v1/builds/' + TARGET + '/relationships/appStoreVersion']) request(path);
    for (const g of s.groups) {
      request('/v1/betaGroups/' + g.id + '/relationships/app');
      request(q('/v1/betaGroups/' + g.id, {'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled'}));
    }
    for (const build of new Set([TARGET, ...s.groups.flatMap(g => g.buildIds),
      ...s.appStoreVersions.map(v => v.buildId).filter(x => x !== null)]))
      request(q('/v1/builds/' + build + '/app', {'fields[apps]': 'bundleId'}));
    for (const v of s.appStoreVersions) request(q('/v1/appStoreVersions/' + v.id + '/build', {'fields[builds]': 'version'}));
    return e;
  }
  async function fixture(mutate = () => {}) {
    const docs = {}, files = {};
    const p = {...basePins, sourceSha: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
      signingToolSha: 'c'.repeat(40), intakeToolSha: 'd'.repeat(40),
      signedRunId: '101', signedJobId: '102', signedArtifactId: '103',
      intakeRunId: '201', intakeJobId: '202', intakeArtifactId: '203',
      qaRunId: '301', windowsRunId: '302', fontRunId: '303', authRunId: '304',
      signingBranch: 'codex/signing-synthetic', signingWorkflowPath: '.github/workflows/signing-synthetic.yml',
      intakeBranch: 'codex/intake-synthetic', intakeWorkflowPath: '.github/workflows/intake-synthetic.yml',
      intakeEvent: 'push', intakeJobName: 'upload-original', collectorStepName: 'Collect owner snapshot',
      buildId: TARGET, previousBuildId: B};
    files['signing-artifact.zip'] = Buffer.from('synthetic original encrypted ZIP bytes; not a parsed ZIP');
    files['intake-evidence.zip'] = Buffer.from('synthetic intake evidence ZIP bytes; not a parsed ZIP');
    p.signedArtifactSize = String(files['signing-artifact.zip'].length);
    p.intakeArtifactSize = String(files['intake-evidence.zip'].length);
    p.signedZipSha256 = hash(files['signing-artifact.zip']); p.intakeZipSha256 = hash(files['intake-evidence.zip']);
    p.ipaSha256 = 'e'.repeat(64);
    const notes = 'עדכון אישי סינתטי לבדיקה';
    p.notesSha256 = hash(Buffer.from(notes));
    p.baselineBuildIdsSha256 = hash(Buffer.from(JSON.stringify([B, C].sort())));
    docs['app-store-metadata-he.json'] = {app: {bundleId: p.bundleId}, version: {number: p.version, build: p.build,
      releaseNotes: ' \n' + notes + '\n '}};
    const groupReports = [{id: G, name: 'Yarin Internal Testing', isInternalGroup: true,
      hasAccessToAllBuilds: false, publicLinkEnabled: false,
      builds: [{id: B, build: '188'}, {id: C, build: '190'}]},
      {id: EXTERNAL, name: 'Existing external', isInternalGroup: false, hasAccessToAllBuilds: null,
        publicLinkEnabled: false, builds: [{id: X, build: '187'}]}];
    const storeReports = [{id: 'store455', version: '4.55', state: 'READY_FOR_SALE', releaseType: 'MANUAL'}];
    docs['intake-preflight.json'] = {appId: APP, mode: 'GET_ONLY', groups: copy(groupReports),
      appStoreVersions: copy(storeReports), build: null, checkedAt: time(0)};
    docs['intake-postflight.json'] = {appId: APP, mode: 'GET_ONLY', groups: copy(groupReports),
      appStoreVersions: copy(storeReports), build: {id: TARGET, build: p.build, version: p.version, processingState: 'VALID'},
      checkedAt: time(6000), assignedGroups: [], assignedIndividualTesters: 0, appStoreVersion: null,
      betaState: {internalBuildState: 'READY_FOR_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION'},
      scope: 'PACKAGE_INTAKE_ONLY', databaseAccepted: false, publicReleaseAccepted: false, distributionAllowed: false};
    docs['testflight-completion.json'] = {appId: APP, buildId: TARGET, version: p.version, build: p.build,
      processingState: 'VALID', hebrewReleaseNotesVerified: true, checkedAt: time(5000)};
    docs['owner-snapshot.json'] = {schemaVersion: 1, observedAt: time(7000),
      coverage: {appGroups: true, groupBuilds: true, groupTesters: true, buildGroups: true,
        individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true},
      app: {id: APP, bundleId: p.bundleId},
      build: {id: TARGET, appId: APP, version: p.version, build: p.build, platform: 'IOS',
        processingState: 'VALID', expired: false, usesNonExemptEncryption: false,
        internalBuildState: 'READY_FOR_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION'},
      notes: [{id: 'note-he', locale: 'he', whatsNew: notes}],
      buildGroupIds: [], individualTesterIds: [], storeVersionId: null,
      groups: groupReports.map(g => ({id: g.id, appId: APP, name: g.name, isInternalGroup: g.isInternalGroup,
        hasAccessToAllBuilds: g.hasAccessToAllBuilds, publicLinkEnabled: g.publicLinkEnabled,
        buildIds: g.builds.map(b => b.id).sort(), testerIds: [g.id === G ? T : XT]})),
      testers: [{id: T, groupIds: [G]}, {id: XT, groupIds: [EXTERNAL]}],
      appStoreVersions: storeReports.map(v => ({...v, buildId: B}))};
    docs['owner-snapshot-evidence.json'] = makeEvidence(docs['owner-snapshot.json']);
    docs['upload-origin.json'] = {sourceCommit: p.sourceSha, sourceTree: p.sourceTree,
      signingTools: p.signingToolSha, signingRunId: p.signedRunId, signingRunAttempt: '1',
      artifactId: p.signedArtifactId, artifactDigest: 'sha256:' + p.signedZipSha256, ipaSha256: p.ipaSha256,
      appleUploadPerformed: false, scope: 'PACKAGE_INTAKE_ONLY', databaseAccepted: false,
      publicReleaseAccepted: false, distributionAllowed: false};
    docs['original-artifact-before-upload.json'] = {sourceCommit: p.sourceSha, sourceTree: p.sourceTree,
      ipaSha256: p.ipaSha256, originalSigningRunId: p.signedRunId, rebuilt: false, signatureReverified: true,
      profile: {profileValidAtVerification: true, knownCertificateIncluded: true, debugEntitlement: false},
      everyOriginalWebAssetMatches: true, everyOriginalWebAssetMatchesCanonicalGitBuild: true,
      originalSourceInputsMatchCurrentGit: true, appleUploadPerformed: false};
    const repo = {full_name: 'yarinn12/sogrim-hashbon'};
    function run(id, tool, branch, path) {
      return {id: Number(id), repository: repo, head_repository: repo, head_sha: tool,
        head_branch: branch, path, event: 'push', run_attempt: 1, run_number: 1, status: 'completed', conclusion: 'success'};
    }
    docs['signing-run.json'] = run(p.signedRunId, p.signingToolSha, p.signingBranch, p.signingWorkflowPath);
    docs['intake-run.json'] = run(p.intakeRunId, p.intakeToolSha, p.intakeBranch, p.intakeWorkflowPath);
    function job(id, runId, tool, name, steps) {
      return {id: Number(id), run_id: Number(runId), head_sha: tool, name,
        status: 'completed', conclusion: 'success', ...(steps ? {steps} : {})};
    }
    docs['signing-jobs.json'] = {total_count: 1, jobs: [job(p.signedJobId, p.signedRunId, p.signingToolSha, 'build-export-verify-private')]};
    docs['intake-jobs.json'] = {total_count: 1, jobs: [job(p.intakeJobId, p.intakeRunId, p.intakeToolSha, p.intakeJobName,
      [{name: p.collectorStepName, status: 'completed', conclusion: 'success'}])]};
    function artifact(id, runId, tool, name, size, digest) {
      return {id: Number(id), name, size_in_bytes: Number(size), expired: false,
        workflow_run: {id: Number(runId), head_sha: tool}, digest: 'sha256:' + digest};
    }
    docs['signing-artifact.json'] = artifact(p.signedArtifactId, p.signedRunId, p.signingToolSha,
      'sogrim-ios-4.58-194-encrypted', p.signedArtifactSize, p.signedZipSha256);
    docs['intake-artifact.json'] = artifact(p.intakeArtifactId, p.intakeRunId, p.intakeToolSha,
      'ios194-intake-evidence-' + p.intakeRunId, p.intakeArtifactSize, p.intakeZipSha256);
    const sourceInputs = Object.fromEntries(Array.from({length: 501}, (_, i) => ['synthetic-' + i, 'f'.repeat(64)]));
    sourceInputs[metadataPath] = hash(Buffer.from(JSON.stringify(docs['app-store-metadata-he.json'])));
    sourceInputs['package.json'] = '1'.repeat(64); sourceInputs['package-lock.json'] = '2'.repeat(64);
    docs['source-before-upload.json'] = {sourceCommit: p.sourceSha, sourceTree: p.sourceTree,
      phase: 'before-upload', version: p.version, build: p.build, workflowCommit: p.intakeToolSha,
      buildRunId: p.intakeRunId, buildRunAttempt: '1', appleUploadPerformed: false, sourceInputs,
      packageSha256: sourceInputs['package.json'], packageLockSha256: sourceInputs['package-lock.json'], checkedAt: time(1000),
      ci: [[p.qaRunId, '.github/workflows/qa.yml', ['unit', 'cross-platform-shard-1', 'cross-platform-shard-2',
          'cross-platform', 'two-client-sync', 'unit-and-mobile', 'backup-runtime',
          ...['android-mobile', 'iphone-webkit', 'ipad-webkit', 'iphone-large-text', 'reflow-200'].map(p => 'mobile (' + p + ')'),
          'ios-native / native-parity', 'android-native / native-parity', 'mobile-iphone-large-text-shard-1',
          'mobile-iphone-large-text-shard-2', 'mobile-iphone-webkit-shard-1', 'mobile-iphone-webkit-shard-2']],
        [p.windowsRunId, '.github/workflows/qa-windows.yml', ['windows-unit']],
        [p.fontRunId, '.github/workflows/cross-engine-font-provenance-qa.yml', ['linux-font-provenance']],
        [p.authRunId, '.github/workflows/ios-auth-return-qa.yml', ['native']]].map(([id, path, names], n) => ({
          id, path, source: p.sourceSha, attempt: 1, conclusion: 'success',
          jobs: names.map((name, j) => ({id: 1000 + 100 * n + j, name, conclusion: 'success', source: p.sourceSha}))}))};
    mutate({docs, p, files});
    for (const [name, data] of Object.entries(docs)) files[name] = Buffer.from(JSON.stringify(data));
    p.fileSha256 = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)]));
    return {mod: await loadAdapter(p), files, pins: p, docs};
  }
  const metadataPath = 'docs/store-submission/app-store-metadata-he.json';
  await check('PENDING blocks before even inspecting caller input', async () => {
    let reads = 0;
    const input = new Proxy({}, {getPrototypeOf() { reads++; throw Error('input consumed'); },
      ownKeys() { reads++; throw Error('input consumed'); }, get() { reads++; throw Error('input consumed'); }});
    assert.throws(() => unboundAdapter.adaptIntakeToOwnerReceipt(input), /PENDING/); assert.equal(reads, 0);
  });
  for (const key of ['previousBuildId', 'baselineBuildIdsSha256', 'intakeJobId']) await check('unresolved binding blocks before input: ' + key, async () => {
    const f = await fixture(); const mod = await loadAdapter({...f.pins, [key]: 'PENDING'}); let reads = 0;
    const input = new Proxy({}, {getPrototypeOf() { reads++; throw Error('input consumed'); }, ownKeys() { reads++; throw Error('input consumed'); }});
    assert.throws(() => mod.adaptIntakeToOwnerReceipt(input), /PENDING/); assert.equal(reads, 0);
  });
  await check('complete synthetic evidence maps to canonical owner bytes with no193 assumption', async () => {
    const f = await fixture(); const out = f.mod.adaptIntakeToOwnerReceipt(f.files), again = f.mod.adaptIntakeToOwnerReceipt(f.files);
    assert.equal(f.docs['source-before-upload.json'].ci[0].jobs.length, 18);
    assert.ok(out.receiptBytes.equals(again.receiptBytes)); assert.equal(hash(out.receiptBytes), out.receiptSha256);
    assert.equal(out.previousBuildId, B); assert.deepEqual(out.baselineBuildIds, [B, C]);
    assert.ok(!JSON.stringify(f.docs['intake-postflight.json']).includes('193'));
    const r = JSON.parse(out.receiptBytes); assert.equal(r.scope, 'PACKAGE_INTAKE_ONLY');
    assert.equal(r.hebrewReleaseNotesVerified, true); assert.equal(r.notesSha256, f.pins.notesSha256);
    assert.equal(r.snapshot.groups.find(g => g.id === EXTERNAL).hasAccessToAllBuilds, null);
    assert.equal(out.publicReleaseAccepted, false); assert.equal(out.databaseAccepted, false);
    assert.ok(out.receiptBytes.toString('utf8').endsWith('\n'));
    assert.deepEqual(Object.keys(r), Object.keys(r).sort());
    const owner = await loadCore({...f.pins, intakeReceiptSha256: out.receiptSha256});
    const plan = owner.planOwnerAvailability(out.receiptBytes, r.snapshot);
    assert.equal(plan.action, 'ADD_BUILD_TO_EXISTING_OWNER_GROUP');
    assert.deepEqual(plan.request.body.data, [{type: 'builds', id: TARGET}]);
  });
  await check('raw evidence substitution fails without rebinding fingerprints', async () => {
    const f = await fixture(); f.files['testflight-completion.json'] = Buffer.from('{}');
    assert.throws(() => f.mod.adaptIntakeToOwnerReceipt(f.files), /digest/);
  });
  await check('ZIP byte changes fail even with rebound per-file digest if frozen artifact identity disagrees', async () => {
    const f = await fixture(({files}) => files['signing-artifact.zip'] = Buffer.from('changed ZIP'));
    assert.throws(() => f.mod.adaptIntakeToOwnerReceipt(f.files));
  });
  for (const name of ['owner-snapshot.json', 'owner-snapshot-evidence.json', 'intake-artifact.json', 'signing-jobs.json'])
    await check('missing indispensable input remains blocked: ' + name, async () => {
      const f = await fixture(); delete f.files[name]; assert.throws(() => f.mod.adaptIntakeToOwnerReceipt(f.files));
    });
  const cases = [
    ['metadata not from source fingerprint', ({docs}) => docs['source-before-upload.json'].sourceInputs[metadataPath] = '0'.repeat(64)],
    ['wrong source', ({docs}) => docs['upload-origin.json'].sourceCommit = '0'.repeat(40)],
    ['wrong tree', ({docs}) => docs['original-artifact-before-upload.json'].sourceTree = '0'.repeat(40)],
    ['wrong signing tool', ({docs}) => docs['signing-run.json'].head_sha = '0'.repeat(40)],
    ['wrong signing run', ({docs}) => docs['upload-origin.json'].signingRunId = '999'],
    ['wrong signing job', ({docs}) => docs['signing-jobs.json'].jobs[0].id = 999],
    ['incomplete job list', ({docs}) => docs['intake-jobs.json'].total_count = 2],
    ['failed collector step', ({docs}) => docs['intake-jobs.json'].jobs[0].steps[0].conclusion = 'failure'],
    ['missing collector step', ({docs}) => docs['intake-jobs.json'].jobs[0].steps = []],
    ['wrong intake artifact', ({docs}) => docs['intake-artifact.json'].id = 999],
    ['wrong intake ZIP digest', ({docs}) => docs['intake-artifact.json'].digest = 'sha256:' + '0'.repeat(64)],
    ['wrong original IPA', ({docs}) => docs['original-artifact-before-upload.json'].ipaSha256 = '0'.repeat(64)],
    ['incomplete signature proof', ({docs}) => docs['original-artifact-before-upload.json'].signatureReverified = false],
    ['rebuilt IPA', ({docs}) => docs['original-artifact-before-upload.json'].rebuilt = true],
    ['skipped source job', ({docs}) => docs['source-before-upload.json'].ci[0].jobs[0].conclusion = 'skipped'],
    ['missing QA lane', ({docs}) => docs['source-before-upload.json'].ci[0].jobs.pop()],
    ['missing cross-platform-shard-1', ({docs}) => {
      docs['source-before-upload.json'].ci[0].jobs = docs['source-before-upload.json'].ci[0].jobs.filter(j => j.name !== 'cross-platform-shard-1');
    }],
    ['missing cross-platform-shard-2', ({docs}) => {
      docs['source-before-upload.json'].ci[0].jobs = docs['source-before-upload.json'].ci[0].jobs.filter(j => j.name !== 'cross-platform-shard-2');
    }],
    ['second source CI attempt', ({docs}) => docs['source-before-upload.json'].ci[0].attempt = 2],
    ['wrong intake tool in source receipt', ({docs}) => docs['source-before-upload.json'].workflowCommit = '0'.repeat(40)],
    ['wrong194 completion identity', ({docs}) => docs['testflight-completion.json'].buildId = C],
    ['not VALID', ({docs}) => docs['testflight-completion.json'].processingState = 'PROCESSING'],
    ['notes not verified', ({docs}) => docs['testflight-completion.json'].hebrewReleaseNotesVerified = false],
    ['Apple notes differ from exact source trim', ({docs}) => docs['owner-snapshot.json'].notes[0].whatsNew += ' changed'],
    ['duplicate Hebrew notes', ({docs}) => docs['owner-snapshot.json'].notes.push(copy(docs['owner-snapshot.json'].notes[0]))],
    ['group exposure during intake', ({docs}) => docs['intake-postflight.json'].assignedGroups = [G]],
    ['individual exposure', ({docs}) => docs['owner-snapshot.json'].individualTesterIds = [T]],
    ['Store exposure', ({docs}) => docs['intake-postflight.json'].appStoreVersion = 'store458'],
    ['missing group flag', ({docs}) => delete docs['owner-snapshot.json'].groups[0].hasAccessToAllBuilds],
    ['automatic owner group', ({docs}) => docs['owner-snapshot.json'].groups[0].hasAccessToAllBuilds = true],
    ['extra owner tester', ({docs}) => docs['owner-snapshot.json'].groups[0].testerIds.push(XT)],
    ['lost baseline build', ({docs}) => docs['owner-snapshot.json'].groups[0].buildIds = [B]],
    ['different baseline across intake', ({docs}) => docs['intake-preflight.json'].groups[0].builds.pop()],
    ['selected baseline GUID unproven', ({p}) => p.previousBuildId = X],
    ['wrong baseline set digest', ({p}) => p.baselineBuildIdsSha256 = '0'.repeat(64)],
    ['empty group baseline cannot be repaired by inventing193', ({docs, p}) => {
      docs['intake-preflight.json'].groups[0].builds = []; docs['intake-postflight.json'].groups[0].builds = [];
      docs['owner-snapshot.json'].groups[0].buildIds = []; p.baselineBuildIdsSha256 = hash(Buffer.from('[]'));
      docs['owner-snapshot-evidence.json'] = makeEvidence(docs['owner-snapshot.json']);
    }],
    ['Store state changed', ({docs}) => docs['owner-snapshot.json'].appStoreVersions[0].state = 'PREPARE_FOR_SUBMISSION'],
    ['collector incomplete', ({docs}) => docs['owner-snapshot-evidence.json'].complete = false],
    ['coverage cannot replace collector evidence', ({docs}) => docs['owner-snapshot-evidence.json'].collections = []],
    ['unproven total', ({docs}) => delete docs['owner-snapshot-evidence.json'].collections[0].total],
    ['fake page total', ({docs}) => docs['owner-snapshot-evidence.json'].collections[0].total += 1],
    ['missing build identity read', ({docs}) => docs['owner-snapshot-evidence.json'].requests = docs['owner-snapshot-evidence.json'].requests.filter(r => !r.path.includes('/preReleaseVersion'))],
    ['page not linked to GET', ({docs}) => docs['owner-snapshot-evidence.json'].collections[0].pages[0].request.requestSha256 = '0'.repeat(64)],
    ['foreign initial evidence path', ({docs}) => {
      const c = docs['owner-snapshot-evidence.json'].collections[0]; c.initialPath = 'https://evil.invalid' + c.initialPath;
    }],
    ['page path contradicts GET record', ({docs}) => docs['owner-snapshot-evidence.json'].collections[0].pages[0].request.cursorSha256 = '0'.repeat(64)],
    ['page GET reused to inflate counts', ({docs}) => {
      const c = docs['owner-snapshot-evidence.json'].collections.find(c => c.type === 'builds' && c.total === 2);
      const second = copy(c.pages[0]); second.count = 1; second.nextRequest = null;
      c.pages[0].count = 1; c.pages[0].nextRequest = copy(second.request); c.pages.push(second);
    }],
    ['unplanned account-wide GET', ({docs}) => docs['owner-snapshot-evidence.json'].requests.push({
      method: 'GET', path: '/v1/apps', requestSha256: '7'.repeat(64), cursorSha256: null, completed: true
    })],
    ['page not terminal', ({docs}) => docs['owner-snapshot-evidence.json'].collections[0].pages[0].nextRequest = {}],
    ['mutating transport evidence', ({docs}) => docs['owner-snapshot-evidence.json'].requests[0].method = 'POST'],
    ['global tester request', ({docs}) => docs['owner-snapshot-evidence.json'].requests[0].path = '/v1/betaTesters'],
    ['old snapshot before postflight', ({docs}) => docs['owner-snapshot.json'].observedAt = time(1000)],
    ['public release flag cannot be promoted', ({docs}) => docs['intake-postflight.json'].publicReleaseAccepted = true]
  ];
  for (const [name, mutate] of cases) await check('semantic mismatch remains blocked after synthetic digest rebinding: ' + name, async () => {
    const f = await fixture(mutate); assert.throws(() => f.mod.adaptIntakeToOwnerReceipt(f.files));
  });
  await check('lossy JSON numeric input is blocked even with matching frozen input bytes', async () => {
    const f = await fixture();
    const bytes = Buffer.from(f.files['testflight-completion.json'].toString('utf8').replace('"VALID"', '1e999'));
    f.files['testflight-completion.json'] = bytes;
    f.pins.fileSha256['testflight-completion.json'] = hash(bytes);
    const bound = await loadAdapter(f.pins); assert.throws(() => bound.adaptIntakeToOwnerReceipt(f.files));
  });
  return {total: results.length, passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length, skipped: 0, failures: results.filter(r => !r.passed)};
}

// NODE TEST ENTRY: no adapter CLI or activation path.
test('owner intake adapter synthetic controls', async () => {
  const report = await runAdapterControls(
    pins => bindModule(adapterSource, 'ADAPTER_PINS', pins),
    {adaptIntakeToOwnerReceipt},
    pins => bindModule(coreSource, 'PINS', pins),
    ADAPTER_PINS
  );
  assert.equal(report.failed, 0, JSON.stringify(report.failures));
  assert.equal(report.total, 64);
});
