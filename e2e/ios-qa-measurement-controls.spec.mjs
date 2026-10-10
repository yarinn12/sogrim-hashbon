import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Install the exact DOM measurement functions shipped to the Native iOS QA
// journey. The native runner cannot run in Playwright, so this test extracts
// only its existing helpers and measure function without copying their logic.
const journey = await readFile(new URL('../scripts/qa/ios-parity/journey.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const from = journey.indexOf(start);
  if (from < 0 || journey.indexOf(start, from + start.length) >= 0) {
    throw new Error(`Expected one iOS QA source marker: ${start}`);
  }
  const to = journey.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`Missing iOS QA source marker: ${end}`);
  return journey.slice(from, to);
}
const nativeMeasureSource = [
  sourceBetween('  function visible(element) {', '  function first(selector) {'),
  sourceBetween('  function first(selector) {', '  function point(selector) {'),
  sourceBetween('  function measure(selector) {', '  let captureIndex = 0;')
].join('\n');

const WORD = 'ABCDEFGHIJKLMNO';
async function fixture(page) {
  await page.setContent(`
    <section id="frame" style="width:260px;overflow:visible;margin:32px">
      <strong id="target" style="display:block;width:220px;min-height:28px;white-space:nowrap;overflow:visible;font:20px/28px monospace">${WORD}</strong>
    </section>
  `);
  await page.evaluate(source => {
    globalThis.__iosQaMeasure = new Function(`${source}\nreturn measure;`)();
  }, nativeMeasureSource);
}
const measure = page => page.evaluate(() => globalThis.__iosQaMeasure('#target'));

// These are the relevant acceptance conditions in iOS parity's Native report
// validator. Faults below alter the DOM before the real measure function runs.
function measurementFailures(metric) {
  const failures = [];
  if (!metric.text.trim() || (!metric.isTextControl && !metric.words.length)) failures.push('missing glyph');
  if (metric.scrollWidth > metric.clientWidth + 1) failures.push('scroll overflow');
  if (metric.horizontalGlyphOverflow) failures.push('glyph overflow');
  if (metric.clippedByAncestor) failures.push('ancestor clip');
  return failures;
}
function expectReadable(metric) {
  expect(metric.text).toBe(WORD);
  expect(metric.words).toEqual([{ text: WORD, rows: 1, outsideTab: false }]);
  expect(metric.width).toBeGreaterThan(0);
  expect(measurementFailures(metric)).toEqual([]);
}

test('real iOS QA measurement rejects a narrowed, clipped text target and recovers', async ({ page }) => {
  await fixture(page);
  expectReadable(await measure(page));

  await page.locator('#target').evaluate(element => {
    element.style.width = '70px';
    element.style.overflow = 'hidden';
  });
  const fault = await measure(page);
  expect(fault.scrollWidth).toBeGreaterThan(fault.clientWidth + 1);
  expect(fault.horizontalGlyphOverflow).toBe(true);
  expect(measurementFailures(fault)).toContain('scroll overflow');
  expect(measurementFailures(fault)).toContain('glyph overflow');

  await page.locator('#target').evaluate(element => {
    element.style.width = '220px';
    element.style.overflow = 'visible';
  });
  expectReadable(await measure(page));
});

test('real iOS QA measurement rejects ancestor clipping even when the target fits itself', async ({ page }) => {
  await fixture(page);
  expectReadable(await measure(page));

  await page.locator('#frame').evaluate(element => {
    element.style.width = '70px';
    element.style.overflow = 'hidden';
  });
  const fault = await measure(page);
  expect(fault.scrollWidth).toBeLessThanOrEqual(fault.clientWidth + 1);
  expect(fault.horizontalGlyphOverflow).toBe(false);
  expect(fault.clippedByAncestor).toBe(true);
  expect(measurementFailures(fault)).toEqual(['ancestor clip']);

  await page.locator('#frame').evaluate(element => {
    element.style.width = '260px';
    element.style.overflow = 'visible';
  });
  expectReadable(await measure(page));
});

test('real iOS QA measurement rejects missing glyphs and an unrendered target', async ({ page }) => {
  await fixture(page);
  expectReadable(await measure(page));

  await page.locator('#target').evaluate(element => { element.textContent = ''; });
  const empty = await measure(page);
  expect(empty.words).toEqual([]);
  expect(measurementFailures(empty)).toEqual(['missing glyph']);
  await page.locator('#target').evaluate((element, word) => { element.textContent = word; }, WORD);
  expectReadable(await measure(page));

  await page.locator('#target').evaluate(element => { element.style.display = 'none'; });
  await expect(measure(page)).rejects.toThrow('Required typography target is missing: #target');
  await page.locator('#target').evaluate(element => { element.style.display = 'block'; });
  expectReadable(await measure(page));
});
