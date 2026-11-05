import { test, expect } from '@playwright/test';
import { readable } from './helpers/syncNoticePresentation.mjs';

for (const [mode, modalBottom] of [
  ['modal shrinks', 'var(--nav-height, 80px)'],
  ['navigation overlays fixed modal', '80px']
]) test(`sync notice glyph remains reachable when ${mode} after modal scroll`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 390 });
  await page.setContent(`
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; }
      .event-modal { position: fixed; inset: 0 0 ${modalBottom}; overflow-y: auto; background: white; }
      .before { height: 450px; }
      .copy { display: block; margin: 0 16px; font: 28px/1.3 sans-serif; }
      .after { height: 600px; }
      .product-app-nav { position: fixed; inset: auto 0 0; height: var(--nav-height, 80px); background: #dce5e2; }
    </style>
    <section class="event-modal"><div class="before"></div><p class="copy">שומרים את כל העדכונים</p><div class="after"></div></section>
    <nav class="product-app-nav" aria-label="ניווט ראשי"></nav>
  `);
  await page.locator('.event-modal').evaluate(host => {
    const native = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    let expanded = false;
    Object.defineProperty(host, 'scrollTop', {
      configurable: true,
      get() { return native.get.call(this); },
      set(value) {
        native.set.call(this, value);
        if (value > 0 && !expanded) {
          expanded = true;
          document.documentElement.style.setProperty('--nav-height', '270px');
        }
      }
    });
  });
  const copy = page.locator('.copy');
  await readable(copy);
  await expect(page.locator('.product-app-nav')).toHaveCSS('height', '270px');
  expect(await copy.evaluate(element => {
    const host = element.closest('.event-modal').getBoundingClientRect();
    const nav = document.querySelector('.product-app-nav').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].every(rect => {
      const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      return rect.top >= Math.max(0, host.top) - 1 && rect.bottom <= Math.min(innerHeight, host.bottom, nav.top) + 1 && hit && element.contains(hit);
    });
  })).toBe(true);
});
