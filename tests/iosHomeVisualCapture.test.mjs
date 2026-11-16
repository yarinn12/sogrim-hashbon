import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/qa/ios-parity/journey.js', import.meta.url), 'utf8');
const runCall = source.lastIndexOf('  run().catch(error => {');
assert.ok(runCall > 0, 'journey entry point must be present');

function gate() {
  const state = { marked: false, overlay: true, active: true, screen: 'home' };
  const context = vm.createContext({
    addEventListener() {},
    performance: {
      now: () => 200,
      getEntriesByName: (name, type) => name === 'sogrim:start:splash-dismissed' && type === 'mark' && state.marked
        ? [{ startTime: 100 }] : []
    },
    document: {
      querySelector: selector => selector === '#app-splash' ? (state.overlay ? {} : null)
        : selector === '#app' ? { dataset: { screen: state.screen } } : null,
      documentElement: { classList: { contains: name => name === 'app-splash-active' && state.active } }
    },
    setTimeout,
    Date
  });
  vm.runInContext(source.slice(0, runCall) +
    '  globalThis.__captureGateProbe = { visualCapture, waitForOriginalSplashRemoval };\n})();', context);
  return { state, probe: context.__captureGateProbe };
}

test('home capture waits for the original mark and actual overlay removal', async () => {
  const { state, probe } = gate();
  assert.throws(() => probe.visualCapture('home'), /visible phase mismatch/);
  state.marked = true;
  assert.throws(() => probe.visualCapture('home'), /visible phase mismatch/);
  state.active = false;
  assert.throws(() => probe.visualCapture('home'), /visible phase mismatch/);
  const waiting = probe.waitForOriginalSplashRemoval();
  state.overlay = false;
  await waiting;
  assert.equal(probe.visualCapture('home').screen, 'home');
});

test('capture witness rejects a different visible screen at every mapped stage', () => {
  const { state, probe } = gate();
  state.marked = true;
  state.overlay = false;
  state.active = false;
  for (const [phase, screen] of [['home', 'home'], ['summary', 'settlement'],
    ['profile', 'profile'], ['restored', 'event']]) {
    state.screen = screen;
    assert.equal(probe.visualCapture(phase).phase, phase);
    state.screen = 'wrong';
    assert.throws(() => probe.visualCapture(phase), /visible phase mismatch/);
  }
});
