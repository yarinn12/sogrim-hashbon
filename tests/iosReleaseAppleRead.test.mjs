import test from 'node:test';
import assert from 'node:assert/strict';
import {readAppleReadiness} from '../scripts/qa/ios-signing/apple-read-retry.mjs';
const path = '/v1/apps/6809952514';
function scenario(statuses) {
  const calls = [], waits = [];
  const errors = statuses.map(status => Object.assign(new Error('Apple read status'), {status}));
  return {calls, waits, errors, sleep: async ms => { waits.push(ms); },
    request: async (route, options) => {calls.push({route, options}); const error = errors[calls.length - 1]; if (error) throw error; return {data: 'ok'};}};
}
async function signalTimeout() {
  const signal = AbortSignal.timeout(1);
  if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, {once: true}));
  assert.ok(signal.reason instanceof DOMException);
  assert.equal(signal.reason.name, 'TimeoutError');
  return signal.reason;
}
test('readiness GET retries the actual AbortSignal TimeoutError once, then succeeds', async () => {
  const error = await signalTimeout();
  const calls = [], waits = [];
  const result = await readAppleReadiness(async (route, options) => {
    calls.push({route, options});
    if (calls.length === 1) throw error;
    return {data: 'ok'};
  }, path, {sleep: async ms => waits.push(ms)});
  assert.deepEqual(result, {data: 'ok'});
  assert.deepEqual(calls, [{route: path, options: {method: 'GET'}}, {route: path, options: {method: 'GET'}}]);
  assert.deepEqual(waits, [1000]);
});
test('actual AbortSignal TimeoutError stops after three GET attempts and preserves final error', async () => {
  const errors = await Promise.all([signalTimeout(), signalTimeout(), signalTimeout()]);
  const calls = [], waits = [];
  await assert.rejects(readAppleReadiness(async (route, options) => {
    calls.push({route, options});
    throw errors[calls.length - 1];
  }, path, {sleep: async ms => waits.push(ms)}), error => error === errors[2]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.route === path && call.options.method === 'GET'));
  assert.deepEqual(waits, [1000, 2000]);
});
test('AbortError, generic TimeoutError and 4xx TimeoutError do not retry', async () => {
  const generic = Object.assign(new Error('named timeout'), {name: 'TimeoutError'});
  const forbidden = [new DOMException('cancelled', 'AbortError'), generic,
    Object.assign(new DOMException('timeout with HTTP rejection', 'TimeoutError'), {status: 401})];
  for (const error of forbidden) {
    let calls = 0, waits = 0;
    await assert.rejects(readAppleReadiness(async () => { calls++; throw error; }, path,
      {sleep: async () => { waits++; }}), caught => caught === error);
    assert.equal(calls, 1); assert.equal(waits, 0);
  }
});
for (const status of [500, 502, 503, 504]) test('readiness GET recovers from Apple ' + status, async () => {
  const s = scenario([status]);
  assert.deepEqual(await readAppleReadiness(s.request, path, {sleep: s.sleep}), {data: 'ok'});
  assert.equal(s.calls.length, 2); assert.deepEqual(s.waits, [1000]);
  for (const call of s.calls) assert.deepEqual(call, {route: path, options: {method: 'GET'}});
});
test('readiness GET has a three-attempt bound and retains the final error', async () => {
  const s = scenario([500, 502, 503, 504]);
  await assert.rejects(readAppleReadiness(s.request, path, {sleep: s.sleep}), e => e === s.errors[2]);
  assert.equal(s.calls.length, 3); assert.deepEqual(s.waits, [1000, 2000]);
});
for (const status of [400, 401, 403, 404, 409, 429, undefined]) test('readiness GET does not retry status ' + status, async () => {
  const s = scenario([status]); await assert.rejects(readAppleReadiness(s.request, path, {sleep: s.sleep}), e => e === s.errors[0]);
  assert.equal(s.calls.length, 1); assert.deepEqual(s.waits, []);
});
for (const route of ['/v1/betaGroups/owner/relationships/builds', 'https://evil.example/v1/builds?x=1', '/v1/apps/6809952514/relationships/builds'])
  test('readiness retry rejects mutation/foreign route ' + route, async () => {
    let called = false; await assert.rejects(readAppleReadiness(async () => { called = true; }, route)); assert.equal(called, false);
  });
test('readiness builds page preserves the original GET query', async () => {
  const s = scenario([500, 504]); const route = '/v1/builds?filter%5Bapp%5D=6809952514&limit=200';
  await readAppleReadiness(s.request, route, {sleep: s.sleep});
  assert.equal(s.calls.length, 3); assert.ok(s.calls.every(c => c.route === route && c.options.method === 'GET'));
});
