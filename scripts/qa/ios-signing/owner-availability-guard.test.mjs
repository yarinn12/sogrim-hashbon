import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source = readFileSync(new URL('./owner-availability-guard.mjs', import.meta.url), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = structuredClone;
const unbound = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const C = unbound.PINS;
const BUILD = '22222222-2222-4222-8222-222222222222';
const EXTERNAL = '33333333-3333-4333-8333-333333333333';
const EXTTESTER = '44444444-4444-4444-8444-444444444444';
const notes = 'בדיקת עדכון אישי: עיצוב משותף ושמירת נתונים.';
function snapshot() {
  return {schemaVersion: 1, observedAt: new Date().toISOString(),
    coverage: {appGroups: true, groupBuilds: true, groupTesters: true, buildGroups: true,
      individualTesters: true, storeVersions: true, storeBuildLinks: true, notes: true},
    app: {id: C.appId, bundleId: C.bundleId},
    build: {id: BUILD, appId: C.appId, version: '4.58', build: '194', platform: 'IOS',
      processingState: 'VALID', expired: false, usesNonExemptEncryption: false,
      internalBuildState: 'READY_FOR_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION'},
    notes: [{id: 'hebrew', locale: 'he', whatsNew: notes}],
    buildGroupIds: [], individualTesterIds: [], storeVersionId: null,
    groups: [
      {id: C.ownerGroupId, appId: C.appId, name: 'Yarin Internal Testing', isInternalGroup: true,
        hasAccessToAllBuilds: false, publicLinkEnabled: false, buildIds: [C.previousBuildId], testerIds: [C.ownerTesterId]},
      {id: EXTERNAL, appId: C.appId, name: 'Existing external group', isInternalGroup: false,
        hasAccessToAllBuilds: null, publicLinkEnabled: false, buildIds: ['old-external'], testerIds: [EXTTESTER]}
    ],
    testers: [{id: C.ownerTesterId, groupIds: [C.ownerGroupId]}, {id: EXTTESTER, groupIds: [EXTERNAL]}],
    appStoreVersions: [{id: 'store457', version: '4.57', state: 'PENDING_DEVELOPER_RELEASE',
      releaseType: 'MANUAL', buildId: 'old192'},
      {id: 'store455', version: '4.55', state: 'READY_FOR_SALE', releaseType: 'AFTER_APPROVAL', buildId: 'old191'}]
  };
}
let serial = 0;
async function fixture(receiptChange = () => {}) {
  const pins = {...C, sourceSha: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    signingToolSha: 'c'.repeat(40), intakeToolSha: 'd'.repeat(40),
    signedRunId: '101', signedJobId: '102', signedArtifactId: '103', signedArtifactSize: '104',
    signedZipSha256: 'e'.repeat(64), ipaSha256: 'f'.repeat(64),
    intakeRunId: '201', intakeJobId: '202', intakeArtifactId: '203',
    intakeZipSha256: '1'.repeat(64), notesSha256: sha(notes), buildId: BUILD};
  const r = {schemaVersion: 1, scope: 'PACKAGE_INTAKE_ONLY', hebrewReleaseNotesVerified: true,
    ...Object.fromEntries(Object.entries(pins).filter(([k]) => !['intakeReceiptSha256',
      'ownerGroupId', 'ownerTesterId', 'previousBuildId'].includes(k))), snapshot: snapshot()};
  receiptChange(r);
  const bytes = Buffer.from(JSON.stringify(r));
  pins.intakeReceiptSha256 = sha(bytes);
  const bound = source.replace(/export const PINS = Object.freeze\(\{[\s\S]*?\}\);/,
    'export const PINS = Object.freeze(' + JSON.stringify(pins) + ');');
  assert.notEqual(bound, source);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(bound + '\n//' + serial++).toString('base64'));
  return {mod, bytes, before: snapshot()};
}
function assigned(before) {
  const after = copy(before);
  after.groups.find(g => g.id === C.ownerGroupId).buildIds.push(BUILD);
  after.buildGroupIds = [C.ownerGroupId]; after.build.internalBuildState = 'IN_BETA_TESTING';
  after.observedAt = new Date().toISOString();
  return after;
}
test('checked-in PENDING scaffold blocks activation before any supplied input is consumed', () => {
  assert.throws(() => unbound.requireBoundPins(), /PENDING/);
  assert.throws(() => unbound.planOwnerAvailability(Buffer.from('{}'), undefined), /PENDING/);
});
test('normal preflight proposes exactly one existing-owner relationship POST; valid postflight preserves old access', async () => {
  const {mod, bytes, before} = await fixture();
  const plan = mod.planOwnerAvailability(bytes, before);
  assert.deepEqual(plan.request, {method: 'POST', path: '/v1/betaGroups/' + C.ownerGroupId + '/relationships/builds',
    body: {data: [{type: 'builds', id: BUILD}]}});
  assert.equal(mod.requireAllowedMutation(plan.request, bytes, before), true);
  const proof = mod.verifyOwnerPostflight(bytes, before, assigned(before));
  assert.equal(proof.ownerAvailabilityConfirmed, true); assert.equal(proof.mutationExpected, true);
  assert.deepEqual(proof.testerIds, [C.ownerTesterId]); assert.equal(proof.publicReleaseAccepted, false);
  assert.equal(proof.databaseAccepted, false); assert.equal(proof.ipaSha256, 'f'.repeat(64));
});
test('already-correct association is idempotent and cannot propose a second POST', async () => {
  const {mod, bytes, before} = await fixture(); const current = assigned(before);
  assert.equal(mod.planOwnerAvailability(bytes, current).request, null);
  assert.equal(mod.planOwnerAvailability(bytes, current).action, 'ALREADY_AVAILABLE');
  assert.throws(() => mod.requireAllowedMutation({method: 'POST'}, bytes, current), /duplicate/);
  assert.equal(mod.verifyOwnerPostflight(bytes, current, current).mutationExpected, false);
});
for (const [key, value] of [['id', 'another-build'], ['appId', 'another-app'], ['version', '4.57'],
  ['build', '193'], ['platform', 'MAC_OS'], ['processingState', 'PROCESSING'], ['expired', true],
  ['usesNonExemptEncryption', null], ['internalBuildState', 'IN_BETA_TESTING'],
  ['externalBuildState', 'IN_BETA_REVIEW'], ['externalBuildState', 'IN_BETA_TESTING']])
  test('preflight rejects wrong build identity/state: ' + key + '=' + value, async () => {
    const {mod, bytes, before} = await fixture(); before.build[key] = value;
    assert.throws(() => mod.planOwnerAvailability(bytes, before));
  });
const mutations = [
  ['wrong app', s => s.app.id = 'other'],
  ['missing note identity', s => delete s.notes[0].id],
  ['empty existing Store versions', s => s.appStoreVersions = []],
  ['string manual flag', s => s.groups[0].hasAccessToAllBuilds = 'false'],
  ['unknown external flag', s => delete s.groups[1].hasAccessToAllBuilds],
  ['wrong bundle', s => s.app.bundleId = 'other'],
  ['unknown collection completeness', s => delete s.coverage.groupTesters],
  ['stale snapshot', s => s.observedAt = new Date(Date.now() - 121000).toISOString()],
  ['future snapshot', s => s.observedAt = new Date(Date.now() + 60000).toISOString()],
  ['changed Hebrew notes', s => s.notes[0].whatsNew += ' changed'],
  ['missing Hebrew notes', s => s.notes = []],
  ['duplicate Hebrew notes', s => s.notes.push(copy(s.notes[0]))],
  ['owner group removed', s => s.groups.shift()],
  ['owner is external', s => s.groups[0].isInternalGroup = false],
  ['automatic owner access', s => s.groups[0].hasAccessToAllBuilds = true],
  ['unknown manual owner flag', s => s.groups[0].hasAccessToAllBuilds = null],
  ['missing owner manual flag', s => delete s.groups[0].hasAccessToAllBuilds],
  ['second owner tester', s => s.groups[0].testerIds.push(EXTTESTER)],
  ['existing owner tester replaced', s => s.groups[0].testerIds = [EXTTESTER]],
  ['previous beta access removed', s => s.groups[0].buildIds = []],
  ['external public link', s => s.groups[1].publicLinkEnabled = true],
  ['unknown external public link', s => s.groups[1].publicLinkEnabled = null],
  ['external automatic access', s => s.groups[1].hasAccessToAllBuilds = true],
  ['individual target exposure', s => s.individualTesterIds.push(C.ownerTesterId)],
  ['target Store linkage', s => s.storeVersionId = 'store458'],
  ['reverse Store linkage', s => s.appStoreVersions[0].buildId = BUILD],
  ['unrelated Store state changed', s => s.appStoreVersions[0].state = 'READY_FOR_SALE'],
  ['unrelated Store build changed', s => s.appStoreVersions[1].buildId = 'another'],
  ['unrelated tester group changed', s => s.testers[1].groupIds = []],
  ['group membership inconsistent', s => s.groups[1].testerIds = []],
  ['new group', s => s.groups.push({...copy(s.groups[1]), id: 'new-group', testerIds: []})],
  ['duplicate group', s => s.groups.push(copy(s.groups[1]))],
  ['duplicate relationship', s => s.groups[0].buildIds.push(C.previousBuildId)],
  ['inconsistent build relationship', s => s.buildGroupIds.push(C.ownerGroupId)],
  ['external build exposure', s => { s.groups[1].buildIds.push(BUILD); s.buildGroupIds = [EXTERNAL]; }],
  ['new tester resource', s => s.testers.push({id: 'new-tester', groupIds: []})]
];
for (const [name, mutate] of mutations) test('preflight stops: ' + name, async () => {
  const {mod, bytes, before} = await fixture(); mutate(before);
  assert.throws(() => mod.planOwnerAvailability(bytes, before));
});
for (const [name, mutate] of [
  ['PATCH', x => x.method = 'PATCH'], ['DELETE', x => x.method = 'DELETE'],
  ['foreign group', x => x.path = x.path.replace(C.ownerGroupId, EXTERNAL)],
  ['create group', x => x.path = '/v1/betaGroups'], ['invite tester', x => x.path = '/v1/betaTesterInvitations'],
  ['tester association', x => x.path = '/v1/builds/' + BUILD + '/relationships/individualTesters'],
  ['Store release', x => x.path = '/v1/appStoreVersionReleaseRequests'],
  ['second build', x => x.body.data.push({type: 'builds', id: C.previousBuildId})],
  ['different build', x => x.body.data[0].id = C.previousBuildId],
  ['unexpected flags', x => x.body.attributes = {hasAccessToAllBuilds: true}],
  ['unexpected request option', x => x.retry = 1]
]) test('mutation allowlist rejects: ' + name, async () => {
  const {mod, bytes, before} = await fixture(); const request = mod.planOwnerAvailability(bytes, before).request;
  mutate(request); assert.throws(() => mod.requireAllowedMutation(request, bytes, before));
});
test('receipt substitution or unverified notes cannot enable assignment', async () => {
  const f = await fixture(); assert.throws(() => f.mod.planOwnerAvailability(Buffer.from('{}'), f.before), /digest/);
  const g = await fixture(r => r.hebrewReleaseNotesVerified = false);
  assert.throws(() => g.mod.planOwnerAvailability(g.bytes, g.before));
});
test('an intake receipt with pre-existing distribution is not accepted as zero-distribution intake', async () => {
  const {mod, bytes, before} = await fixture(r => r.snapshot = assigned(r.snapshot));
  assert.throws(() => mod.planOwnerAvailability(bytes, before), /zero distribution/);
});
test('postflight never accepts a missing assignment or an unconfirmed beta state', async () => {
  const {mod, bytes, before} = await fixture();
  assert.throws(() => mod.verifyOwnerPostflight(bytes, before, before));
  const after = assigned(before); after.build.internalBuildState = 'READY_FOR_BETA_TESTING';
  assert.throws(() => mod.verifyOwnerPostflight(bytes, before, after));
});
for (const [name, mutate] of mutations.filter(([name]) => !['owner group removed', 'owner is external',
  'group membership inconsistent', 'inconsistent build relationship'].includes(name)))
  test('postflight stops unexpected change: ' + name, async () => {
    const {mod, bytes, before} = await fixture(); const after = assigned(before); mutate(after);
    assert.throws(() => mod.verifyOwnerPostflight(bytes, before, after));
  });
test('order-only API collection changes are harmless while null external flags remain null', async () => {
  const {mod, bytes, before} = await fixture();
  before.groups.reverse(); before.testers.reverse(); before.appStoreVersions.reverse();
  const after = assigned(before);
  assert.equal(mod.verifyOwnerPostflight(bytes, before, after).ownerAvailabilityConfirmed, true);
  assert.equal(after.groups.find(g => g.id === EXTERNAL).hasAccessToAllBuilds, null);
});
