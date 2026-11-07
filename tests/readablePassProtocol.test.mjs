import assert from 'node:assert/strict';
import test from 'node:test';
import { readable, readableAll } from '../e2e/helpers/syncNoticePresentation.mjs';

test('a stable readable text is rechecked after the first browser evaluation resolves', async () => {
  let evaluations = 0;
  const locator = { evaluate: async () => {
    evaluations += 1;
    return { text: 'visible', lines: [{ top: 0, h: 20, left: 0, right: 50 }],
      readable: true, passed: true, initial: { text: 'visible', lines: [{ top: 0 }] },
      last: { text: 'visible', lines: [{ top: 0 }] }, index: 0 };
  } };
  await readable(locator);
  assert.equal(evaluations, 2);
});

test('readability waits for current proof when a passing browser result becomes stale', async () => {
  let evaluations = 0;
  let currentReadable = false;
  const locator = { evaluate: async () => {
    evaluations += 1;
    // The first proof was valid inside the browser, then a late render clipped it
    // before the awaited protocol result reached the caller.
    if (evaluations === 1) return { passed: true };
    currentReadable = evaluations > 2;
    return { passed: currentReadable };
  } };
  await readable(locator);
  assert.equal(currentReadable, true, 'a stale passing result cannot finish the check');
});

function batchFixture(changed = false) {
  const texts = Array.from({ length: 20 }, (_, i) => `row ${i}`);
  const starts = [];
  let reads = 0;
  const container = {
    locator: () => ({ allTextContents: async () => {
      reads += 1;
      return changed && reads > 1 ? [...texts.slice(0, 19), 'changed row'] : texts;
    } }),
    evaluate: async (_probe, { start, count }) => {
      starts.push(start);
      return { total: texts.length, outcomes: Array.from({ length: Math.min(count, texts.length - start) },
        () => ({ passed: true })) };
    }
  };
  return { container, starts };
}

test('batched readability covers the full tail with two protocol evaluations', async () => {
  const { container, starts } = batchFixture();
  await readableAll(container, '.leaf');
  assert.deepEqual(starts, [0, 16]);
});

test('batched readability rejects text changes between groups', async () => {
  const { container } = batchFixture(true);
  await assert.rejects(readableAll(container, '.leaf'));
});
