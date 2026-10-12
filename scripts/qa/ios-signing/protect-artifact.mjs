import assert from 'node:assert/strict';
import {createCipheriv, createDecipheriv, createHash, createPrivateKey, hkdfSync, randomBytes} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const CONTEXT = 'sogrim-ios-private-artifact-v1';
const SOURCE = process.env.SOURCE_SHA;
const TREE = '4fa245f729250a8abd17121d3e1fa56d6adb9090';
assert.equal(SOURCE, 'eaecfa0761aa80b3701b329b30393899510d6844', 'Expected the coordinator frozen release source');
const hash = data => createHash('sha256').update(data).digest('hex');

function derive(pem, salt, aad) {
  const secret = createPrivateKey(pem).export({type: 'pkcs8', format: 'der'});
  try { return Buffer.from(hkdfSync('sha256', secret, salt, Buffer.from(CONTEXT + '\n' + aad), 32)); }
  finally { secret.fill(0); }
}

export function protect(plaintext, pem, identity) {
  assert.equal(identity.sourceCommit, SOURCE);
  assert.equal(identity.sourceTree, TREE);
  assert.equal(identity.version, '4.58');
  assert.equal(identity.build, '193');
  const aad = JSON.stringify({context: CONTEXT, ...identity});
  const salt = randomBytes(32), iv = randomBytes(12), key = derive(pem, salt, aad);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {ciphertext, envelope: {format: CONTEXT, algorithm: 'AES-256-GCM', kdf: 'HKDF-SHA256-PKCS8-DER',
      salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      aad, ciphertextSha256: hash(ciphertext), plaintextSha256: hash(plaintext)}};
  } finally {key.fill(0);}
}

export function unprotect(ciphertext, envelope, pem) {
  assert.equal(envelope.format, CONTEXT);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(envelope.kdf, 'HKDF-SHA256-PKCS8-DER');
  assert.equal(hash(ciphertext), envelope.ciphertextSha256);
  const identity = JSON.parse(envelope.aad);
  assert.equal(identity.context, CONTEXT);
  assert.equal(identity.sourceCommit, SOURCE);
  assert.equal(identity.sourceTree, TREE);
  assert.equal(identity.version, '4.58');
  assert.equal(identity.build, '193');
  const salt = Buffer.from(envelope.salt, 'base64'), iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
  assert.equal(salt.length, 32); assert.equal(iv.length, 12); assert.equal(tag.length, 16);
  const key = derive(pem, salt, envelope.aad);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(envelope.aad)); decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    assert.equal(hash(plaintext), envelope.plaintextSha256);
    return plaintext;
  } finally {key.fill(0);}
}

function main() {
  const [mode, input, output] = process.argv.slice(2);
  const pem = process.env.APPSTORE_API_PRIVATE_KEY;
  assert.ok(pem, 'Existing App Store API private key must be supplied through the environment');
  if (mode === 'encrypt') {
    const manifest = JSON.parse(readFileSync('build/ios/artifact-verification.json', 'utf8'));
    assert.equal(manifest.appleUploadPerformed, false);
    assert.equal(manifest.signatureVerified, true);
    assert.equal(manifest.everyWwwAssetMatches, true);
    const result = protect(readFileSync(input), pem, {sourceCommit: manifest.sourceCommit,
      sourceTree: manifest.sourceTree, version: manifest.version, build: manifest.build, buildRunId: process.env.GITHUB_RUN_ID,
      buildRunAttempt: process.env.GITHUB_RUN_ATTEMPT, ipaSha256: manifest.ipaSha256});
    mkdirSync(output, {recursive: true});
    writeFileSync(resolve(output, 'release.tar.enc'), result.ciphertext);
    writeFileSync(resolve(output, 'envelope.json'), JSON.stringify(result.envelope, null, 2) + '\n');
    console.log('Verified release encrypted; only ciphertext and envelope may be retained as GitHub artifacts.');
  } else if (mode === 'decrypt') {
    const envelope = JSON.parse(readFileSync(resolve(input, 'envelope.json'), 'utf8'));
    const plaintext = unprotect(readFileSync(resolve(input, 'release.tar.enc')), envelope, pem);
    writeFileSync(output, plaintext, {flag: 'wx'});
    console.log('Authenticated release archive decrypted to a new local file.');
  } else throw new Error('Expected encrypt or decrypt');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
