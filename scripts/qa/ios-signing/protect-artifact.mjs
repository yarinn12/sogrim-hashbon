import {validateOriginReceipt} from './intake-nov5-proof.mjs';
import {INTAKE_BINDINGS,requireBoundIntakePins,requireBoundEnvironment} from './intake-bindings.mjs';
import assert from 'node:assert/strict';
import {createCipheriv, createDecipheriv, createHash, createPrivateKey, hkdfSync, randomBytes} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const CONTEXT = 'sogrim-ios-private-artifact-v1';
const SOURCE=INTAKE_BINDINGS.application.sourceSha,TREE=INTAKE_BINDINGS.application.sourceTree;
const hash = data => createHash('sha256').update(data).digest('hex');

function derive(pem, salt, aad) {
  const secret = createPrivateKey(pem).export({type: 'pkcs8', format: 'der'});
  try { return Buffer.from(hkdfSync('sha256', secret, salt, Buffer.from(CONTEXT + '\n' + aad), 32)); }
  finally { secret.fill(0); }
}

export function protect(plaintext, pem, identity) {
  requireBoundIntakePins();
  assert.equal(identity.sourceCommit, SOURCE);
  assert.equal(identity.sourceTree, TREE);
  assert.equal(identity.version, '4.59');
  assert.equal(identity.build, '195');
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
  requireBoundIntakePins();
  assert.equal(envelope.format, CONTEXT);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(envelope.kdf, 'HKDF-SHA256-PKCS8-DER');
  assert.equal(ciphertext.length,INTAKE_BINDINGS.signing.ciphertextSize);
  assert.equal(hash(ciphertext),INTAKE_BINDINGS.signing.ciphertextSha256);
  assert.equal(hash(ciphertext), envelope.ciphertextSha256);
  const identity = JSON.parse(envelope.aad);
  assert.equal(identity.context, CONTEXT);
  assert.equal(identity.sourceCommit, SOURCE);
  assert.equal(identity.sourceTree, TREE);
  assert.equal(identity.version, '4.59');
  assert.equal(identity.build, '195');
  assert.equal(String(identity.buildRunId),INTAKE_BINDINGS.signing.runId);
  assert.equal(String(identity.buildRunAttempt),'1');
  assert.equal(identity.ipaSha256,INTAKE_BINDINGS.signing.ipaSha256);
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

export function main(args=process.argv.slice(2),env=process.env) {
  requireBoundEnvironment(env);
  const [mode,input,output]=args;
  assert.equal(mode,'decrypt','Intake cannot encrypt, rebuild or sign another artifact');
  validateOriginReceipt(JSON.parse(readFileSync('build/ios/upload-origin.json','utf8')));
  const pem=env.APPSTORE_API_PRIVATE_KEY;
  assert.ok(pem,'Existing key must be supplied through the environment');
  const envelope=JSON.parse(readFileSync(resolve(input,'envelope.json'),'utf8'));
  const plaintext=unprotect(readFileSync(resolve(input,'release.tar.enc')),envelope,pem);
  writeFileSync(output,plaintext,{flag:'wx'});
  console.log('Authenticated original archive decrypted once; no build, signing or upload.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
