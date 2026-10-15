import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';

export const SIGNED_POLICY_ANCHORS = Object.freeze({
  repository: 'yarinn12/sogrim-hashbon', tag: 'PENDING', publicSpkiBase64: 'PENDING',
  controllerBranch: 'PENDING', workflowPath: 'PENDING', jobKey: 'PENDING', jobName: 'PENDING'
});
export const POLICY_ALGORITHM = 'ECDSA-P256-SHA256-P1363';
const REPO = 'yarinn12/sogrim-hashbon', API = 'https://api.github.com/repos/' + REPO;
const freezeJson=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freezeJson);Object.freeze(x);}return x;};
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const sha = x => assert.match(x ?? '', /^[a-f0-9]{40}$/);
function exact(x, names) {
  assert.ok(x && Object.getPrototypeOf(x) === Object.prototype);
  assert.deepEqual(Object.keys(x).sort(), [...names].sort());
}
function originalJson(raw) {
  assert.ok(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 16 * 1024 * 1024);
  const text = raw.toString('utf8'); assert.ok(Buffer.from(text).equals(raw));
  return JSON.parse(text);
}
function canonicalJson(raw) {
  const value = originalJson(raw);
  assert.ok(Buffer.from(JSON.stringify(value) + '\n').equals(raw), 'Noncanonical signed JSON');
  return value; // Rejects duplicate keys/extra whitespace without rewriting signed bytes.
}
function base64(value) {
  assert.ok(typeof value === 'string' && value && value.length <= 24 * 1024 * 1024);
  assert.match(value, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
  const bytes = Buffer.from(value, 'base64'); assert.equal(bytes.toString('base64'), value);
  return bytes;
}
export function requireSignedPolicyAnchors(a) {
  exact(a, Object.keys(SIGNED_POLICY_ANCHORS));
  for (const value of Object.values(a)) assert.ok(typeof value === 'string' && value && value !== 'PENDING', 'Signed-policy anchor remains PENDING');
  assert.equal(a.repository, REPO);
  assert.match(a.tag, /^checkpoint\/ios194-owner-audit-[a-z0-9-]+$/);
  assert.match(a.controllerBranch, /^codex\/[a-z0-9-]+$/);
  assert.match(a.workflowPath, /^\.github\/workflows\/[a-z0-9-]+\.yml$/);
  assert.match(a.jobKey, /^[A-Za-z_][A-Za-z0-9_-]*$/); assert.ok(a.jobName.trim());
  const der = base64(a.publicSpkiBase64);
  const key = createPublicKey({key: der, format: 'der', type: 'spki'});
  assert.equal(key.asymmetricKeyType, 'ec');
  assert.equal(key.asymmetricKeyDetails?.namedCurve, 'prime256v1');
  assert.ok(key.export({format: 'der', type: 'spki'}).equals(der), 'Canonical public SPKI required');
  return key;
}
export function policySigningBytes(tag, raw) {
  assert.match(tag, /^checkpoint\/ios194-owner-audit-[a-z0-9-]+$/);
  assert.ok(Buffer.isBuffer(raw));
  return Buffer.concat([Buffer.from('SOGRIM_OWNER_AUDIT_POLICY_V1\0' + REPO + '\0' + tag + '\0'), raw]);
}
// The implementation performs the request. Capture metadata is never accepted as proof from a caller.
export function createAuthenticatedGitHub(token, allowedUrls, {fetchImpl = globalThis.fetch, now = () => new Date().toISOString()} = {}) {
  assert.ok(typeof token === 'string' && token && !/[\s\r\n]/.test(token), 'GitHub token required');
  const allowed = new Set(allowedUrls);
  for (const url of allowed) {
    assert.ok(typeof url === 'string' && url.startsWith(API + '/'));
    assert.equal(new URL(url).href, url); assert.ok(!/[\s\\#]/.test(url));
  }
  const captures = [];
  async function read(url) {
    assert.ok(allowed.has(url), 'GitHub URL outside phase scope');
    const startedAt = now();
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'}
    });
    assert.equal(response.status, 200, 'GitHub read failed');
    assert.equal(response.redirected, false); assert.equal(response.url, url, 'GitHub response origin changed');
    const chunks = []; let size = 0;
    const reader = response.body?.getReader(); assert.ok(reader, 'Original response stream required');
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength; assert.ok(size <= 16 * 1024 * 1024, 'GitHub response budget');
        chunks.push(Buffer.from(value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks), completedAt = now();
    originalJson(bytes); // JSON validation; keep original bytes.
    const capture = {url, method: 'GET', redirect: 'error', startedAt, completedAt, bytes};
    captures.push(capture); return capture;
  }
  return Object.freeze({
    read,
    async guardFetch(url, init) {
      assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
      assert.ok(!Object.hasOwn(init, 'body'), 'Body forbidden');
      assert.equal(init?.headers?.Authorization, 'Bearer ' + token);
      const capture = await read(url);
      return new Response(Buffer.from(capture.bytes), {status: 200, headers: {'Content-Type': 'application/json'}});
    },
    captures: () => captures.map(c => ({...c, bytes: Buffer.from(c.bytes)}))
  });
}
export async function authenticateSignedPolicy(a, token, options) {
  const publicKey = requireSignedPolicyAnchors(a); // Before token/fetch access.
  const refUrl = API + '/git/ref/tags/' + a.tag;
  const refCapture = await createAuthenticatedGitHub(token, [refUrl], options).read(refUrl);
  const ref = originalJson(refCapture.bytes);
  assert.equal(ref.ref, 'refs/tags/' + a.tag); assert.equal(ref.url, API + '/git/refs/tags/' + a.tag);
  assert.equal(ref.object?.type, 'tag'); sha(ref.object.sha);
  const tagSha = ref.object.sha, tagUrl = API + '/git/tags/' + tagSha;
  assert.equal(ref.object.url, tagUrl);
  const tagCapture = await createAuthenticatedGitHub(token, [tagUrl], options).read(tagUrl);
  const tag = originalJson(tagCapture.bytes);
  assert.equal(tag.sha, tagSha); assert.equal(tag.url, tagUrl); assert.equal(tag.tag, a.tag);
  assert.equal(tag.object?.type, 'blob', 'Direct annotated-tag-to-blob required'); sha(tag.object.sha);
  const blobSha = tag.object.sha, blobUrl = API + '/git/blobs/' + blobSha;
  assert.equal(tag.object.url, blobUrl);
  assert.equal(typeof tag.message, 'string');
  const annotation = canonicalJson(Buffer.from(tag.message));
  exact(annotation, ['schemaVersion', 'scope', 'repository', 'tag', 'algorithm', 'keyFingerprint',
    'policySha256', 'policyBlobSha', 'controllerSha', 'toolkitSha', 'signatureBase64']);
  assert.equal(annotation.schemaVersion, 1); assert.equal(annotation.scope, 'INDEPENDENT_POST_INTAKE_GET_ONLY');
  assert.equal(annotation.repository, REPO); assert.equal(annotation.tag, a.tag);
  assert.equal(annotation.algorithm, POLICY_ALGORITHM);
  assert.equal(annotation.keyFingerprint, digest(base64(a.publicSpkiBase64)));
  sha(annotation.controllerSha); sha(annotation.toolkitSha);
  assert.equal(annotation.policyBlobSha, blobSha); assert.match(annotation.policySha256 ?? '', /^[a-f0-9]{64}$/);
  const signature = base64(annotation.signatureBase64); assert.equal(signature.length, 64);
  const blobCapture = await createAuthenticatedGitHub(token, [blobUrl], options).read(blobUrl);
  const blob = originalJson(blobCapture.bytes);
  assert.equal(blob.sha, blobSha); assert.equal(blob.url, blobUrl); assert.equal(blob.encoding, 'base64');
  assert.ok(typeof blob.content === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(blob.content));
  const raw = base64(blob.content.replace(/[\r\n]/g, ''));
  assert.ok(Number.isSafeInteger(blob.size) && blob.size === raw.length && raw.length <= 16 * 1024 * 1024);
  assert.equal(digest(Buffer.concat([Buffer.from('blob ' + raw.length + '\0'), raw]), 'sha1'), blobSha, 'Git blob SHA mismatch');
  assert.equal(digest(raw), annotation.policySha256, 'Original policy SHA256 mismatch');
  assert.equal(verify('sha256', policySigningBytes(a.tag, raw),
    {key: publicKey, dsaEncoding: 'ieee-p1363'}, signature), true, 'Root policy signature invalid');
  const signed = canonicalJson(raw);
  exact(signed, ['schemaVersion', 'repository', 'tag', 'scope', 'appId', 'platform', 'version', 'build', 'sourceRuns', 'executionPolicyBase64']);
  assert.equal(signed.schemaVersion, 1); assert.equal(signed.repository, REPO); assert.equal(signed.tag, a.tag);
  assert.equal(signed.scope, 'INDEPENDENT_POST_INTAKE_GET_ONLY'); assert.equal(signed.appId, '6809952514');
  assert.equal(signed.platform, 'IOS'); assert.equal(signed.version, '4.58'); assert.equal(signed.build, '194');
  exact(signed.sourceRuns,['qaRun','windowsRun','fontRun','authRun']);
  const runIds=Object.values(signed.sourceRuns);runIds.forEach(id=>assert.match(id,/^[1-9][0-9]*$/));
  assert.equal(new Set(runIds).size,4);
  const policyBytes = base64(signed.executionPolicyBase64), p = canonicalJson(policyBytes);
  assert.equal(p.controller.namespace,'audit-controller');assert.equal(p.toolkit.namespace,'audit-tools');
  assert.equal(p.controller.sha, annotation.controllerSha); assert.equal(p.toolkit.sha, annotation.toolkitSha);
  assert.equal(p.controller.branch, a.controllerBranch); assert.equal(p.controller.workflowPath, a.workflowPath);
  assert.equal(p.controller.event, 'push'); assert.equal(p.controller.jobKey, a.jobKey); assert.equal(p.controller.jobName, a.jobName);
  return {
    reviewed: Object.freeze({policyBytes, policySha256: digest(policyBytes)}), policy: freezeJson(p), sourceRuns: freezeJson(signed.sourceRuns),
    signatureProof: {scope: signed.scope, algorithm: POLICY_ALGORITHM, keyFingerprint: annotation.keyFingerprint,
      tag: a.tag, tagObjectSha: tagSha, policyBlobSha: blobSha, policySha256: digest(raw),
      executionPolicySha256: digest(policyBytes)},
    captures: {ref: refCapture, tag: tagCapture, blob: blobCapture}
  };
}
