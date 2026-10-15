import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Preparation scaffold only. No CLI, transport, credentials, workflow or network calls.
// A reviewed handoff must replace every PENDING value, including the exact receipt digest.
export const PINS = Object.freeze({
  appId: '6809952514', bundleId: 'com.sogrimhashbon.app', version: '4.58', build: '194',
  ownerGroupId: '4646e3de-7401-4e70-ac32-9a00072e1376',
  ownerTesterId: '5d2040f0-3af9-4d98-a188-fd6eeb5547db',
  previousBuildId: 'PENDING', baselineBuildIds: 'PENDING', baselineBuildIdsSha256: 'PENDING',
  sourceSha: 'PENDING', sourceTree: 'PENDING', signingToolSha: 'PENDING',
  signedRunId: 'PENDING', signedJobId: 'PENDING', signedArtifactId: 'PENDING',
  signedArtifactSize: 'PENDING', signedZipSha256: 'PENDING', ipaSha256: 'PENDING',
  intakeToolSha: 'PENDING', intakeRunId: 'PENDING', intakeJobId: 'PENDING',
  intakeArtifactId: 'PENDING', intakeZipSha256: 'PENDING',
  intakeReceiptSha256: 'PENDING', notesSha256: 'PENDING', buildId: 'PENDING'
});
export const BASE_INTAKE_COMMIT = '99108f94df459f0814b875faaf826d90b425b26d';
const hash = value => createHash('sha256').update(value).digest('hex');
const own = (obj, key) => Object.hasOwn(obj, key);
const id = value => assert.ok(typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value), 'Invalid resource ID');
const sorted = values => [...values].sort();
const sameSet = (a, b) => assert.deepEqual(sorted(a), sorted(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const json = value => JSON.stringify(canonical(value));
function ids(values) {
  assert.ok(Array.isArray(values), 'Incomplete relationship');
  values.forEach(id);
  assert.equal(new Set(values).size, values.length, 'Duplicate relationship');
  return values;
}
export function requireBoundPins() {
  assert.ok(!Object.values(PINS).includes('PENDING'), 'Owner availability remains PENDING');
  for (const key of ['sourceSha', 'sourceTree', 'signingToolSha', 'intakeToolSha'])
    assert.match(PINS[key], /^[a-f0-9]{40}$/);
  for (const key of ['signedZipSha256', 'ipaSha256', 'intakeZipSha256', 'intakeReceiptSha256', 'notesSha256'])
    assert.match(PINS[key], /^[a-f0-9]{64}$/);
  for (const key of ['signedRunId', 'signedJobId', 'signedArtifactId', 'signedArtifactSize',
    'intakeRunId', 'intakeJobId', 'intakeArtifactId']) assert.match(PINS[key], /^[1-9][0-9]*$/);
  assert.match(PINS.buildId, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const baseline = ids(PINS.baselineBuildIds);
  for (const buildId of baseline) assert.match(buildId, /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.match(PINS.baselineBuildIdsSha256, /^[a-f0-9]{64}$/);
  assert.equal(hash(JSON.stringify(sorted(baseline))), PINS.baselineBuildIdsSha256, 'Pinned baseline digest mismatch');
  assert.ok(!baseline.includes(PINS.buildId), 'Target build is not an existing baseline');
  if (baseline.length === 0) assert.equal(PINS.previousBuildId, null, 'Empty audited baseline requires explicit null previous ID');
  else assert.ok(baseline.includes(PINS.previousBuildId), 'Previous build must belong to the entire pinned baseline');
}
function receipt(bytes) {
  requireBoundPins(); // Fail before parsing a caller-supplied snapshot or producing a request.
  assert.ok(Buffer.isBuffer(bytes), 'Original receipt bytes required');
  assert.equal(hash(bytes), PINS.intakeReceiptSha256, 'Intake receipt digest mismatch');
  const r = JSON.parse(bytes.toString('utf8'));
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.scope, 'PACKAGE_INTAKE_ONLY');
  assert.equal(r.hebrewReleaseNotesVerified, true);
  for (const key of ['appId', 'bundleId', 'version', 'build', 'buildId', 'sourceSha', 'sourceTree',
    'signingToolSha', 'signedRunId', 'signedJobId', 'signedArtifactId', 'signedArtifactSize',
    'signedZipSha256', 'ipaSha256', 'intakeToolSha', 'intakeRunId', 'intakeJobId',
    'intakeArtifactId', 'intakeZipSha256', 'notesSha256', 'previousBuildId', 'baselineBuildIdsSha256']) assert.equal(r[key], PINS[key], 'Receipt pin: ' + key);
  sameSet(ids(r.baselineBuildIds), PINS.baselineBuildIds);
  const baseline = inspect(r.snapshot, false);
  assert.equal(baseline.assigned, false, 'Intake receipt must prove zero distribution');
  return r;
}
function inspect(s, fresh = true) {
  assert.equal(s?.schemaVersion, 1);
  // This adapter contract requires complete, paginated live collections. The collector
  // is deliberately not implemented here and must be independently reviewed at handoff.
  assert.deepEqual(s.coverage, {appGroups: true, groupBuilds: true, groupTesters: true,
    buildGroups: true, individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true});
  if (fresh) {
    const age = Date.now() - Date.parse(s.observedAt);
    assert.ok(Number.isFinite(age) && age >= -5000 && age <= 120000, 'Stale or future snapshot');
  }
  assert.deepEqual(s.app, {id: PINS.appId, bundleId: PINS.bundleId});
  const b = s.build;
  for (const [key, value] of Object.entries({id: PINS.buildId, appId: PINS.appId,
    version: PINS.version, build: PINS.build, platform: 'IOS', processingState: 'VALID',
    expired: false, usesNonExemptEncryption: false})) assert.equal(b?.[key], value, 'Build: ' + key);
  assert.ok(['READY_FOR_BETA_SUBMISSION', 'NOT_APPLICABLE'].includes(b.externalBuildState),
    'External review or testing is active/unknown');
  assert.ok(Array.isArray(s.notes));
  ids(s.notes.map(n => n.id));
  for (const n of s.notes) { assert.equal(typeof n.locale, 'string'); assert.equal(typeof n.whatsNew, 'string'); }
  const hebrew = s.notes.filter(x => x.locale === 'he');
  assert.equal(hebrew.length, 1, 'Missing or duplicate Hebrew notes');
  assert.equal(typeof hebrew[0].whatsNew, 'string');
  assert.equal(hash(hebrew[0].whatsNew), PINS.notesSha256, 'Hebrew notes changed');
  ids(s.buildGroupIds); ids(s.individualTesterIds);
  assert.equal(s.individualTesterIds.length, 0, 'Unexpected individual tester');
  assert.equal(s.storeVersionId, null, 'Build linked to App Store');
  assert.ok(Array.isArray(s.groups) && s.groups.length > 0);
  ids(s.groups.map(g => g.id));
  const groupMap = new Map(s.groups.map(g => [g.id, g]));
  const linkedGroups = [];
  for (const g of s.groups) {
    assert.equal(g.appId, PINS.appId);
    assert.equal(typeof g.name, 'string');
    assert.equal(typeof g.isInternalGroup, 'boolean', 'Unknown group scope');
    assert.ok(own(g, 'hasAccessToAllBuilds') && own(g, 'publicLinkEnabled'), 'Missing group flags');
    if (g.isInternalGroup) assert.equal(g.hasAccessToAllBuilds, false, 'Automatic internal access');
    else {
      assert.ok(g.hasAccessToAllBuilds === false || g.hasAccessToAllBuilds === null);
      assert.equal(g.publicLinkEnabled, false, 'External public link');
    }
    assert.ok(g.publicLinkEnabled === false || (g.isInternalGroup && g.publicLinkEnabled === null));
    ids(g.buildIds); ids(g.testerIds);
    if (g.buildIds.includes(PINS.buildId)) linkedGroups.push(g.id);
  }
  sameSet(linkedGroups, s.buildGroupIds); // Check both directions, not just group names.
  const owner = groupMap.get(PINS.ownerGroupId);
  assert.ok(owner?.isInternalGroup === true, 'Existing internal owner group required');
  assert.equal(owner.hasAccessToAllBuilds, false);
  sameSet(owner.testerIds, [PINS.ownerTesterId]);
  sameSet(owner.buildIds.filter(buildId => buildId !== PINS.buildId), PINS.baselineBuildIds);
  assert.ok(Array.isArray(s.testers));
  ids(s.testers.map(t => t.id));
  sameSet(s.testers.map(t => t.id), [...new Set(s.groups.flatMap(g => g.testerIds))]);
  for (const t of s.testers) {
    ids(t.groupIds);
    sameSet(t.groupIds, s.groups.filter(g => g.testerIds.includes(t.id)).map(g => g.id));
  }
  assert.ok(Array.isArray(s.appStoreVersions) && s.appStoreVersions.length > 0, 'Missing existing Store versions');
  ids(s.appStoreVersions.map(v => v.id));
  for (const v of s.appStoreVersions) {
    assert.equal(typeof v.version, 'string'); assert.equal(typeof v.state, 'string');
    assert.equal(typeof v.releaseType, 'string'); assert.ok(own(v, 'buildId'));
    assert.ok(v.buildId === null || typeof v.buildId === 'string');
    assert.notEqual(v.buildId, PINS.buildId, 'Unexpected Store build association');
  }
  let assigned = false;
  if (linkedGroups.length === 0) assert.equal(b.internalBuildState, 'READY_FOR_BETA_TESTING');
  else {
    sameSet(linkedGroups, [PINS.ownerGroupId]);
    assert.equal(b.internalBuildState, 'IN_BETA_TESTING');
    assigned = true;
  }
  return {assigned};
}
function stable(s) {
  const copy = structuredClone(s);
  delete copy.observedAt;
  delete copy.build.internalBuildState;
  copy.buildGroupIds = [];
  copy.groups = copy.groups.map(g => ({...g, buildIds: sorted(g.buildIds.filter(x => x !== PINS.buildId)),
    testerIds: sorted(g.testerIds)})).sort((a, b) => a.id.localeCompare(b.id));
  copy.testers = copy.testers.map(t => ({...t, groupIds: sorted(t.groupIds)})).sort((a, b) => a.id.localeCompare(b.id));
  copy.appStoreVersions.sort((a, b) => a.id.localeCompare(b.id));
  copy.notes.sort((a, b) => a.id.localeCompare(b.id));
  return copy;
}
function sameSurroundings(a, b) {
  assert.equal(json(stable(a)), json(stable(b)), 'Unrelated groups/testers/notes/Store state changed');
}
function requestForBuild() {
  return {method: 'POST', path: '/v1/betaGroups/' + PINS.ownerGroupId + '/relationships/builds',
    body: {data: [{type: 'builds', id: PINS.buildId}]}};
}
export function planOwnerAvailability(receiptBytes, snapshot) {
  const r = receipt(receiptBytes);
  const result = inspect(snapshot);
  sameSurroundings(r.snapshot, snapshot);
  return {
    schemaVersion: 1, scope: 'EXISTING_OWNER_INTERNAL_TESTFLIGHT_ONLY',
    action: result.assigned ? 'ALREADY_AVAILABLE' : 'ADD_BUILD_TO_EXISTING_OWNER_GROUP',
    request: result.assigned ? null : requestForBuild(),
    intakeReceiptSha256: PINS.intakeReceiptSha256,
    preflightSha256: hash(json(snapshot)),
    databaseAccepted: false, publicReleaseAccepted: false
  };
}
export function requireAllowedMutation(request, receiptBytes, snapshot) {
  const plan = planOwnerAvailability(receiptBytes, snapshot);
  assert.equal(plan.action, 'ADD_BUILD_TO_EXISTING_OWNER_GROUP', 'No duplicate assignment');
  assert.deepEqual(request, plan.request, 'Only the exact existing-group build relationship POST is authorized');
  return true;
}
export function verifyOwnerPostflight(receiptBytes, before, after) {
  const plan = planOwnerAvailability(receiptBytes, before);
  const result = inspect(after);
  assert.equal(result.assigned, true, 'Owner beta not available');
  sameSurroundings(before, after);
  return {
    schemaVersion: 1, scope: 'EXISTING_OWNER_INTERNAL_TESTFLIGHT_ONLY', ownerAvailabilityConfirmed: true,
    sourceSha: PINS.sourceSha, sourceTree: PINS.sourceTree, version: PINS.version, build: PINS.build,
    buildId: PINS.buildId, ipaSha256: PINS.ipaSha256,
    groupIds: [PINS.ownerGroupId], testerIds: [PINS.ownerTesterId], internalBuildState: 'IN_BETA_TESTING',
    intakeReceiptSha256: PINS.intakeReceiptSha256, preflightSha256: plan.preflightSha256,
    postflightSha256: hash(json(after)), mutationExpected: plan.request !== null,
    databaseAccepted: false, publicReleaseAccepted: false
  };
}
