import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openRestaurantBill } from './helpers/restaurantBillPresentation.mjs';

const fixture = readFileSync(new URL('./fixtures/restaurantBillBootstrap.js', import.meta.url), 'utf8');
test.use({ serviceWorkers: 'block' });

for (const root of [16, 32]) test('a newer scroll to Next survives an older layout correction at root ' + root, async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'software keyboard geometry applies to touch profiles');
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript({ content: 'localStorage.clear();\n' + fixture });
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__restaurantKeyboard = (height, offsetTop = 0) => {
      Object.assign(viewport, { height, offsetTop });
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
    const original = window.requestAnimationFrame.bind(window), held = [];
    let nextId = 1000000, pending = 0;
    window.__holdKeyboardCorrection = false;
    window.requestAnimationFrame = callback => {
      if (new Error().stack?.includes('publicMobileModalLayer.mjs')) {
        if (window.__holdKeyboardCorrection) {
          held.push(callback);
          return ++nextId;
        }
        pending++;
        return original(time => { pending--; callback(time); });
      }
      return original(callback);
    };
    window.__pendingKeyboardCorrections = () => pending;
    window.__keyboardCorrectionCount = () => held.length;
    window.__releaseKeyboardCorrection = () => {
      window.__holdKeyboardCorrection = false;
      for (const callback of held.splice(0)) callback(performance.now());
    };
  });
  const dialog = await openRestaurantBill(page, 'items', { width: 320, root });
  const amount = dialog.locator('[data-action="quick-item-amount"]').first();
  await amount.focus();
  await expect(amount).toBeFocused();
  await page.evaluate(() => window.__restaurantKeyboard(340));
  await expect(page.locator('html')).toHaveClass(/app-software-keyboard-open/);
  await expect.poll(() => amount.evaluate(element => {
    const r = element.getBoundingClientRect(), v = visualViewport;
    return r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1;
  })).toBe(true);
  // Finish earlier controller work, then queue its real viewport event. Perform
  // a newer accessibility/programmatic navigation scroll before that frame.
  await expect.poll(() => dialog.evaluate(element => {
    if (window.__holdKeyboardCorrection) return true;
    if (window.__pendingKeyboardCorrections()) return false;
    window.__holdKeyboardCorrection = true;
    element.querySelector('.expense-modal-actions').style.setProperty('padding-bottom', '23px', 'important');
    window.__restaurantKeyboard(339);
    return true;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__keyboardCorrectionCount())).toBeGreaterThan(0);
  const next = dialog.locator('.expense-modal-actions [data-stage="review"]');
  const ownsVisibleCenter = element => {
    const r = element.getBoundingClientRect(), v = visualViewport;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1 && (hit === element || element.contains(hit));
  };
  await next.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect.poll(() => next.evaluate(ownsVisibleCenter)).toBe(true);
  const before = await dialog.evaluate(element => element.scrollTop);
  await page.evaluate(() => window.__releaseKeyboardCorrection());
  const after = await dialog.evaluate(element => element.scrollTop);
  await info.attach('keyboard-scroll-order', { body: JSON.stringify({ before, after, root }), contentType: 'application/json' });
  await expect.poll(() => next.evaluate(ownsVisibleCenter)).toBe(true);
  await next.click();
  await expect(dialog).toHaveAttribute('data-quick-stage', 'review');
  await expect(dialog.locator('.quick-split-list .amount')).toHaveText(['₪100.00', '₪10.00', '₪10.00']);
});
