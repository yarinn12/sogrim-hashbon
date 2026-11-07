import { expect, test } from '@playwright/test';
import { openHeldRenderedHome, requireHeldHomeReadiness } from './helpers/heldHomeReadinessControl.mjs';

requireHeldHomeReadiness(test);
test.use({ serviceWorkers: 'block' });

const owner = 'system-text-owner';
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: 'בודק נגישות', kind: 'user', avatarPreset: 'avatar-1' }],
  events: [{
    id: 'system-text-event', name: 'בדיקת אותיות מוגדלות', currency: 'ILS',
    participantIds: [owner], adminIds: [owner], createdByParticipantId: owner,
    createdAt: '2026-10-17T06:00:00.000Z', expenses: [], transfers: [], activityLog: []
  }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: []
};

// Inspect the rendered letters, including nested strong/span elements. A growing
// button wrapper alone previously concealed fixed-size text inside the button.
async function readGlyphs(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const button = element.closest('button').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      text: element.textContent.trim(),
      font: parseFloat(getComputedStyle(element).fontSize),
      fits: [...range.getClientRects()].every(rect =>
        rect.left >= button.left - 1 && rect.right <= button.right + 1
        && rect.top >= button.top - 1 && rect.bottom <= button.bottom + 1)
    };
  }));
}

test('system text at startup grows real Home glyphs without clipping, collisions or hidden final rows', async ({ page, request }) => {
  await request.post('/api/reset');
  await request.put('/api/state', { data: state });
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant', owner);
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({
      participantId: owner, displayName: 'בודק נגישות', avatarPreset: 'avatar-1'
    }));
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  }, { state, owner });

  // Normal-size text also needs to fit the narrow event text column. Before
  // wrapping was allowed, status and participant glyphs extended under the menu.
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await openHeldRenderedHome(page);
    await page.evaluate(() => document.fonts.ready);
    const copy = await readGlyphs(page,
      '.event-row-state, .event-row-details span:not([aria-hidden="true"])');
    expect(copy.length).toBeGreaterThan(0);
    for (const glyph of copy) expect(glyph.fits, width + 'px: ' + glyph.text).toBe(true);
    await expect(page.locator('.event-lifecycle-filter')).toHaveCount(0);
  }

  // Synthetic system-probe measurement before app startup. This exercises the
  // actual Apple sizing path, but is not a real-device or native WebView test.
  await page.addInitScript(() => {
    const body = Number(new URLSearchParams(location.search).get('qa-system-body')) || 17;
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (...args) => args[0] === 'font' && args[1] === '-apple-system-body'
      ? true : supports(...args);
    const media = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const original = media(query);
      if (query.replaceAll(' ', '') !== '(any-pointer:coarse)') return original;
      return {
        matches: true, media: query,
        addEventListener: original.addEventListener.bind(original),
        removeEventListener: original.removeEventListener.bind(original),
        addListener: original.addListener.bind(original),
        removeListener: original.removeListener.bind(original)
      };
    };
    const addProbeSize = () => {
      const style = document.createElement('style');
      style.textContent = `#apple-system-body-size-probe{font-size:${body}px!important}`;
      document.head.append(style);
    };
    if (document.head) addProbeSize();
    else document.addEventListener('DOMContentLoaded', addProbeSize, { once: true });
  });

  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    let baseline;
    for (const size of [16, 32, 40 * 16 / 17]) {
      await openHeldRenderedHome(page, { path: `/?qa-system-body=${size * 17 / 16}` });
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.locator('.home-create-event-action strong')
        .evaluate(element => parseFloat(getComputedStyle(element).fontSize)))
        .toBeGreaterThanOrEqual(size === 16 ? 16 : size * 0.95);

      const [action] = await readGlyphs(page, '.home-create-event-action strong');
      const titles = await readGlyphs(page, '.event-row-title strong');
      const filters = await readGlyphs(page, '.event-primary-filter button > span');
      const labels = await readGlyphs(page,
        '.product-app-nav .product-nav-button > span:not(.product-nav-badge)');
      const eventCopy = await readGlyphs(page,
        '.event-row-state, .event-row-details span:not([aria-hidden="true"])');

      expect(labels).toHaveLength(4);
      expect(filters).toHaveLength(2);
      await expect(page.locator('.event-lifecycle-filter')).toHaveCount(0);
      expect(titles.length).toBeGreaterThan(0);
      for (const glyph of [action, ...titles, ...filters, ...labels, ...eventCopy]) {
        expect(glyph.fits, `${width}px/${size}px: ${glyph.text}`).toBe(true);
      }
      for (const title of titles) expect(title.font).toBeGreaterThanOrEqual(size * 0.95);
      expect(await page.locator('html').evaluate(element =>
        parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(size, 2);
      if (size === 16) baseline = { action, labels };
      else {
        expect(action.font).toBeGreaterThanOrEqual(baseline.action.font * 1.8);
        labels.forEach((label, index) =>
          expect(label.font).toBeGreaterThanOrEqual(baseline.labels[index].font * 1.8));
      }

      await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
      await expect.poll(() => page.locator('.event-row').last().evaluate(element =>
        document.querySelector('.product-app-nav').getBoundingClientRect().top
        - element.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(12);
    }
  }
});
