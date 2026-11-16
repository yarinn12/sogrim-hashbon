import { expect, test } from '@playwright/test';
import { resetLocalQaStateFresh } from './helpers/resetLocalQaStateFresh.mjs';
import { writeLocalQaStateFresh } from './helpers/writeLocalQaStateFresh.mjs';
import { openHeldRenderedHome, requireHeldHomeReadiness } from './helpers/heldHomeReadinessControl.mjs';

requireHeldHomeReadiness(test);
test.use({ serviceWorkers: 'block' });
const owner = 'first-frame-text-owner';
const state = {
  currentParticipantId: owner,
  participants: [{ id: owner, displayName: 'בדיקת נגישות', kind: 'user', avatarPreset: 'avatar-1' }],
  events: [{ id: 'first-frame-event', name: 'בדיקת ניווט מוגדל', currency: 'ILS', participantIds: [owner],
    adminIds: [owner], createdByParticipantId: owner, createdAt: '2026-10-17T06:00:00.000Z',
    expenses: [], transfers: [], activityLog: [] }],
  friendContacts: [], groups: [], deletedEvents: [], deletedParticipants: []
};

test.beforeEach(async ({ page, baseURL }) => {
  await resetLocalQaStateFresh(baseURL);
  await writeLocalQaStateFresh(baseURL, state);
  await page.addInitScript(({ state, owner }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('settle-friends-state', JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant', owner);
    localStorage.setItem('settle-friends-local-profile', JSON.stringify({ participantId: owner,
      displayName: 'בדיקת נגישות', avatarPreset: 'avatar-1' }));
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (...args) => args[0] === 'font' && args[1] === '-apple-system-body' ? true : supports(...args);
    const media = matchMedia.bind(window);
    window.matchMedia = query => {
      const original = media(query);
      if (query.replaceAll(' ', '') !== '(any-pointer:coarse)') return original;
      return { matches: true, media: query,
        addEventListener: original.addEventListener.bind(original), removeEventListener: original.removeEventListener.bind(original),
        addListener: original.addListener.bind(original), removeListener: original.removeListener.bind(original) };
    };
    const probe = () => {
      const style = document.createElement('style');
      style.textContent = '#apple-system-body-size-probe{font-size:40px!important}';
      document.head.append(style);
    };
    if (document.head) probe(); else document.addEventListener('DOMContentLoaded', probe, { once: true });
    const raf = requestAnimationFrame.bind(window);
    window.__qaHeldDynamicTypeFrames = [];
    window.requestAnimationFrame = callback => {
      // Delay only the product typography observation frames. Keep navigation,
      // route animations, held-resource controls and real font loading intact.
      if (new Error().stack.includes('/publicDynamicTypeLayer.mjs')) {
        window.__qaHeldDynamicTypeFrames.push(callback);
        return -window.__qaHeldDynamicTypeFrames.length;
      }
      return raf(callback);
    };
  }, { state, owner });
});

async function requireReadableNavigation(page) {
  const result = await page.locator('.product-app-nav').evaluate(nav => ({
    held: window.__qaHeldDynamicTypeFrames.length,
    rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    labels: [...nav.querySelectorAll('.product-nav-button > span:not(.product-nav-badge)')].map(label => {
      const button = label.closest('button').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label);
      return { text: label.textContent.trim(), font: parseFloat(getComputedStyle(label).fontSize),
        touchFits: button.width >= 44 && button.height >= 44,
        fits: [...range.getClientRects()].every(rect => rect.left >= button.left - 1 && rect.right <= button.right + 1
          && rect.top >= button.top - 1 && rect.bottom <= button.bottom + 1) };
    })
  }));
  expect(result.held, 'the typography observation frame must still be held').toBeGreaterThan(0);
  expect(result.rootFont).toBeCloseTo(40 * 16 / 17, 2);
  expect(result.labels).toHaveLength(4);
  for (const label of result.labels) {
    expect(label.fits, `${label.text}: enlarged glyphs must fit before the delayed frame`).toBe(true);
    expect(label.touchFits, label.text).toBe(true);
    expect(label.font, `${label.text}: retain the actual enlarged label font`).toBeGreaterThanOrEqual(result.rootFont * 0.7);
  }
}

test('enlarged navigation is readable while its observation frame is held', async ({ page }) => {
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    await openHeldRenderedHome(page);
    await page.evaluate(() => document.fonts.ready);
    await requireReadableNavigation(page);
  }
});

test('new navigation and rotation preserve enlarged glyphs before the observation frame', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 852 });
  await openHeldRenderedHome(page);
  await page.evaluate(() => document.fonts.ready);
  await requireReadableNavigation(page);
  await page.locator('.product-nav-button[data-nav-destination="friends"]').click();
  await expect(page.locator('.product-nav-button[data-nav-destination="friends"]')).toHaveAttribute('aria-current', 'page');
  await requireReadableNavigation(page);
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  await requireReadableNavigation(page);
  await page.setViewportSize({ width: 320, height: 852 });
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  await requireReadableNavigation(page);
});
