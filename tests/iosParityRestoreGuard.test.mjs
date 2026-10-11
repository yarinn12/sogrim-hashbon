import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';

const source = await readFile(new URL('../scripts/qa/ios-parity/journey.js', import.meta.url), 'utf8');

async function runJourney(script, renderedExpensePresent) {
  const phases = [];
  let clock = 0;
  const makeElement = text => ({
    textContent: text,
    outerHTML: `<button>${text}</button>`,
    disabled: false,
    scrollWidth: 100,
    clientWidth: 100,
    scrollIntoView() {},
    click() {},
    closest() { return null; },
    contains(element) { return element === this; },
    getBoundingClientRect() { return { left: 5, top: 5, right: 105, bottom: 25, width: 100, height: 20 }; }
  });
  const opener = makeElement('Open');
  const heading = makeElement('אירוע בדיקה');
  const expense = makeElement('QA iOS');
  const groupTotal = makeElement('₪120.00');
  const row = { state: { events: [{ expenses: [{ id: 'qa-expense-id', name: 'QA iOS', total: 12000 }] }] } };
  const storage = {
    'qa-ios-parity-complete': '1',
    'qa-native-server-row': JSON.stringify(row),
    'settle-friends-state:ios-native-qa-space': JSON.stringify(row.state)
  };
  const localStorage = { getItem: key => storage[key] ?? null };
  const document = {
    fonts: { ready: Promise.resolve() },
    documentElement: { scrollWidth: 393 },
    querySelector: () => null,
    elementFromPoint: () => opener,
    querySelectorAll: selector => {
      if (selector === '[data-screen-kind="home"]') return [opener];
      if (selector === '[data-action="open-event"][data-event-id="ios-native-event"]') return [opener];
      if (selector === '.event-overview-header h1') return [heading];
      if (selector === '.expense-day-summary .amount') return [groupTotal];
      if (selector === '.expense-row[data-expense-id="qa-expense-id"] strong') {
        return renderedExpensePresent ? [expense] : [];
      }
      return [];
    },
    createTreeWalker: () => ({ nextNode: () => null })
  };
  const sandbox = {
    document, localStorage, innerWidth: 393, innerHeight: 852,
    performance, history: { state: null },
    scrollX: 0, scrollY: 0,
    visualViewport: { height: 852 },
    location: { href: 'capacitor://localhost/' },
    Capacitor: {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      Plugins: { App: { getInfo: async () => ({ id: 'com.sogrimhashbon.app' }) } }
    },
    Date: { now: () => (clock += 1000) },
    setTimeout(callback, delay) {
      if (delay >= 10000) {
        const handle = setTimeout(callback, delay);
        handle.unref();
        return handle;
      }
      queueMicrotask(callback);
      return 0;
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => queueMicrotask(callback),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', fontSize: '16px', fontFamily: 'sans-serif' }),
    NodeFilter: { SHOW_TEXT: 4 }
  };
  sandbox.webkit = { messageHandlers: { iosParity: { postMessage: record => {
    phases.push(record);
    queueMicrotask(() => sandbox.__iosParityCaptureAck?.(record.index));
  } } } };
  sandbox.globalThis = sandbox;
  runInNewContext(script, sandbox, { filename: 'journey.js' });
  for (let index = 0; index < 100 && phases.length === 0; index++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(phases.length > 0, 'Journey did not post a native result');
  // The first screenshot acknowledgement must release native status on the
  // restored path too; bootstrap failures must remain visible before capture.
  await new Promise(resolve => setImmediate(resolve));
  return { ...phases.at(-1), nativeStatus: sandbox.__iosParityLive() };
}

test('iOS relaunch QA rejects a missing rendered expense while acknowledged server and local data survive', async () => {
const missing = await runJourney(source, false);
assert.equal(missing.phase, 'error', 'Missing rendered expense must fail relaunch QA');
assert.match(missing.errors.join(' '), /restored expense rendered in the native UI/);
assert.equal(missing.nativeStatus.nativeStatusReady, true, 'A failed relaunch must expose its error');

const present = await runJourney(source, true);
assert.equal(present.phase, 'restored', 'Rendered expense must pass relaunch QA');
assert.equal(present.metrics.expense.text, 'QA iOS');
assert.equal(present.metrics.groupTotal.text, '₪120.00', 'The restored capture must include the real group amount');
assert.equal(present.nativeStatus.nativeStatusReady, true, 'Acknowledged restored capture must expose native status');

const mutated = source.replace(
  /      const expenseSelector = `[\s\S]*?      await capture\('restored', \{[\s\S]*?\}\);/,
  "      await capture('restored', { heading: '.event-overview-header h1' });"
);
assert.notEqual(mutated, source, 'Controlled mutation did not remove the rendered-row assertion');
const unprotected = await runJourney(mutated, false);
assert.equal(unprotected.phase, 'restored', 'Controlled mutation should reproduce the former false positive');

});
