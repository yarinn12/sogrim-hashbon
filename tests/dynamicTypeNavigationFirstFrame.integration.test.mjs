import test from 'node:test';
import assert from 'node:assert/strict';
import { watchDynamicTypeControls } from '../src/publicDynamicTypeLayer.mjs';

// Real product controller and layout writer with the browser event/RAF boundary
// held explicitly. Browser rendering remains covered by the existing UI suite.
function fixture() {
  const frames = [], classes = new Set(['dynamic-type-active']), values = new Map();
  let resizeCallback;
  const view = new EventTarget();
  view.requestAnimationFrame = callback => frames.push(callback);
  view.ResizeObserver = class {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    unobserve() {}
  };
  view.getComputedStyle = () => ({ paddingLeft: '8px', paddingRight: '8px', columnGap: '2px' });
  const root = {
    classList: {
      contains: name => classes.has(name), remove: name => classes.delete(name),
      toggle(name, active) { active ? classes.add(name) : classes.delete(name); }
    },
    style: {
      getPropertyValue: name => values.get(name) || '',
      setProperty: (name, value) => values.set(name, value),
      removeProperty: name => values.delete(name)
    }
  };
  const labels = [42, 72, 94, 75].map(width => ({ width }));
  const nav = {
    clientWidth: 800,
    getBoundingClientRect: () => ({ width: nav.clientWidth, height: classes.has('dynamic-type-nav-stacked') ? 160 : 82 }),
    querySelectorAll: () => labels
  };
  const document = new EventTarget();
  Object.assign(document, {
    documentElement: root, defaultView: view,
    querySelectorAll: () => [nav], querySelector: () => ({ getBoundingClientRect: () => ({ height: 64 }) }),
    createRange() {
      let element;
      return { selectNodeContents: value => { element = value; }, getBoundingClientRect: () => ({ width: element.width }) };
    }
  });
  root.ownerDocument = document;
  return { root, view, document, nav, classes, values, frames, resize: () => resizeCallback(),
    frame() { const current = frames.splice(0); for (const callback of current) callback(); } };
}

function useFixture(run) {
  const original = globalThis.document, f = fixture();
  globalThis.document = f.document;
  try { run(f); } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

test('an already visible enlarged navigation fits before the first scheduled layout frame', () => useFixture(f => {
  f.nav.clientWidth = 320;
  watchDynamicTypeControls(f.root);
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), true, 'initial glyph overflow must be resolved before RAF');
  assert.equal(f.values.get('--dynamic-type-measured-nav-block'), '160px');
  assert.equal(f.frames.length, 1, 'resize observation is still installed outside the synchronous layout update');
}));

for (const event of ['settle-friends:screen-rendered', 'settle-friends:accessibility-preferences-changed', 'settle-friends:primary-navigation-rendered']) {
  test(`${event} updates actual navigation clearance while a prior frame is pending`, () => useFixture(f => {
    watchDynamicTypeControls(f.root);
    f.frame();
    assert.equal(f.classes.has('dynamic-type-nav-stacked'), false);
    f.resize();
    f.nav.clientWidth = 320;
    f.document.dispatchEvent(new Event(event));
    assert.equal(f.frames.length, 1, 'one pending observation frame remains');
    assert.equal(f.classes.has('dynamic-type-nav-stacked'), true, 'the event must not leave enlarged glyphs overflowing until RAF');
    assert.equal(f.values.get('--dynamic-type-measured-nav-block'), '160px');
    f.frame();
    assert.equal(f.values.get('--dynamic-type-measured-nav-block'), '160px');
  }));
}

test('viewport resize and pageshow resolve enlarged navigation before a pending observation frame', () => useFixture(f => {
  watchDynamicTypeControls(f.root);
  f.frame();
  f.nav.clientWidth = 320;
  f.view.dispatchEvent(new Event('resize'));
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), true);
  f.nav.clientWidth = 800;
  f.view.dispatchEvent(new Event('pageshow'));
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), false);
  assert.equal(f.values.get('--dynamic-type-measured-nav-block'), '82px');
}));

test('ResizeObserver layout writes remain outside its delivery cycle', () => useFixture(f => {
  watchDynamicTypeControls(f.root);
  f.frame();
  f.nav.clientWidth = 320;
  f.resize();
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), false);
  f.frame();
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), true);
  f.classes.delete('dynamic-type-active');
  f.document.dispatchEvent(new Event('settle-friends:accessibility-preferences-changed'));
  f.frame();
  assert.equal(f.classes.has('dynamic-type-nav-stacked'), false);
  assert.equal(f.values.has('--dynamic-type-measured-nav-block'), false);
}));
