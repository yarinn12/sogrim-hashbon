import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const dir = new URL('../scripts/qa/ios-parity/', import.meta.url);
const code = readFileSync(new URL('startup-diagnostics.js', dir), 'utf8');
const canonicalHash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
function probe({ throws = false } = {}) {
  const messages = [], listeners = new Map(); let callback;
  const context = vm.createContext({ Date, URL, Set, Object, Number,
    performance: { now: () => 12, timeOrigin: 1_000 },
    document: { readyState: 'loading', addEventListener: (name, fn) => listeners.set(`document:${name}`, fn) },
    location: { href: 'capacitor://localhost/index.html', origin: 'null' },
    addEventListener: (name, fn) => listeners.set(name, fn),
    PerformanceObserver: class { constructor(fn) { callback = fn; } observe() {} },
    webkit: { messageHandlers: { iosParity: { postMessage(value) { if (throws) throw Error('unavailable'); messages.push(value); } } } }
  });
  vm.runInContext(code, context);
  return { context, messages, listeners, entries: values => callback({ getEntries: () => values }) };
}
test('startup marks observe stages without defining or satisfying readiness', () => {
  const p = probe();
  assert.equal(p.messages[0].startup.stage, 'script-injected');
  p.listeners.get('DOMContentLoaded')();
  p.context.__iosParityStartup.mark('app-info-ready', { phase: 'starting' });
  assert.equal(p.messages.at(-1).startup.phase, 'starting');
  assert.equal(p.context.__iosParityLive, undefined);
  assert.equal(p.context.fetch, undefined);
  assert.equal(p.context.nativeStatusReady, undefined);
});
test('startup records are bounded and reject unknown stages and sensitive fields', () => {
  const p = probe();
  assert.equal(p.context.__iosParityStartup.mark('unknown', { token: 'secret' }), false);
  p.context.__iosParityStartup.mark('synthetic-fetch-start', { endpoint: 'config', method: 'GET', request: 1,
    url: 'https://example.test/?key=secret', payload: 'secret', status: NaN });
  assert.equal(JSON.stringify(p.messages).includes('secret'), false);
  for (let n = 0; n < 200; n++) p.context.__iosParityStartup.mark('capture-start', { index: n });
  assert.equal(p.messages.length, 128);
  assert.equal(p.context.__iosParityStartup.mark('journey-error'), false);
});
test('milestones and asset timings omit URLs, external endpoints and arbitrary marks', () => {
  const p = probe();
  p.entries([{ entryType: 'mark', name: 'sogrim:start:app-module-ready', startTime: 20 },
    { entryType: 'mark', name: 'sogrim:start:secret', startTime: 21 },
    { entryType: 'resource', name: 'https://external.test/a.js?secret', startTime: 2 },
    // Use a bundled asset on the fixed allowlist; arbitrary local scripts are
    // intentionally excluded by the QA logger.
    { entryType: 'resource', name: 'capacitor://localhost/assets/native-core.mjs?secret', startTime: 3,
      duration: 4, initiatorType: 'script' }]);
  assert.equal(p.messages.filter(x => x.startup.stage === 'startup-milestone').length, 1);
  assert.equal(p.messages.filter(x => x.startup.stage === 'local-resource').length, 1);
  assert.equal(JSON.stringify(p.messages).includes('secret'), false);
});
test('a failed telemetry sink does not throw or publish readiness', () => {
  const p = probe({ throws: true });
  assert.doesNotThrow(() => p.context.__iosParityStartup.mark('journey-start'));
  assert.equal(p.context.__iosParityLive, undefined);
});
test('synthetic service and frozen native UI driver retain their exact content seals', () => {
  const baselines = {
    'synthetic-service.js': '0b9dce3a03526794b24063ff367370828fe1aa0594b3d5da4ae02467d7444bed',
    // OS background waiting omits AX reads; action predicates and deadlines stay sealed.
    'ParityUITests.swift': '636ea33a2db57a3a18da57578ab0ca81bb5e41d4f68e8c34f5421f5a080289d8'
  };
  for (const [name, digest] of Object.entries(baselines)) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.equal(canonicalHash(source), digest, name);
    assert.equal(canonicalHash(source.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')), digest, `${name} CRLF`);
  }
  const uiTests = readFileSync(new URL('ParityUITests.swift', dir), 'utf8');
  assert.notEqual(canonicalHash(uiTests.replace('timeout: 35', 'timeout: 36')), baselines['ParityUITests.swift']);
});

test('journey retains original font, frame, native ACK and action deadlines', () => {
  const journey = readFileSync(new URL('journey.js', dir), 'utf8');
  assert.match(journey, /async function until\(predicate, name, timeout = 30000\)/);
  assert.match(journey, /await document\.fonts\.ready/);
  assert.match(journey, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
  assert.match(journey, /Promise\.race\(\[completed, sleep\(10000\)/);
  assert.equal((journey.match(/'real native (?:amount|name) typing', 90000/g) || []).length, 2);
  assert.match(journey, /'final synthetic server acknowledgement', 90000/);
  assert.match(journey, /waitForOriginalSplashRemoval\(\);\s+await capture\('home'/);
  assert.match(journey, /waitForOriginalSplashRemoval\(\);\s+await capture\('restored'/);
});

test('standing QA installs the observer first and preserves native startup logs', () => {
  const prepare = readFileSync(new URL('prepare.py', dir), 'utf8');
  const bridge = readFileSync(new URL('ParityBridge.swift', dir), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/ios-parity-qa.yml', import.meta.url), 'utf8');
  assert.match(prepare, /for name in \["startup-diagnostics", "synthetic-service", "input-trace", "journey"\]/);
  assert.match(bridge, /for name in \["startup-diagnostics", "synthetic-service", "input-trace", "journey"\]/);
  assert.match(bridge, /native-parity-startup-/);
  assert.match(workflow, /"\$container\/Documents"\/native-parity-\*\.log/);
});
