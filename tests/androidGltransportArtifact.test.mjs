import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync} from 'node:fs';
import {join, dirname, basename, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {APK, BUILD_FILES, sealBuild, verifyBuild, seedBuild} from '../scripts/qa/android-gltransport-ab/artifact.mjs';
import {PIN} from '../scripts/qa/android-gltransport-ab/policy.mjs';

function fixture(t) {
  const directory = resolve(mkdtempSync(join(tmpdir(), 'sogrim-gltransport-test-')));
  t.after(() => {assert.equal(dirname(directory), resolve(tmpdir())); assert.ok(basename(directory).startsWith('sogrim-gltransport-test-')); rmSync(directory, {recursive: true});});
  const source = join(directory, 'source'), native = join(source, 'artifacts/android-native-isolated');
  const save = (path, bytes) => {mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, bytes);};
  const json = (name, value) => save(join(native, name), JSON.stringify(value));
  // Synthetic bytes exercise provenance and seeding only; this is not an APK execution test.
  const bytes = Buffer.from('synthetic APK bytes'), sha = createHash('sha256').update(bytes).digest('hex');
  save(join(source, APK), bytes);
  const identity = {sourceCommit: PIN.source, sourceTree: PIN.tree, nativeDiagnosticAbsent: true};
  json('apk-assets.json', {...identity, ready: true, errors: [], apkSha256: sha,
    assets: [{path: 'font.woff2', font: true, matchesWww: true, fontMatchesSource: true}]});
  json('fixture-provenance.json', {...identity, privateEnvDisabled: true, bootstrapIsSynthetic: true, runtimeSourceChanged: false, productCssChanged: false});
  json('gradle-build-observation/gradle-build.json', {source: PIN.source, phase: 'assembleDebug', invocations: 1, buildSucceeded: true, exitCode: 0, signal: null});
  save(join(native, 'qa-tools-source.txt'), PIN.tools + '\n');
  save(join(native, 'apk-badging.txt'), "package: name='com.sogrimhashbon.app.debug' versionCode='190' versionName='4.58-debug'\n");
  save(join(native, 'debug-certificate.txt'), `Signer #1 certificate DN: C=US, O=Android, CN=Android Debug\nSigner #1 certificate SHA-256 digest: ${'d'.repeat(64)}\n`);
  return {directory, source, native, json};
}

test('one sealed source APK is copied unchanged into two exclusive arm roots', t => {
  const {directory, source} = fixture(t), seal = sealBuild(source);
  assert.equal(seal.buildCount, 1); assert.equal(seal.releaseAcceptance, false);
  assert.deepEqual(seal.files.map(f => f.path), BUILD_FILES);
  for (const arm of ['A', 'B']) {
    const root = join(directory, arm), receipt = seedBuild(source, root, seal);
    assert.equal(receipt.APKRebuilt, false); assert.deepEqual(readFileSync(join(root, APK)), readFileSync(join(source, APK)));
    verifyBuild(root, seal);
  }
  assert.throws(() => seedBuild(source, join(directory, 'A'), seal), /overwrite/);
});
test('any post-seal APK byte change stops both seeding and verification', t => {
  const {directory, source} = fixture(t), seal = sealBuild(source);
  appendFileSync(join(source, APK), 'changed');
  assert.throws(() => verifyBuild(source, seal)); assert.throws(() => seedBuild(source, join(directory, 'A'), seal));
});
for (const [name, mutate] of [
  ['source mismatch', d => d.sourceCommit = 'f'.repeat(40)],
  ['failed asset audit', d => d.ready = false],
  ['hidden asset error', d => d.errors.push('font drift')],
  ['font byte mismatch', d => d.assets[0].fontMatchesSource = false],
]) {
  test('seal rejects ' + name, t => {
    const {source, native, json} = fixture(t), audit = JSON.parse(readFileSync(join(native, 'apk-assets.json'), 'utf8'));
    mutate(audit); json('apk-assets.json', audit); assert.throws(() => sealBuild(source));
  });
}
test('another build invocation or failed Gradle result cannot be sealed', t => {
  const {source, json} = fixture(t);
  json('gradle-build-observation/gradle-build.json', {source: PIN.source, phase: 'assembleDebug', invocations: 2, buildSucceeded: true, exitCode: 0, signal: null});
  assert.throws(() => sealBuild(source));
  json('gradle-build-observation/gradle-build.json', {source: PIN.source, phase: 'assembleDebug', invocations: 1, buildSucceeded: false, exitCode: 1, signal: null});
  assert.throws(() => sealBuild(source));
});
test('release certificate label cannot masquerade as disposable Debug signing', t => {
  const {source, native} = fixture(t);
  writeFileSync(join(native, 'debug-certificate.txt'), `Signer #1 certificate DN: CN=Release\nSigner #1 certificate SHA-256 digest: ${'d'.repeat(64)}\n`);
  assert.throws(() => sealBuild(source), /Android Debug/);
});
test('post-seal provenance changes remain detectable even if APK bytes match', t => {
  const {source, native} = fixture(t), seal = sealBuild(source);
  appendFileSync(join(native, 'apk-assets.json'), '\n');
  assert.throws(() => verifyBuild(source, seal), /changed after sealing/);
});
