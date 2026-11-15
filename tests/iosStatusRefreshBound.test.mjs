import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const bridge = await readFile(process.env.IOS_PARITY_BRIDGE_SOURCE ||
  new URL('../scripts/qa/ios-parity/ParityBridge.swift', import.meta.url), 'utf8');
const policy = await readFile(process.env.IOS_PARITY_REFRESH_POLICY_SOURCE ||
  new URL('../scripts/qa/ios-parity/StatusPublicationPolicy.swift', import.meta.url), 'utf8');
const swiftTests = await readFile(process.env.IOS_PARITY_POLICY_TEST_SOURCE ||
  new URL('../scripts/qa/ios-parity/StatusPublicationPolicyTests.swift', import.meta.url), 'utf8');
const original = JSON.parse(await readFile(new URL('./fixtures/ios-status-publication-qa532.json', import.meta.url), 'utf8'));

// This exercises a source-backed scheduling model, not Swift on Windows.
// The same policy has real XCTest controls in the generated native test target.
function driver(source = bridge) {
  const bounded = /guard statusRefreshPolicy\.begin\(origin: origin\) else/.test(source);
  const completes = /defer\s*\{\s*if self\.statusRefreshPolicy\.complete\(\)/.test(source);
  let inFlight = false, capturePending = false, outstanding = 0, peak = 0;
  const requests = [];
  function request(origin) {
    if (bounded && inFlight) { capturePending ||= origin === 'capture'; return; }
    inFlight = true; outstanding++; peak = Math.max(peak, outstanding); requests.push(origin);
  }
  function complete() {
    assert.ok(outstanding > 0);
    outstanding--;
    if (completes) {
      inFlight = false;
      const pending = capturePending; capturePending = false;
      if (pending) request('capture');
    }
  }
  return { request, complete, requests, get peak() { return peak; }, get outstanding() { return outstanding; } };
}

test('slow status callbacks never accumulate concurrent timer evaluations', () => {
  const d = driver();
  for (let i = 0; i < original.maximumOutstandingRefreshes; i++) d.request('timer');
  assert.equal(d.peak, 1, 'The original delayed callback must not collect 16 live evaluations');
  assert.equal(d.requests.length, 1);
  d.complete(); d.request('timer');
  assert.equal(d.outstanding, 1);
});

test('capture requests coalesce once and receive a fresh read immediately after the pending reply', () => {
  const d = driver(); d.request('timer');
  for (let i = 0; i < 16; i++) { d.request('capture'); d.request('timer'); }
  assert.deepEqual(d.requests, ['timer']);
  d.complete();
  assert.deepEqual(d.requests, ['timer', 'capture']);
  assert.equal(d.peak, 1);
  d.complete(); assert.equal(d.outstanding, 0);
  d.request('timer'); assert.equal(d.outstanding, 1);
});

test('every callback exit frees the single slot before a pending capture refresh', () => {
  const start = bridge.indexOf('private func refreshStatus(');
  const end = bridge.indexOf('func userContentController(', start);
  const refresh = bridge.slice(start, end);
  assert.ok(refresh.indexOf('guard let targetWebView = webView') < refresh.indexOf('statusRefreshPolicy.begin('),
    'An unavailable web view must not consume a slot that cannot receive a callback');
  assert.ok(refresh.indexOf('defer {') > refresh.indexOf('guard let self = self'));
  assert.ok(refresh.indexOf('defer {') < refresh.indexOf('guard let text = value'));
  assert.match(refresh, /if self\.statusRefreshPolicy\.complete\(\) \{ self\.refreshStatus\("capture"\) \}/);
  assert.match(policy, /mutating func begin\(origin: String\) -> Bool/);
  assert.match(policy, /capturePending = capturePending \|\| origin == "capture"/);
  assert.match(policy, /let pending = capturePending\s+capturePending = false\s+return pending/);
});

test('initial readiness, capture ACK and all native deadlines remain mandatory', async () => {
  assert.match(bridge, /guard state\["nativeStatusReady"\] as\? Bool == true \|\| state\["phase"\] as\? String == "error" else \{ return \}/);
  assert.match(bridge, /Timer\.scheduledTimer\(withTimeInterval: 0\.4, repeats: true\)/);
  assert.match(bridge, /globalThis\.__iosParityCaptureAck/);
  const ui = await readFile(new URL('../scripts/qa/ios-parity/ParityUITests.swift', import.meta.url), 'utf8');
  assert.match(ui, /status\.waitForExistence\(timeout: 35\)/);
  const deadline = original.testStartEpochSeconds + original.statusWaitStartTestSeconds + original.statusWaitBudgetSeconds;
  assert.ok(original.homeCaptureWrittenEpochSeconds < deadline);
  assert.ok(original.firstStatusPublicationEpochSeconds > deadline);
  assert.equal(original.causeOfSlowWebKitOrCallbackDeliveryProven, false);
  assert.ok(swiftTests.includes('testRefreshTimerCannotOverlapAnUnansweredRequest'));
  assert.ok(swiftTests.includes('testPendingCaptureIsCoalescedAndThenReadFresh'));
  assert.ok(swiftTests.includes('testCompletedRefreshDoesNotSuppressTheNextTimer'));
  assert.ok(swiftTests.includes('testUnownedCompletionCannotInventACapture'));
});

test('removing the real bridge begin guard reproduces the recorded backlog contract failure', () => {
  const unbounded = bridge.replace(/guard statusRefreshPolicy\.begin\(origin: origin\) else \{[\s\S]*?\n        \}/, '');
  assert.notEqual(unbounded, bridge);
  const d = driver(unbounded);
  for (let i = 0; i < 16; i++) d.request('timer');
  assert.equal(d.peak, 16);
});
