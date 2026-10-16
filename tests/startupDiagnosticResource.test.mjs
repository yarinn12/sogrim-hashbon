import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const sourcePath = fileURLToPath(new URL('../scripts/qa/ios-parity/startup-diagnostics.js', import.meta.url));
const source = process.env.STARTUP_DIAGNOSTICS_REF
  ? execFileSync('git', ['show', `${process.env.STARTUP_DIAGNOSTICS_REF}:scripts/qa/ios-parity/startup-diagnostics.js`], { encoding: 'utf8' })
  : readFileSync(sourcePath, 'utf8');

function runResourceProbe(origin, buffered = false, redeliverBuffered = false) {
  const messages = [];
  const events = new Map();
  let observer;
  class PerformanceObserverProbe {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    push(entries) { this.callback({ getEntries: () => entries }); }
  }
  const resource = name => ({ entryType: 'resource', name, initiatorType: 'script',
    startTime: 5, duration: 2, responseEnd: 7, transferSize: 1234 });
  const localResource = resource('capacitor://localhost/assets/native-core.mjs');
  const sandbox = {
    URL, Date, Number, Set, Map,
    location: { href: 'capacitor://localhost/', origin },
    document: {
      readyState: 'loading',
      addEventListener(name, callback) { events.set(`document:${name}`, callback); }
    },
    performance: { now: () => 10, timeOrigin: 1_000,
      getEntriesByType: () => buffered ? [localResource] : [] },
    PerformanceObserver: PerformanceObserverProbe,
    addEventListener(name, callback) { events.set(name, callback); },
    webkit: { messageHandlers: { iosParity: { postMessage(value) { messages.push(value); } } } }
  };
  runInNewContext(source, sandbox, { filename: 'startup-diagnostics.js' });
  observer.push([
    ...(!buffered || redeliverBuffered ? [localResource] : []),
    resource('capacitor://elsewhere/assets/native-auth.mjs'),
    resource('https://example.test/assets/native-prelude.mjs'),
    resource('capacitor://localhost@elsewhere/assets/native-account.mjs')
  ]);
  events.get('DOMContentLoaded')();
  return messages.map(message => message.startup);
}

test('custom-scheme resources use exact protocol and host without exposing URLs', () => {
  // For an opaque custom-scheme URL, URL.origin is "null" while WKWebView may
  // expose location.origin as "capacitor://localhost". The old predicate loses
  // the resource in that case; the protocol/host classifier must retain it.
  const stages = runResourceProbe('capacitor://localhost');
  const resources = stages.filter(stage => stage.stage === 'local-resource');
  assert.equal(resources.length, 1);
  assert.equal(resources[0].resourceClass, 'core');
  assert.equal(resources[0].legacyOriginMatched, false);
  assert.equal(resources[0].timeOriginMs, 1_000);
  const summary = stages.find(stage => stage.stage === 'resource-summary');
  assert.equal(summary.resourceEntries, 4);
  assert.equal(summary.localMatched, 1);
  assert.equal(summary.legacyMissed, 1);
  assert.doesNotMatch(JSON.stringify(stages), /example\.test|elsewhere|native-core\.mjs|capacitor:\/\/localhost/);
});

test('an opaque page origin still accepts the same bundled resource', () => {
  const stages = runResourceProbe('null');
  assert.equal(stages.filter(stage => stage.stage === 'local-resource').length, 1);
});

test('resources recorded before injection are included once', () => {
  const stages = runResourceProbe('capacitor://localhost', true);
  assert.equal(stages.filter(stage => stage.stage === 'local-resource').length, 1);
  const summary = stages.find(stage => stage.stage === 'resource-summary');
  assert.equal(summary.resourceEntries, 4);
  assert.equal(summary.localMatched, 1);
});

test('a buffered resource redelivered by the observer is not counted twice', () => {
  const stages = runResourceProbe('capacitor://localhost', true, true);
  const summary = stages.find(stage => stage.stage === 'resource-summary');
  assert.equal(summary.resourceEntries, 4);
  assert.equal(summary.localMatched, 1);
});
