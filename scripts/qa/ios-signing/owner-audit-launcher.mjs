import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {realpathSync,lstatSync,readFileSync} from 'node:fs';
import {posix,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runSignedAuditPreKey} from './audit-prekey-bootstrap.mjs';

const APP='6809952514',BUNDLE='com.sogrimhashbon.app';
const ORIGIN='https://api.appstoreconnect.apple.com';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GROUP_FIELDS='name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled';
const digest=b=>createHash('sha256').update(b).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
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


function readExistingAppleCredentials() {
  // Deliberately lazy. No environment enumeration or Apple property read occurs at import.
  return {issuerId:process.env.APPSTORE_ISSUER_ID,keyId:process.env.APPSTORE_API_KEY_ID,
    privateKey:process.env.APPSTORE_API_PRIVATE_KEY};
}
async function importVerified(prekey,relative) {
  const expected=prekey.validatedPolicy.toolkit.fileSha256[relative];
  assert.match(expected??'',/^[a-f0-9]{64}$/);
  assert.ok(!relative.startsWith('/')&&posix.normalize(relative)===relative&&!relative.includes('\\')
    &&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'));
  const full=join(prekey.toolkitRoot,relative);
  const before=lstatSync(full);assert.ok(before.isFile()&&!before.isSymbolicLink());
  assert.equal(realpathSync(full),full);const bytes=readFileSync(full);
  assert.equal(digest(bytes),expected,'Post-gate module fingerprint changed');
  const after=lstatSync(full);
  for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);
  assert.equal(realpathSync(full),full);
  return import(pathToFileURL(full).href);
}
function validatePrekey(prekey) {
  assert.equal(prekey.scope,'SIGNED_AUDIT_PREKEY_PREPARATION_ONLY');
  for(const key of ['appleKeysAuthorized','ownerAvailabilityAccepted','databaseAccepted','publicReleaseAccepted','distributionAllowed'])
    assert.equal(prekey[key],false);
  const p=prekey.validatedPolicy,c=prekey.context,s=prekey.signatureProof;
  assert.ok(p&&c&&s);assert.match(p.toolkit.fileSha256['scripts/qa/ios-signing/owner-audit-launcher.mjs']??'',/^[a-f0-9]{64}$/);
  assert.equal(c.auditMode,'INDEPENDENT_POST_INTAKE_GET_ONLY');
  assert.equal(c.scope,'AUDIT_EXECUTION_CONTEXT_PREPARATION_ONLY');
  assert.match(c.auditRun,/^[1-9][0-9]*$/);assert.match(c.auditJob,/^[1-9][0-9]*$/);
  assert.equal(c.runAttempt,1);assert.equal(c.runNumber,1);
  assert.notEqual(c.auditRun,p.intakeRun);assert.notEqual(c.auditRun,p.signingRun);
  assert.equal(c.sourceSha,p.source.sha);assert.equal(c.sourceTree,p.source.tree);
  assert.equal(c.controllerSha,p.controller.sha);assert.equal(c.controllerTree,p.controller.tree);
  assert.equal(c.auditToolSha,p.toolkit.sha);assert.equal(c.auditToolTree,p.toolkit.tree);
  assert.equal(c.reviewedPolicySha256,s.executionPolicySha256);
  assert.equal(digest(prekey.reviewedPolicyBytes),s.executionPolicySha256);
  assert.deepEqual(JSON.parse(prekey.reviewedPolicyBytes),p);
  assert.equal(p.build.appId,APP);assert.equal(p.build.bundleId,BUNDLE);
  assert.equal(p.build.platform,'IOS');assert.equal(p.build.version,'4.58');assert.equal(p.build.build,'194');
  assert.match(p.build.buildId,UUID);assert.match(p.build.ipaSha256,/^[a-f0-9]{64}$/);
  assert.equal(prekey.gates.successfulIntake.receiptSha256,p.inputs.fileSha256['successful-intake-receipt.json']);
  assert.equal(basename(prekey.toolkitRoot),'audit-tools');
  for(const [name,digestValue] of Object.entries(c.apiSha256))
    assert.equal(digest(prekey.auditApiCaptures[name].bytes),digestValue,'Original running-context API bytes');
  assert.deepEqual(c.inputSha256,p.inputs.fileSha256);
  for(const name of ['ref','tag','blob'])assert.ok(Buffer.isBuffer(prekey.bootstrapCaptures[name].bytes));
  return {p,c,s};
}
async function collectValidatedAudit(prekey,credentialGetter,fetchImpl) {
  const {p,c,s}=validatePrekey(prekey);
  const {createAppStoreClient}=await importVerified(prekey,'scripts/lib/app-store-release.mjs');
  const {collectOwnerSnapshot}=await importVerified(prekey,'scripts/qa/ios-signing/collect-owner-snapshot.mjs');
  // This is AFTER the direct real bootstrap, all live gates, context and import checks.
  const credentials=await credentialGetter();
  const api=scopedCollectorClient(createAppStoreClient,credentials,fetchImpl,p.build.buildId);
  const result=await collectOwnerSnapshot(api,{appId:APP,buildId:p.build.buildId});
  assert.equal(result.snapshot?.app?.id,APP);assert.equal(result.snapshot.app.bundleId,BUNDLE);
  assert.equal(result.snapshot.build.id,p.build.buildId);assert.equal(result.snapshot.build.appId,APP);
  assert.equal(result.snapshot.build.version,'4.58');assert.equal(result.snapshot.build.build,'194');
  assert.equal(result.snapshot.build.platform,'IOS');
  assert.equal(result.evidence?.complete,true);assert.equal(result.evidence.appId,APP);
  assert.equal(result.evidence.buildId,p.build.buildId);
  assert.ok(result.evidence.requests.every(r=>r.method==='GET'&&r.completed===true));
  const snapshot=encode(result.snapshot),evidence=encode(result.evidence);
  const provenance=encode({
    schemaVersion:1,scope:'INDEPENDENT_POST_INTAKE_GET_ONLY',appId:APP,bundleId:BUNDLE,platform:'IOS',
    version:'4.58',build:'194',buildId:p.build.buildId,ipaSha256:p.build.ipaSha256,
    sourceSha:p.source.sha,sourceTree:p.source.tree,sourceBranch:p.source.branch,
    signingRun:p.signingRun,intakeRun:p.intakeRun,
    signatureProof:s,executionPolicy:p,runtime:c,
    observedAt:result.snapshot.observedAt,evidenceStartedAt:result.evidence.startedAt,
    evidenceCompletedAt:result.evidence.completedAt,
    outputSha256:{snapshot:digest(snapshot),evidence:digest(evidence)},
    executionContextSha256:digest(encode(c)),
    bootstrapApiSha256:Object.fromEntries(Object.entries(prekey.bootstrapCaptures).map(([n,r])=>[n,digest(r.bytes)])),
    intakeReceiptSha256:prekey.gates.successfulIntake.receiptSha256,
    sourceCiRunIds:prekey.gates.sourceCi.ci.map(r=>r.id),
    collectorTransport:'REVIEWED_EXISTING_APPLE_CLIENT_SCOPED_GET_ONLY',
    transportAttestation:result.evidence.transportAttestation,
    ownerAvailabilityAccepted:false,databaseAccepted:false,publicReleaseAccepted:false,distributionAllowed:false
  });
  const files={
    'owner-snapshot.json':snapshot,'owner-snapshot-evidence.json':evidence,
    'audit-execution-context.json':encode(c),
    'audit-controller-commit.json':Buffer.from(prekey.auditApiCaptures.controllerCommit.bytes),
    'audit-tool-commit.json':Buffer.from(prekey.auditApiCaptures.toolkitCommit.bytes),
    'audit-context-run.json':Buffer.from(prekey.auditApiCaptures.run.bytes),
    'audit-context-jobs.json':Buffer.from(prekey.auditApiCaptures.jobs.bytes),
    'audit-provenance.json':provenance,
    'audit-signature-proof.json':encode(s),
    'audit-source-ci-gate.json':encode(prekey.gates.sourceCi),
    'audit-successful-intake-gate.json':encode(prekey.gates.successfulIntake),
    'audit-policy-ref.json':Buffer.from(prekey.bootstrapCaptures.ref.bytes),
    'audit-policy-tag.json':Buffer.from(prekey.bootstrapCaptures.tag.bytes),
    'audit-policy-blob.json':Buffer.from(prekey.bootstrapCaptures.blob.bytes)
  };
  assert.ok(Date.parse(c.checkedAt)<=Date.parse(result.snapshot.observedAt),'Context must precede collector');
  return {snapshot,evidence,provenance,files};
}
// No passed/gate/snapshot callback exists. A caller cannot supply a pre-key receipt to this entry.
export async function runOwnerAuditLauncher(anchors,options) {
  // Real bootstrap rejects PENDING before any options getter can supply credentials.
  const {requireSignedPolicyAnchors}=await import('./signed-audit-policy.mjs');
  requireSignedPolicyAnchors(anchors);
  const {githubToken,env=process.env,githubFetch=globalThis.fetch,appleFetch=globalThis.fetch,
    now=()=>new Date().toISOString(),pythonExecutable='python3',credentialGetter=readExistingAppleCredentials}=options??{};
  assert.equal(typeof credentialGetter,'function');
  const prekey=await runSignedAuditPreKey(anchors,githubToken,{env,fetchImpl:githubFetch,now,pythonExecutable});
  return collectValidatedAudit(prekey,credentialGetter,appleFetch);
}
