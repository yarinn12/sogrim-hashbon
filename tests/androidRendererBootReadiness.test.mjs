import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitOwnedBoot} from '../scripts/qa/android-renderer-ab/boot-readiness.mjs';

function fixture(results, {ownerFailureAt, waitResult = {status: 0, stdout: '', stderr: ''}} = {}) {
  const calls = {wait: [], owner: 0, probe: 0, sleep: [], observations: []};
  const api = {
    waitForDevice: async timeout => {calls.wait.push(timeout); return waitResult;},
    assertOwner: async () => {
      calls.owner++;
      if (calls.owner === ownerFailureAt) throw new Error('foreign or reused emulator PID');
    },
    getBootCompleted: async () => results[calls.probe++] ?? {status: 0, stdout: '0\n', stderr: ''},
    sleep: async ms => {calls.sleep.push(ms);},
    recordObservation: row => {calls.observations.push(row);},
  };
  return {api, calls};
}

test('one owned boot tolerates documented temporary device-not-found and preserves each raw observation', async () => {
  const f = fixture([
    {status: 0, stdout: '\n', stderr: ''},
    {status: 1, stdout: '', stderr: "error: device 'emulator-5582' not found\n"},
    {status: 0, stdout: '1\n', stderr: ''},
  ]);
  const result = await awaitOwnedBoot(f.api);
  assert.deepEqual(result, {booted: true, attempts: 3});
  assert.deepEqual(f.calls.wait, [240000]);
  assert.equal(f.calls.owner, 3);
  assert.equal(f.calls.probe, 3);
  assert.deepEqual(f.calls.sleep, [1000, 1000]);
  assert.deepEqual(f.calls.observations.filter(row => row.phase === 'probe').map(row => row.code), ['BOOT_PENDING', 'TRANSIENT_TRANSPORT', 'BOOT_READY']);
  assert.equal(f.calls.observations[2].stderr, "error: device 'emulator-5582' not found\n");
});

test('device-offline is also a recorded transient transport result, without another wait or launch', async () => {
  const f = fixture([
    {status: 1, stdout: '', stderr: 'error: device offline\n'},
    {status: 0, stdout: '1\n', stderr: ''},
  ]);
  assert.deepEqual(await awaitOwnedBoot(f.api), {booted: true, attempts: 2});
  assert.deepEqual(f.calls.wait, [240000]);
  assert.deepEqual(f.calls.observations.filter(row => row.phase === 'probe').map(row => row.code), ['TRANSIENT_TRANSPORT', 'BOOT_READY']);
});

test('the original 180-probe budget is exhausted without adding attempts or time', async () => {
  const f = fixture([]);
  await assert.rejects(awaitOwnedBoot(f.api), error => error.code === 'BOOT_BUDGET_EXHAUSTED');
  assert.equal(f.calls.owner, 180);
  assert.equal(f.calls.probe, 180);
  assert.equal(f.calls.sleep.length, 180);
  assert.ok(f.calls.sleep.every(ms => ms === 1000));
  assert.equal(f.calls.observations.at(-2).code, 'BOOT_PENDING');
  assert.equal(f.calls.observations.at(-1).code, 'BOOT_BUDGET_EXHAUSTED');
});

test('a foreign or reused emulator PID stops before the next probe', async () => {
  const f = fixture([{status: 0, stdout: '0', stderr: ''}], {ownerFailureAt: 2});
  await assert.rejects(awaitOwnedBoot(f.api), /foreign or reused emulator PID/);
  assert.equal(f.calls.owner, 2);
  assert.equal(f.calls.probe, 1);
  assert.equal(f.calls.observations.at(-1).code, 'OWNER_FAILED');
});

test('unauthorized, permission, generic and timed-out probes remain terminal', async () => {
  for (const result of [
    {status: 1, stdout: '', stderr: 'error: device unauthorized\n'},
    {status: 1, stdout: '', stderr: 'error: permission denied\n'},
    {status: 1, stdout: '', stderr: 'error: device not ready\n'},
    {status: 1, stdout: '', stderr: 'error: device offline\n', timedOut: true},
  ]) {
    const f = fixture([result]);
    await assert.rejects(awaitOwnedBoot(f.api), error => error.code === 'BOOT_PROBE_FAILED');
    assert.equal(f.calls.probe, 1);
    assert.equal(f.calls.sleep.length, 0);
    assert.equal(f.calls.observations.at(-1).code, 'BOOT_PROBE_FAILED');
    assert.equal(f.calls.observations.at(-1).stderr, result.stderr);
  }
});

test('wait-for-device failure is recorded and never enters the probe loop', async () => {
  const f = fixture([], {waitResult: {status: 1, stdout: '', stderr: 'error: device offline\n'}});
  await assert.rejects(awaitOwnedBoot(f.api), error => error.code === 'WAIT_FOR_DEVICE_FAILED');
  assert.deepEqual(f.calls.wait, [240000]);
  assert.equal(f.calls.owner, 0);
  assert.equal(f.calls.probe, 0);
  assert.equal(f.calls.observations.at(-1).code, 'WAIT_FOR_DEVICE_FAILED');
});
