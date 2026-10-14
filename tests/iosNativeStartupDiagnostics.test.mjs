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
test('all acceptance assertions and the validation implementation retain canonical baseline bytes', () => {
  const baselines = { 'ParityUITests.swift': '3d3175b92c20059c2c73654308393023d102e69854a8ff6c792a2a37a75b1297',
    'test_validation.py': '6fbd14f8b4a683a238dc4d196a51fd879ff5ebaaed738228fd08f2854382f39d' };
  for (const [name, digest] of Object.entries(baselines)) {
    assert.equal(canonicalHash(readFileSync(new URL(name, dir), 'utf8')), digest);
  }
  const journey = readFileSync(new URL('journey.js', dir), 'utf8');
  assert.ok(journey.includes("if (name === 'home' || name === 'restored') nativeStatusReady = true;"));
  assert.ok(journey.includes("sleep(10000).then(() => { throw new Error('Native screenshot acknowledgement missing'); })"));
});
test('actual journey separates plugin and font waits while keeping first-home readiness false', async () => {
  let resolveInfo, resolveFonts; const marks = [];
  const info = new Promise(resolve => { resolveInfo = resolve; });
  const fonts = new Promise(resolve => { resolveFonts = resolve; });
  const home = { getBoundingClientRect: () => ({ width: 10, height: 10 }) };
  const context = vm.createContext({ Date, Promise, Map, JSON,
    addEventListener() {}, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    document: { querySelectorAll: selector => selector === '[data-screen-kind="home"]' ? [home] : [],
      querySelector: () => null, fonts: { ready: fonts } },
    performance: { now: () => 1 },
    localStorage: { getItem: () => null },
    Capacitor: { isNativePlatform: () => true, Plugins: { App: { getInfo: () => info } } },
    __iosParityStartup: { mark: (stage, fields) => marks.push({ stage, ...fields }) },
    requestAnimationFrame() {},
    webkit: { messageHandlers: { iosParity: { postMessage() {} } } },
    innerWidth: 393, innerHeight: 852, visualViewport: { height: 852 }, scrollX: 0, scrollY: 0
  });
  vm.runInContext(readFileSync(new URL('journey.js', dir), 'utf8'), context);
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.ok(marks.some(x => x.stage === 'app-info-start'));
  assert.equal(marks.some(x => x.stage === 'app-info-ready'), false);
  assert.equal(context.__iosParityLive().nativeStatusReady, false);
  resolveInfo({ version: '4.58' });
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.ok(marks.some(x => x.stage === 'fonts-wait-start' && x.phase === 'home'));
  assert.equal(marks.some(x => x.stage === 'fonts-ready'), false);
  assert.equal(context.__iosParityLive().nativeStatusReady, false);
  resolveFonts();
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.ok(marks.some(x => x.stage === 'raf-wait-start'));
  assert.equal(marks.some(x => x.stage === 'raf-ready'), false);
  assert.equal(context.__iosParityLive().nativeStatusReady, false);
});


test('canonical acceptance hashes allow only line endings and reject changed deadlines', () => {
  const source = readFileSync(new URL('ParityUITests.swift', dir), 'utf8').replace(/\r\n/g, '\n');
  const expected = '3d3175b92c20059c2c73654308393023d102e69854a8ff6c792a2a37a75b1297';
  assert.equal(canonicalHash(source), expected);
  assert.equal(canonicalHash(source.replace(/\n/g, '\r\n')), expected);
  assert.ok(source.includes('timeout: 35'));
  assert.notEqual(canonicalHash(source.replace('timeout: 35', 'timeout: 36')), expected);
});
