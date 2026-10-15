import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Preparation only. No credential reader, CLI, workflow, filesystem or network import.
export const AUDIT_PINS = Object.freeze({
  appId: '6809952514', bundleId: 'com.sogrimhashbon.app', version: '4.58', build: '194',
  sourceSha: 'PENDING', sourceTree: 'PENDING', sourceBranch: 'PENDING',
  qaRun: 'PENDING', windowsRun: 'PENDING', fontRun: 'PENDING', authRun: 'PENDING',
  auditToolSha: 'PENDING', auditToolTree: 'PENDING', auditRun: 'PENDING', auditJob: 'PENDING',
  collectorSha256: 'PENDING', clientSha256: 'PENDING', buildId: 'PENDING',
  signingToolSha: 'PENDING', signingRun: 'PENDING', signingJob: 'PENDING',
  signingArtifact: 'PENDING', signingZipSha256: 'PENDING', ipaSha256: 'PENDING',
  intakeToolSha: 'PENDING', intakeToolTree: 'PENDING', intakeRun: 'PENDING',
  intakeJob: 'PENDING', intakeArtifact: 'PENDING', intakeArtifactSize: 'PENDING',
  intakeZipSha256: 'PENDING', intakePostflightSha256: 'PENDING'
});
const APP = '6809952514', BUNDLE = 'com.sogrimhashbon.app';
const ORIGIN = 'https://api.appstoreconnect.apple.com';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GROUP_FIELDS = 'name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function requireAuditBindings() {
  assert.equal(AUDIT_PINS.appId, APP);
  assert.equal(AUDIT_PINS.bundleId, BUNDLE);
  assert.equal(AUDIT_PINS.version, '4.58');
  assert.equal(AUDIT_PINS.build, '194');
  for (const [key, value] of Object.entries(AUDIT_PINS)) {
    assert.ok(typeof value === 'string' && value && value !== 'PENDING', 'Unbound audit pin: ' + key);
  }
  assert.match(AUDIT_PINS.buildId, UUID);
}

// Deliberately has no credential/client arguments and cannot invoke collection.
// Filling pins is insufficient: the missing pre-key integration must be implemented/reviewed.
export async function runOwnerReadOnlyAudit() {
  requireAuditBindings();
  throw new Error('BLOCKED: shared successful-intake/evidence-artifact verifier and independent audit namespace/provenance integration are missing; do not load Apple keys.');
}

function appleUrl(value) {
  assert.ok(typeof value === 'string' && !/[\s\\#]/.test(value), 'Invalid Apple URL');
  assert.ok(!/%(?:2e|2f|5c)/i.test(value.split('?')[0]), 'Encoded route segment');
  const u = new URL(value, ORIGIN);
  assert.equal(u.origin, ORIGIN, 'Foreign Apple origin');
  assert.ok(!u.username && !u.password && !u.hash, 'URL credentials/fragment forbidden');
  assert.ok(u.pathname.startsWith('/v1/') && !value.split('?')[0].split('/').includes('..'));
  return u;
}

function queryIs(u, required, paged = false) {
  const values = {...required, ...(paged ? {limit: '200'} : {})};
  const allowed = new Set([...Object.keys(values), ...(paged ? ['cursor'] : [])]);
  for (const [key, value] of u.searchParams) {
    assert.ok(allowed.has(key), 'Unapproved query key');
    assert.equal(u.searchParams.getAll(key).length, 1, 'Duplicate query key');
    if (key === 'cursor') assert.ok(value.length > 0, 'Empty cursor');
  }
  for (const [key, value] of Object.entries(values)) assert.equal(u.searchParams.get(key), value, 'Missing/changed scope');
}

// Private preparation helper. Collector owns pagination, totals, type/identity validation.
// This wrapper narrows the generic existing Apple client to collector79ff's scoped GETs.
function scopedCollectorClient(createAppStoreClient, credentials, fetchImpl, buildId) {
  assert.match(buildId, UUID);
  const groups = new Set(), stores = new Set(), builds = new Set([buildId]);
  let expectedFetch = null, busy = false;
  const client = createAppStoreClient(credentials, {
    fetchImpl: async (input, options) => {
      const u = appleUrl(input instanceof URL ? input.href : input);
      assert.equal(u.href, expectedFetch, 'Fetch outside approved request');
      assert.equal(options?.method, 'GET');
      assert.equal(options?.redirect, 'error');
      assert.ok(!Object.hasOwn(options, 'body'), 'Body forbidden');
      return fetchImpl(input, options);
    }
  });
  return async (path, options) => {
    assert.ok(!busy, 'Concurrent collector request forbidden');
    assert.deepEqual(options, {method: 'GET', redirect: 'error'});
    const u = appleUrl(path), p = u.pathname;
    let grants = null;
    if (p === '/v1/apps/' + APP) queryIs(u, {'fields[apps]': 'bundleId'});
    else if (p === '/v1/builds/' + buildId) queryIs(u, {'fields[builds]': 'version,processingState,expired,usesNonExemptEncryption'});
    else if (p === '/v1/builds/' + buildId + '/preReleaseVersion') queryIs(u, {'fields[preReleaseVersions]': 'version,platform'});
    else if (p === '/v1/builds/' + buildId + '/buildBetaDetail') queryIs(u, {'fields[buildBetaDetails]': 'internalBuildState,externalBuildState'});
    else if (p === '/v1/builds/' + buildId + '/betaBuildLocalizations') queryIs(u, {'fields[betaBuildLocalizations]': 'locale,whatsNew'}, true);
    else if (p === '/v1/apps/' + APP + '/betaGroups') {
      queryIs(u, {'fields[betaGroups]': GROUP_FIELDS}, true); grants = ['betaGroups', groups];
    } else if (p === '/v1/betaGroups') {
      queryIs(u, {'filter[app]': APP, 'filter[builds]': buildId, 'fields[betaGroups]': GROUP_FIELDS}, true);
    } else if (p === '/v1/builds/' + buildId + '/relationships/individualTesters') queryIs(u, {}, true);
    else if (p === '/v1/builds/' + buildId + '/relationships/appStoreVersion') queryIs(u, {});
    else if (p === '/v1/apps/' + APP + '/appStoreVersions') {
      queryIs(u, {'filter[platform]': 'IOS', 'fields[appStoreVersions]': 'platform,versionString,appStoreState,releaseType'}, true);
      grants = ['appStoreVersions', stores];
    } else {
      const match = p.match(/^\/v1\/(builds|betaGroups|appStoreVersions)\/([a-f0-9-]+)(.*)$/i);
      assert.ok(match, 'Route outside collector scope');
      const [, type, id, suffix] = match;
      assert.match(id, UUID);
      if (type === 'builds') {
        assert.ok(builds.has(id) && suffix === '/app', 'Unscoped build');
        queryIs(u, {'fields[apps]': 'bundleId'});
      } else if (type === 'betaGroups') {
        assert.ok(groups.has(id), 'Unscoped group');
        if (suffix === '') queryIs(u, {'fields[betaGroups]': GROUP_FIELDS});
        else if (suffix === '/relationships/app') queryIs(u, {});
        else {
          assert.ok(['/relationships/builds', '/relationships/betaTesters'].includes(suffix), 'Unapproved group relation');
          queryIs(u, {}, true);
          if (suffix === '/relationships/builds') grants = ['builds', builds];
        }
      } else {
        assert.ok(stores.has(id) && suffix === '/build', 'Unscoped store version');
        queryIs(u, {'fields[builds]': 'version'}); grants = ['builds', builds];
      }
    }
    busy = true; expectedFetch = u.href;
    try {
      const result = await client(u.pathname + u.search, {method: 'GET', redirect: 'error'});
      if (grants && result?.data !== null) {
        const rows = Array.isArray(result?.data) ? result.data : [result?.data];
        for (const row of rows) {
          assert.equal(row?.type, grants[0], 'Unexpected granted resource type');
          assert.match(row.id, UUID); grants[1].add(row.id);
        }
      }
      return result; // No response transformation; collector validates complete identity.
    } finally { expectedFetch = null; busy = false; }
  };
}

function auditOutputBytes(result, provenance) {
  assert.equal(result?.snapshot?.app?.id, APP);
  assert.equal(result.snapshot.app.bundleId, BUNDLE);
  assert.equal(result.snapshot.build.id, AUDIT_PINS.buildId);
  assert.equal(result.snapshot.build.appId, APP);
  assert.equal(result.snapshot.build.version, '4.58');
  assert.equal(result.snapshot.build.build, '194');
  assert.equal(result.snapshot.build.platform, 'IOS');
  assert.equal(result?.evidence?.complete, true);
  assert.equal(result.evidence.mode, 'INJECTED_API_GET_ONLY');
  assert.ok(Array.isArray(result.evidence.requests) && result.evidence.requests.length > 0);
  assert.ok(result.evidence.requests.every(item => item.method === 'GET' && item.completed === true));
  assert.equal(result.evidence.appId, APP);
  assert.equal(result.evidence.buildId, AUDIT_PINS.buildId);
  // Provenance is an input to the private template, NOT an implemented attestation API.
  // The absent pre-key integration must authenticate it before any future activation.
  assert.equal(provenance?.auditMode, 'INDEPENDENT_POST_INTAKE_GET_ONLY');
  assert.deepEqual(provenance.bindings, AUDIT_PINS);
  const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
  const snapshot = encode(result.snapshot), evidence = encode(result.evidence);
  const provenanceBytes = encode({...provenance, outputSha256: {
    snapshot: digest(snapshot), evidence: digest(evidence)
  }});
  return {snapshot, evidence, provenance: provenanceBytes};
}

// Private wiring template, unreachable from the exported entry. No receipt/access decision.
async function collectAuditTemplate(inputs) {
  requireAuditBindings();
  const {createAppStoreClient, collectOwnerSnapshot, credentials, fetchImpl, provenance} = inputs;
  const api = scopedCollectorClient(createAppStoreClient, credentials, fetchImpl, AUDIT_PINS.buildId);
  return auditOutputBytes(await collectOwnerSnapshot(api, {appId: APP, buildId: AUDIT_PINS.buildId}), provenance);
}
