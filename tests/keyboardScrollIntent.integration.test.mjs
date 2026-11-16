import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/publicMobileModalLayer.mjs', import.meta.url), 'utf8');
// Execute the actual controller with adapter geometry and a held animation frame.
// The full browser regression separately checks painted boxes and hit ownership.
const start = source.indexOf('\nfunction setupKeyboardViewport() {');
const end = source.indexOf('\nfunction syncResponsiveTabletShell()', start);
assert.ok(start >= 0 && end > start);
assert.equal(source.split('\nfunction setupKeyboardViewport() {').length, 2);
const controller = source.slice(start, end).trim();

function fixture(kind) {
  class Element {}
  const frames = [], observers = [], classes = new Set(), styles = new Map();
  const modal = new Element();
  modal.scrollTop = 1100;
  modal.querySelectorAll = () => [];
  modal.querySelector = selector => selector === '.expense-modal-actions'
    ? { getBoundingClientRect: () => ({ top: 300, bottom: 340 }) } : null;
  let measuredField = 0;
  const field = new Element();
  field.closest = selector => kind === 'expense'
    ? selector === '.expense-step-modal' ? modal : null
    : selector === '.restaurant-review-design' ? modal : null;
  field.matches = selector => selector.includes('textarea, [contenteditable]')
    || (kind === 'expense' ? selector.includes('expense-total') : selector.includes('quick-item-amount'));
  field.getBoundingClientRect = () => {
    measuredField++;
    return { top: 1200 - modal.scrollTop, bottom: 1240 - modal.scrollTop, height: 40 };
  };
  const document = Object.assign(new EventTarget(), {
    activeElement: field,
    documentElement: {
      classList: { contains: name => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      style: { getPropertyValue: name => styles.get(name) || '', setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) }
    }
  });
  const viewport = Object.assign(new EventTarget(), { height: 340, offsetTop: 0, scale: 1 });
  const window = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 852 });
  runInNewContext('(' + controller + ')()', {
    window, document, Element, requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    getComputedStyle: () => ({ getPropertyValue: () => '0', paddingTop: '0' }),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() {}
    }
  });
  const flush = () => { const callback = frames.shift(); assert.ok(callback); callback(); };
  flush();
  assert.equal(modal.scrollTop, 1100);
  assert.ok(classes.has('app-software-keyboard-open'));
  assert.equal(observers.length, 1);
  return { modal, document, flush, layout: () => observers[0].callback([]), measurements: () => measuredField };
}

for (const kind of ['expense', 'restaurant']) {
  for (const [direction, position] of [['down', 1500], ['up', 700]]) {
    test(`${kind}: a newer ${direction} scroll survives an already queued keyboard layout correction`, () => {
      const f = fixture(kind);
      f.layout();
      f.modal.scrollTop = position;
      f.layout(); // A second observer notification must retain the first snapshot.
      const before = f.measurements();
      f.flush();
      assert.equal(f.modal.scrollTop, position, 'The earlier focused field must not undo newer reading/navigation scroll');
      assert.equal(f.measurements(), before, 'Do not reveal an older field after the newer scroll');
    });
  }
  test(`${kind}: fresh editing after a newer scroll still reveals the focused field`, () => {
    const f = fixture(kind);
    f.layout();
    f.modal.scrollTop = 700;
    f.flush();
    assert.equal(f.modal.scrollTop, 700);
    f.document.dispatchEvent(new Event('input'));
    f.flush();
    assert.ok(f.modal.scrollTop > 700);
    assert.ok(1200 - f.modal.scrollTop >= 4 && 1240 - f.modal.scrollTop <= 292);
  });
}
