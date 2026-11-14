import { test, expect } from '@playwright/test';
import { probeReadablePass } from './helpers/syncNoticePresentation.mjs';

test('one-pass readability measures every row and rejects clipping, overlays and changed rows', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.setContent(`<style>
    body { margin: 0; }
    .event-modal { position: fixed; top: 40px; left: 20px; width: 220px; height: 100px; overflow: auto; }
    #target { display: block; width: 180px; font: 18px/24px Arial, sans-serif; }
  </style><div class="event-modal"><p id="target">${'alpha beta gamma delta epsilon '.repeat(8)}</p></div>`);
  const target = page.locator('#target');
  const good = await target.evaluate(probeReadablePass);
  expect(good.initial.lines.length).toBeGreaterThan(2);
  expect(good.passed).toBe(true);

  await target.evaluate(e => { e.style.height = '16px'; e.style.overflow = 'hidden'; });
  const clipped = await target.evaluate(probeReadablePass);
  expect(clipped.passed).toBe(false);
  expect(clipped.last.readable).toBe(false);

  await target.evaluate(e => { e.style.height = ''; e.style.overflow = ''; });
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'cover';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:transparent';
    document.body.append(overlay);
  });
  const covered = await target.evaluate(probeReadablePass);
  expect(covered.passed).toBe(false);
  expect(covered.last.readable).toBe(false);
  await page.locator('#cover').evaluate(e => e.remove());

  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    let changed = false;
    window.requestAnimationFrame = callback => original(time => {
      if (!changed) { changed = true; document.querySelector('#target').style.width = '60px'; }
      callback(time);
    });
    window.__restoreFrame = () => { window.requestAnimationFrame = original; };
  });
  try {
    const changedRows = await target.evaluate(probeReadablePass);
    expect(changedRows.passed).toBe(false);
    expect(changedRows.last.lines.length).not.toBe(changedRows.initial.lines.length);
  } finally {
    await page.evaluate(() => { window.__restoreFrame(); delete window.__restoreFrame; });
  }

  await target.evaluate(e => { e.style.width = '180px'; });
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    let changed = false;
    window.requestAnimationFrame = callback => original(time => {
      if (!changed) { changed = true; document.querySelector('#target').textContent += ' changed'; }
      callback(time);
    });
    window.__restoreFrame = () => { window.requestAnimationFrame = original; };
  });
  try {
    const changedText = await target.evaluate(probeReadablePass);
    expect(changedText.passed).toBe(false);
    expect(changedText.last.text).not.toBe(changedText.initial.text);
  } finally {
    await page.evaluate(() => { window.__restoreFrame(); delete window.__restoreFrame; });
  }
});

test('batched pass counts every matching leaf and detects a clipped leaf in the tail', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.setContent(`<style>
    body { margin: 0; }
    .event-modal { position: fixed; top: 30px; left: 20px; width: 180px; height: 100px; overflow: auto; }
    .leaf { display: block; width: 150px; font: 18px/24px Arial, sans-serif; }
  </style><div class="event-modal">${Array.from({ length: 20 }, (_, i) =>
    `<p class="leaf" data-index="${i}">${i === 19 ? 'alpha beta gamma delta epsilon' : `row ${i}`}</p>`).join('')}</div>`);
  const modal = page.locator('.event-modal');
  const first = await modal.evaluate(probeReadablePass, { selector: '.leaf', start: 0, count: 16 });
  const tail = await modal.evaluate(probeReadablePass, { selector: '.leaf', start: 16, count: 16 });
  expect(first.total).toBe(20);
  expect(first.outcomes).toHaveLength(16);
  expect(first.outcomes.every(x => x.passed)).toBe(true);
  expect(tail.total).toBe(20);
  expect(tail.outcomes).toHaveLength(4);
  expect(tail.outcomes.every(x => x.passed)).toBe(true);
  await modal.locator('[data-index="19"]').evaluate(e => { e.style.height = '16px'; e.style.overflow = 'hidden'; });
  const clippedTail = await modal.evaluate(probeReadablePass, { selector: '.leaf', start: 16, count: 16 });
  expect(clippedTail.total).toBe(20);
  expect(clippedTail.outcomes).toHaveLength(4);
  expect(clippedTail.outcomes[3].passed).toBe(false);
});
