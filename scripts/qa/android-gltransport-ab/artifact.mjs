import assert from 'node:assert/strict';
import {copyFileSync, constants, existsSync, mkdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {sha256File} from './hash-file.mjs';
import {PIN} from './policy.mjs';

export const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const NATIVE = 'artifacts/android-native-isolated/';
export const BUILD_FILES = Object.freeze([APK, ...[
  'apk-assets.json', 'fixture-provenance.json', 'qa-tools-source.txt',
  'apk-badging.txt', 'debug-certificate.txt', 'gradle-build-observation/gradle-build.json',
].map(p => NATIVE + p)]);
const json = (root, path) => JSON.parse(readFileSync(join(root, NATIVE + path), 'utf8'));

export function sealBuild(root) {
  const audit = json(root, 'apk-assets.json'), fixture = json(root, 'fixture-provenance.json');
  const build = json(root, 'gradle-build-observation/gradle-build.json');
  assert.equal(build.source, PIN.source); assert.equal(build.phase, 'assembleDebug');
  assert.equal(build.invocations, 1); assert.equal(build.buildSucceeded, true);
  assert.equal(build.exitCode, 0); assert.equal(build.signal, null);
  for (const report of [audit, fixture]) {
    assert.equal(report.sourceCommit, PIN.source); assert.equal(report.sourceTree, PIN.tree);
    assert.equal(report.nativeDiagnosticAbsent, true);
  }
  assert.equal(audit.ready, true); assert.deepEqual(audit.errors, []);
  assert.equal(fixture.privateEnvDisabled, true); assert.equal(fixture.bootstrapIsSynthetic, true);
  assert.equal(fixture.runtimeSourceChanged, false); assert.equal(fixture.productCssChanged, false);
  assert.equal(readFileSync(join(root, NATIVE + 'qa-tools-source.txt'), 'utf8').trim(), PIN.tools);
  const apkSha256 = sha256File(join(root, APK)); assert.equal(audit.apkSha256, apkSha256);
  assert.ok(audit.assets.length > 0 && audit.assets.some(a => a.font), 'Missing APK assets/fonts');
  assert.ok(audit.assets.every(a => (a.matchesWww || a.emptyGeneratedStub) && a.fontMatchesSource), 'APK asset audit failed');
  assert.match(readFileSync(join(root, NATIVE + 'apk-badging.txt'), 'utf8'), /package: name='com\.sogrimhashbon\.app\.debug' versionCode='190' versionName='4\.58-debug'/);
  const cert = readFileSync(join(root, NATIVE + 'debug-certificate.txt'), 'utf8');
  const digests = [...cert.matchAll(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})\s*$/gm)];
  assert.equal(digests.length, 1, 'Require one Debug certificate');
  assert.match(cert, /Signer #1 certificate DN: .*CN=Android Debug/);
  return {source: PIN.source, tree: PIN.tree, tools: PIN.tools, apkSha256,
    apkBytes: statSync(join(root, APK)).size, certificate: digests[0][1], buildCount: 1,
    privateEnvDisabled: true, syntheticBootstrap: true, releaseAcceptance: false,
    files: BUILD_FILES.map(path => ({path, bytes: statSync(join(root, path)).size, sha256: sha256File(join(root, path))}))};
}

export function verifyBuild(root, seal) {
  assert.deepEqual(sealBuild(root), seal, 'Once-built APK or audited provenance changed after sealing');
}

export function seedBuild(root, target, seal) {
  verifyBuild(root, seal);
  for (const {path} of seal.files) {
    const destination = join(target, path); assert.ok(!existsSync(destination), 'Refuse arm seed overwrite');
    mkdirSync(dirname(destination), {recursive: true});
    copyFileSync(join(root, path), destination, constants.COPYFILE_EXCL);
  }
  verifyBuild(target, seal);
  return {seeded: true, apkSha256: seal.apkSha256, APKRebuilt: false};
}
