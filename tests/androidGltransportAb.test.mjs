import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ARMS, PIN, PHASES, FINAL_PHASES, executePair, pairVerdict, assertContext} from '../scripts/qa/android-gltransport-ab/policy.mjs';
import {BUFFERS, GUEST_PROPERTIES, assertTransportSelection, assertTransportSupport, normalizedAvdConfig} from '../scripts/qa/android-gltransport-ab/transport.mjs';
import {childEnv} from '../scripts/qa/android-gltransport-ab/executor.mjs';
import {inspectAdbOwnerProcess} from '../scripts/qa/android-gltransport-ab/adb-owner.mjs';
import {runOriginalTraceFinish, finalizeAdbClosure} from '../scripts/qa/android-gltransport-ab/finalization.mjs';
import {awaitOwnedBoot} from '../scripts/qa/android-gltransport-ab/boot-readiness.mjs';
import {prepareOwnedKvm} from '../scripts/qa/android-gltransport-ab/preboot-kvm.mjs';

const apkSha256 = 'a'.repeat(64);
const guest = transport => Object.fromEntries(GUEST_PROPERTIES.map(key => [key,
  key === 'ro.hardware.egl' ? 'emulation' : key === 'ro.hardware.gralloc' ? 'ranchu' : key === 'ro.boot.qemu.gltransport' ? '' : transport]));
const host = transport => [
  `INFO | androidboot.hardware.gltransport=${transport}`,
  `INFO | androidboot.hardware.gltransport="${transport}"`,
  `INFO | androidboot.qemu.gltransport.name=${transport}`,
  `INFO | androidboot.qemu.gltransport.name="${transport}"`,
  `INFO | hw.gltransport = ${transport}`,
  ...Object.entries(BUFFERS).map(([k, v]) => `INFO | ${k} = ${v}`),
  'DEBUG | gfxstreamFeature:Minigbm = 0', 'DEBUG | gfxstreamFeature:VirtioGpuNext = 0',
].join('\n');

test('both arms keep SwiftShader and prove host and guest transport selection', () => {
  assert.deepEqual(ARMS.map(a => [a.gpu, a.transport]), [['swiftshader', 'pipe'], ['swiftshader', 'asg']]);
  for (const {transport} of ARMS) assert.equal(assertTransportSelection(host(transport), guest(transport), transport).verified, true);
});
test('ASG fallback to PIPE is terminal even with a correct SwiftShader adapter', () => {
  assert.throws(() => assertTransportSelection(host('pipe'), guest('pipe'), 'asg'), /override\/fallback/);
});
test('guest fallback cannot pass when host reports requested ASG', () => {
  assert.throws(() => assertTransportSelection(host('asg'), guest('pipe'), 'asg'), /Guest transport not applied/);
});
for (const key of ['androidboot.hardware.gltransport', 'androidboot.qemu.gltransport.name', 'hw.gltransport']) {
  test('missing effective host transport fails: ' + key, () => {
    const text = host('asg').split('\n').filter(l => !l.includes(key + '=') && !l.includes(key + ' =')).join('\n');
    assert.throws(() => assertTransportSelection(text, guest('asg'), 'asg'), /Missing effective host evidence/);
  });
}
test('conflicting duplicate host values and legacy guest overrides fail', () => {
  assert.throws(() => assertTransportSelection(host('asg') + '\nINFO | hw.gltransport = pipe', guest('asg'), 'asg'), /Conflicting/);
  assert.throws(() => assertTransportSelection(host('asg'), {...guest('asg'), 'ro.boot.qemu.gltransport': 'pipe'}, 'asg'), /Conflicting guest/);
});
for (const [before, after] of [['writeBufferSize = 1048576', 'writeBufferSize = 2097152'], ['Minigbm = 0', 'Minigbm = 1'], ['VirtioGpuNext = 0', 'VirtioGpuNext = 1']]) {
  test('hidden transport control drift fails: ' + before, () => assert.throws(() => assertTransportSelection(host('asg').replace(before, after), guest('asg'), 'asg')));
}
test('SDK schema drift and unrecognized transport are rejected before measurement', () => {
  assert.throws(() => assertTransportSupport(Buffer.from('name = hw.gltransport\nenum = pipe, asg')), /Exact emulator hardware schema drift/);
  assert.throws(() => assertTransportSelection(host('asg'), guest('asg'), 'virtio-gpu-asg'), /Unexpected transport/);
});
test('AVD configs compare all controls except exact owned identity and transport', () => {
  const config = (name, transport) => `AvdId=${name}\navd.ini.displayname=${name}\nhw.ramSize=4096\nhw.gltransport=${transport}\n`;
  const first = normalizedAvdConfig(config('owned_a', 'pipe'), 'owned_a', 'pipe');
  assert.deepEqual(first, normalizedAvdConfig(config('owned_b', 'asg'), 'owned_b', 'asg'));
  assert.notDeepEqual(first, normalizedAvdConfig(config('owned_b', 'asg').replace('4096', '8192'), 'owned_b', 'asg'));
  assert.throws(() => normalizedAvdConfig(config('owned_b', 'asg') + 'hw.ramSize=8192\n', 'owned_b', 'asg'), /Duplicate/);
});

function adapter(failures = new Set(), {close = true} = {}) {
  const calls = [];
  return {calls, async phase(arm, name) {
    calls.push(arm.id + ':' + name);
    if (failures.has(arm.id + ':' + name)) throw new Error('original failure: ' + arm.id + ':' + name);
    if (name === 'prepare') {arm.sdkDigest = 'same-sdk'; arm.configProof = {matched: true};}
    if (name === 'install') arm.installedAPKVerified = true;
    if (name === 'renderer') {arm.renderer = {glesMode: 'swiftshader'}; arm.transportProof = {verified: true, transport: arm.transport};}
    if (name === 'cleanup') arm.closed = close;
    if (name === 'retain-evidence') arm.evidenceRetained = true;
    return {ready: true};
  }};
}
test('same APK is scheduled once through every original gate and never accepts a release', async () => {
  const engine = adapter(), pair = await executePair(engine, {apkSha256});
  assert.equal(pair.controlsPassed, true); assert.equal(pair.nativeAcceptance, false); assert.equal(pair.releaseAcceptance, false);
  assert.deepEqual(engine.calls, ARMS.flatMap(a => PHASES.map(p => a.id + ':' + p)));
  assert.ok(pair.arms.every(a => a.apkSha256 === apkSha256 && a.attempts === 1));
});
test('transport failure stops measurements and keeps all four finalizers independent', async () => {
  const engine = adapter(new Set(['A:renderer', 'A:trace-finish']));
  const pair = await executePair(engine, {apkSha256});
  assert.equal(pair.controlsPassed, false);
  assert.match(pair.arms[0].phases.find(p => p.name === 'renderer').error, /original failure: A:renderer/);
  assert.equal(pair.arms[0].phases.find(p => p.name === 'acceptance').state, 'not-run-after-failure');
  for (const name of FINAL_PHASES) assert.ok(engine.calls.includes('A:' + name));
  assert.ok(engine.calls.includes('B:acceptance'));
});
test('any ANR history failure remains red after later passing checks', async () => {
  const pair = await executePair(adapter(new Set(['A:anr-history'])), {apkSha256});
  assert.equal(pair.controlsPassed, false);
  assert.equal(pair.arms[0].phases.find(p => p.name === 'anr-history').state, 'failed');
});
test('unconfirmed closure prevents B rather than adopting another process', async () => {
  const engine = adapter(new Set(), {close: false}), pair = await executePair(engine, {apkSha256});
  assert.equal(pair.controlsPassed, false); assert.ok(engine.calls.every(s => s.startsWith('A:')));
});
test('verdict rejects missing phases APK drift and fake treatment acknowledgements', async () => {
  const good = await executePair(adapter(), {apkSha256});
  for (const mutate of [p => p[1].phases.pop(), p => p[1].apkSha256 = 'b'.repeat(64), p => p[1].transport = 'pipe']) {
    const arms = structuredClone(good.arms); mutate(arms); assert.throws(() => pairVerdict(arms));
  }
  const missing = structuredClone(good.arms); delete missing[1].transportProof;
  assert.equal(pairVerdict(missing).controlsPassed, false);
  await assert.rejects(executePair(adapter()), /once-built APK seal/);
});
test('runtime refuses wrong source rerun branch platform and workflow context', () => {
  const head = 'b'.repeat(40), env = {GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
    GITHUB_WORKFLOW_REF: `${PIN.repository}/.github/workflows/android-gltransport-ab-3606-once.yml@refs/heads/${PIN.branch}`,
    GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '123', GITHUB_REPOSITORY: PIN.repository,
    GITHUB_REF: 'refs/heads/' + PIN.branch, GITHUB_SHA: head, ANDROID_AB_REVIEWED_SHA: head,
    ANDROID_AB_REVIEW_TOKEN: PIN.reviewToken, ANDROID_AB_REQUESTED_SOURCE: PIN.source};
  const ctx = {platform: 'linux', toolingHead: head, source: {commit: PIN.source, tree: PIN.tree, clean: true}, tools: {commit: PIN.tools, tree: PIN.tree, clean: true}};
  assertContext(env, ctx);
  for (const [key, value] of [['GITHUB_RUN_ATTEMPT', '2'], ['GITHUB_RUN_NUMBER', '2'], ['ANDROID_AB_REQUESTED_SOURCE', 'c'.repeat(40)], ['GITHUB_REF', 'refs/heads/main'], ['GITHUB_WORKFLOW_REF', 'other']])
    assert.throws(() => assertContext({...env, [key]: value}, ctx));
  assert.throws(() => assertContext(env, {...ctx, platform: 'win32'}));
});
test('child processes inherit HOME and receive only explicit owned Android paths', () => {
  const ctx = {scratch: '/owned/task', sdk: '/sdk'}, env = childEnv(ctx, {avd: 'owned_a'});
  assert.equal(env.HOME, process.env.HOME);
  assert.equal(env.ANDROID_AVD_HOME, join(ctx.scratch, 'avds'));
  assert.equal(env.ADB_VENDOR_KEYS, join(ctx.scratch, 'android-native-home/adbkey'));
  assert.equal(env.SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD, '1');
  assert.equal(env.SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE, join(ctx.scratch, 'no-signing.properties'));
});
test('reused ADB owner checks PID startTicks executable and socket command', () => {
  const identity = {pid: 42, group: 42, startTicks: '100'}, args = 'adb\0fork-server\0server\0tcp:5037\0';
  const api = {identityFor: () => identity, readFile: () => args, realpath: () => '/sdk/adb'};
  const first = inspectAdbOwnerProcess(42, '/sdk/adb', api);
  assert.deepEqual(inspectAdbOwnerProcess(42, '/sdk/adb', api, first), first);
  assert.throws(() => inspectAdbOwnerProcess(42, '/sdk/adb', {...api, identityFor: () => ({...identity, startTicks: '101'})}, first), /reused/);
});
test('reused finalization does not signal missing owners or suppress trace failure', async () => {
  let signals = 0, saved;
  await assert.rejects(finalizeAdbClosure({ownerReceipt: null, initializationAttempted: true,
    verifyAndClose: () => signals++, requirePortFree: () => {}, onRecord: r => saved = r}), /no process was signalled/);
  assert.equal(signals, 0); assert.equal(saved.closed, false);
  await assert.rejects(runOriginalTraceFinish({ownerAlive: false, verifyLiveOwner: () => signals++, finishOriginal: () => {throw Error('trace failed');}}), /trace failed/);
  assert.equal(signals, 0);
});
test('reused boot readiness retains 240s wait and original 180 observations', async () => {
  let waits = 0, probes = 0;
  await assert.rejects(awaitOwnedBoot({waitForDevice: timeout => {assert.equal(timeout, 240000); waits++; return {status: 0};},
    assertOwner: () => {}, getBootCompleted: () => {probes++; return {status: 0, stdout: '0'};}, sleep: ms => assert.equal(ms, 1000)}), /budget exhausted/);
  assert.equal(waits, 1); assert.equal(probes, 180);
});
test('reused KVM setup rejects device replacement before any next arm boot', async () => {
  const device = {path: '/dev/kvm', canonicalPath: '/dev/kvm', character: true, dev: 1, ino: 2, rdev: 3, accessible: true, acl: 'uid-owned'};
  let grants = 0;
  await assert.rejects(prepareOwnedKvm({uid: 1001, priorDevice: {...device, ino: 4}, observe: () => device,
    grant: () => grants++, checkAcceleration: () => 'KVM (version 12) is installed and usable.'}), /changed between arms/);
  assert.equal(grants, 0);
});
test('all five reused process lifecycle helpers retain their reviewed canonical Git bytes', () => {
  const receipt = JSON.parse(readFileSync(new URL('../scripts/qa/android-gltransport-ab/provenance.json', import.meta.url), 'utf8'));
  assert.equal(receipt.reusedRunnerCommit, PIN.reusedRunner); assert.equal(receipt.unchangedHelpers.length, 5);
  for (const {path, sha256} of receipt.unchangedHelpers) {
    // Windows checkouts may use CRLF; compare the immutable committed LF representation.
    const bytes = readFileSync(new URL('../scripts/qa/android-gltransport-ab/' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
  }
});
test('workflow builds once keeps all Native gates and prevents Vercel deployment', () => {
  const workflow = readFileSync(new URL('../.github/workflows/android-gltransport-ab-3606-once.yml', import.meta.url), 'utf8');
  const executor = readFileSync(new URL('../scripts/qa/android-gltransport-ab/executor.mjs', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.git.deploymentEnabled[PIN.branch], false);
  assert.equal((workflow.match(/gradlew assembleDebug/g) || []).length, 1);
  assert.doesNotMatch(workflow, /workflow_dispatch|secrets\.|assembleRelease|bundleRelease|github-script/);
  for (const gate of ['font-regression', 'acceptance', 'geometry', 'anr-history']) assert.ok(PHASES.includes(gate));
  assert.ok(executor.indexOf("this.tool(arm,'launcher-preparation'") < executor.indexOf("this.adb(arm,['install',apk])"));
  assert.match(executor, /assert\.equal\(report\.anrHistoryReady,true\)/);
});
