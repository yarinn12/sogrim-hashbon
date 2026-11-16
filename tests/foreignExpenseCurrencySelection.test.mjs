import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the actual E2E selector helper, including the original count/getter race.
// The model represents the removed conversion panel; it does not mock money rules.
const file = readFileSync(new URL('../e2e/foreign-expense-input.spec.mjs', import.meta.url), 'utf8');
const begin = file.indexOf('async function selectSourceCurrency(');
const end = file.indexOf('\nfunction openAccessResponse(', begin);
assert.ok(begin >= 0 && end > begin);

function fixture({ base = 'ILS', initial = 'USD', deferRender = false, staleCount = false,
  missingForeignPanel = false, retainedBasePanel = false, initiallyOpen = false } = {}) {
  const state = { currency: initial, panel: initial !== base, open: initiallyOpen,
    acknowledged: false, getterCalls: 0, summaryClicks: 0, pending: null };
  const render = () => {
    if (!state.pending) return;
    state.currency = state.pending;
    state.panel = state.currency === base ? retainedBasePanel : !missingForeignPanel;
    state.open = initiallyOpen;
    state.pending = null;
  };
  const summary = { async click() { assert.ok(state.panel, 'cannot open a removed panel'); state.open = true; state.summaryClicks++; } };
  const details = {
    kind: 'details',
    async count() { return staleCount ? 1 : Number(state.panel); },
    async getAttribute(name) {
      assert.equal(name, 'open'); state.getterCalls++;
      assert.ok(state.panel, 'attribute queried after the FX panel was removed');
      assert.ok(!state.pending, 'optional FX panel queried before rendered selection');
      return state.open ? '' : null;
    },
    locator(selector) { assert.equal(selector, 'summary'); return summary; }
  };
  const select = { kind: 'select' };
  const page = { locator(selector) {
    if (selector === '[data-choice-select-action="expense-source-currency"]') return { async click() {} };
    const option = selector.match(/^\.app-choice-option\[data-choice-value="([A-Z]{3})"\]$/);
    if (option) return { async click() { state.pending = option[1]; if (!deferRender) render(); } };
    if (selector === '[data-action="expense-source-currency"]') return select;
    if (selector === 'details.expense-fx-details') return details;
    throw new Error('Unexpected selector: ' + selector);
  } };
  const expect = target => ({
    async toHaveValue(value) { assert.equal(target, select); render(); assert.equal(state.currency, value); state.acknowledged = true; },
    async toHaveCount(count) { assert.equal(target, details); assert.equal(Number(state.panel), count, 'conversion panel existence must match selected mode'); }
  });
  const helper = vm.runInNewContext('(' + file.slice(begin, end).trim() + ')', { expect, state: { events: [{ currency: base }] } });
  return { state, select: (currency, options) => helper(page, currency, options) };
}

test('returning to base currency never queries a panel removed after a stale positive count', async () => {
  const f = fixture({ staleCount: true }); await f.select('ILS');
  assert.equal(f.state.currency, 'ILS'); assert.equal(f.state.panel, false);
  assert.equal(f.state.getterCalls, 0); assert.equal(f.state.acknowledged, true);
});
test('selection is acknowledged after rendering before optional details are inspected', async () => {
  const f = fixture({ initial: 'ILS', deferRender: true }); await f.select('USD');
  assert.equal(f.state.currency, 'USD'); assert.equal(f.state.acknowledged, true);
  assert.equal(f.state.open, true);
});
test('a missing foreign-currency panel fails instead of silently skipping conversion controls', async () => {
  const f = fixture({ initial: 'ILS', missingForeignPanel: true });
  await assert.rejects(f.select('USD'), /conversion panel existence/);
});
test('a base-currency selection must actually remove the conversion panel', async () => {
  const f = fixture({ retainedBasePanel: true });
  await assert.rejects(f.select('ILS'), /conversion panel existence/);
});
test('foreign-currency details still open for a closed panel', async () => {
  const f = fixture({ initial: 'ILS' }); await f.select('USD');
  assert.equal(f.state.open, true); assert.equal(f.state.summaryClicks, 1);
});
test('an already open foreign-currency panel is not toggled closed', async () => {
  const f = fixture({ initial: 'ILS', initiallyOpen: true }); await f.select('USD');
  assert.equal(f.state.open, true); assert.equal(f.state.summaryClicks, 0);
});
test('manual-quote callers still wait for the selected currency without opening details', async () => {
  const f = fixture({ initial: 'ILS', deferRender: true }); await f.select('JOD', { openDetails: false });
  assert.equal(f.state.currency, 'JOD'); assert.equal(f.state.acknowledged, true);
  assert.equal(f.state.summaryClicks, 0);
});
test('the event currency determines panel removal rather than a hard-coded currency', async () => {
  const f = fixture({ base: 'USD', initial: 'ILS', staleCount: true }); await f.select('USD');
  assert.equal(f.state.currency, 'USD'); assert.equal(f.state.panel, false);
  assert.equal(f.state.getterCalls, 0); assert.equal(f.state.acknowledged, true);
});
