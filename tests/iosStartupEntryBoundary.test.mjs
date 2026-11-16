import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../scripts/qa/ios-parity/', import.meta.url);
const source = readFileSync(process.env.IOS_STARTUP_ENTRY_SOURCE || new URL('startup-diagnostics.js', dir), 'utf8');
const bridge = readFileSync(new URL('ParityBridge.swift', dir), 'utf8');
function run({handler = 'present', holdClock = false} = {}) {
  const order = [], boundaries = [], diagnostics = [];
  let originReads = 0;
  const performance = {now: () => 10, getEntriesByType: () => []};
  Object.defineProperty(performance, 'timeOrigin', {get() {
    order.push('clock'); originReads++;
    if (holdClock) throw Error('CONTROL_CLOCK_NOT_RETURNED');
    return 1000;
  }});
  const messageHandlers = {iosParity: {postMessage(value) {diagnostics.push(value); order.push('diagnostic');}}};
  if (handler !== 'missing') messageHandlers.iosStartupBoundary = {postMessage(value) {
    order.push('boundary'); boundaries.push(value);
    if (handler === 'throwing') throw Error('CONTROL_BOUNDARY_SINK_UNAVAILABLE');
  }};
  const context = vm.createContext({Date: {now: () => 1794521253000}, URL, Set, Object, Number, performance,
    document: {readyState: 'loading', addEventListener() {}},
    location: {href: 'capacitor://localhost/', origin: 'null'},
    addEventListener() {}, PerformanceObserver: class {observe() {}},
    webkit: {messageHandlers}});
  let error;
  try {vm.runInContext(source, context);} catch (value) {error = value;}
  return {order, boundaries, diagnostics, context, error, originReads};
}

test('native script-entry boundary is delivered before the first document clock read', () => {
  const p = run();
  assert.equal(p.error, undefined);
  assert.deepEqual(p.order.slice(0, 3), ['boundary', 'clock', 'diagnostic']);
  assert.equal(p.originReads, 1);
  assert.equal(p.diagnostics[0].startup.stage, 'script-injected');
});

test('a clock read that has not returned cannot erase the earlier native entry observation', () => {
  const p = run({holdClock: true});
  assert.match(String(p.error), /CONTROL_CLOCK_NOT_RETURNED/);
  assert.deepEqual(p.order, ['boundary', 'clock']);
  assert.equal(p.boundaries.length, 1);
  assert.equal(p.diagnostics.length, 0);
});

test('an absent native entry sink preserves the original diagnostic stream', () => {
  const p = run({handler: 'missing'});
  assert.equal(p.error, undefined);
  assert.deepEqual(p.order, ['clock', 'diagnostic']);
  assert.equal(p.diagnostics[0].startup.timeOriginMs, 1000);
});

test('a failed native entry sink does not prevent the original diagnostics', () => {
  const p = run({handler: 'throwing'});
  assert.equal(p.error, undefined);
  assert.deepEqual(p.order, ['boundary', 'clock', 'diagnostic']);
  assert.equal(p.diagnostics[0].startup.stage, 'script-injected');
});

test('entry observations contain only a fixed stage and independent wall time without publishing readiness', () => {
  const p = run();
  assert.equal(JSON.stringify(p.boundaries), '[{"stage":"observer-enter","epochMs":1794521253000}]');
  assert.equal(p.context.nativeStatusReady, undefined);
  assert.equal(p.context.__iosParityLive, undefined);
  assert.equal(p.context.fetch, undefined);
});

test('native entry receiver requires its own channel, main frame and closed schema', () => {
  assert.ok(bridge.indexOf('controller.add(self, name: "iosStartupBoundary")') < bridge.indexOf('for name in ["startup-diagnostics"'));
  const start = bridge.indexOf('if message.name == "iosStartupBoundary"');
  const end = bridge.indexOf('guard var record = message.body', start);
  assert.ok(start > 0 && end > start);
  const receiver = bridge.slice(start, end);
  assert.match(receiver, /guard message\.frameInfo\.isMainFrame/);
  assert.match(receiver, /boundary\.count == 2/);
  assert.match(receiver, /boundary\["stage"\] as\? String == "observer-enter"/);
  assert.match(receiver, /let epochMs = boundary\["epochMs"\] as\? Double, epochMs\.isFinite, epochMs >= 0/);
  assert.match(receiver, /observeStartup\("observer-enter", \["epochMs": epochMs\]\)/);
  assert.doesNotMatch(receiver, /refreshStatus|status\.text|report\[|evaluateJavaScript|capture|timer/i);
});
