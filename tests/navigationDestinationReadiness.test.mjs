import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderedNavigationDestinationReady, openRenderedNavigationDestination }
  from '../e2e/helpers/renderedNavigationDestination.mjs';

function probe({ id = 'new', url = 'http://127.0.0.1:4188/?event=test',
  screen = 'event', width = 300, height = 600, display = 'block', visibility = 'visible' } = {}) {
  const expected = { previousDocumentId: 'old', targetURL: 'http://127.0.0.1:4188/?event=test', screenKind: 'event' };
  return runInNewContext(`(${renderedNavigationDestinationReady.toString()})(input)`, {
    input: expected, window: { __qaNavigationDocumentId: id }, location: { href: url },
    document: { readyState: 'interactive', querySelector(selector) {
      return selector === `.screen[data-screen-kind="${screen}"]`
        ? { getBoundingClientRect: () => ({ width, height }) } : null;
    } }, getComputedStyle: () => ({ display, visibility })
  });
}

test('a fresh matching visible event can be ready while document load is pending', () => {
  assert.equal(probe(), true);
});

for (const [name, change] of [
  ['stale screen in the previous document', { id: 'old' }],
  ['document with no navigation marker', { id: null }],
  ['ready event at the wrong URL', { url: 'http://127.0.0.1:4188/' }],
  ['home instead of the requested event', { screen: 'home' }],
  ['zero width screen', { width: 0 }],
  ['zero height screen', { height: 0 }],
  ['hidden destination', { visibility: 'hidden' }],
  ['collapsed destination', { visibility: 'collapse' }],
  ['destination removed from layout', { display: 'none' }]
]) test(`navigation readiness rejects ${name}`, () => {
  assert.equal(probe(change), false);
});

test('navigation cannot increase its readiness budget or accept an unsupported screen', async () => {
  for (const timeoutMs of [0, -1, 30_001, Infinity, 1.5]) {
    await assert.rejects(openRenderedNavigationDestination({}, {
      baseURL: 'http://127.0.0.1:4188', path: '/', screenKind: 'event', timeoutMs
    }), /bounded positive timeout/);
  }
  await assert.rejects(openRenderedNavigationDestination({}, {
    baseURL: 'http://127.0.0.1:4188', path: '/', screenKind: 'other'
  }), /Unsupported navigation destination/);
});
