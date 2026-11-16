import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openTypographyHome} from './helpers/typographyReadiness.mjs';

const fixture = readFileSync(new URL('./fixtures/eventActivityBootstrap.js', import.meta.url), 'utf8');
test.use({serviceWorkers: 'block'});

for (const release of ['original action', 'sibling action']) test(`a same-account home refresh preserves only the original event activation: ${release}`, async ({page}) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : (external.push(route.request().url()), route.abort()));
  await page.addInitScript({content: fixture});
  await page.setViewportSize({width: 852, height: 393});
  await openTypographyHome(page, {path: '/?review=1&requests=accepted&reward=inactive&dynamic-type-preview=32'});
  const card = page.locator('.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]');
  await expect(card).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  let point;
  await expect.poll(async () => {
    point = await page.evaluate(async () => {
      const selector = '.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]';
      const node = document.querySelector(selector);
      if (!node) return null;
      node.scrollIntoView({block: 'center', behavior: 'instant'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!node.isConnected || document.querySelector(selector) !== node) return null;
      const box = node.getBoundingClientRect();
      const point = {x: box.x + box.width / 2, y: Math.max(1, box.y) + Math.min(box.height / 2, 35)};
      return node.contains(document.elementFromPoint(point.x, point.y)) ? point : null;
    });
    return Boolean(point);
  }).toBe(true);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const evidence = await page.evaluate(() => {
    const before = document.querySelector('.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]');
    const key = 'settle-friends-personal-event-archive-v1:account-11111111-1111-4111-8111-111111111111';
    localStorage.setItem(key, JSON.stringify(['friend-beach']));
    window.dispatchEvent(new StorageEvent('storage', {key: null}));
    const after = document.querySelector('.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]');
    return {replaced: before !== after, beforeConnected: before.isConnected,
      afterConnected: after?.isConnected, eventId: after?.dataset.eventId};
  });
  expect(evidence).toEqual({replaced: true, beforeConnected: false, afterConnected: true, eventId: 'friend-weekend'});
  if (release === 'sibling action') {
    const target = await page.evaluate(({x, y}) => {
      const card = document.querySelector('.product-home-screen [data-long-press-event][data-event-id="friend-weekend"]');
      const button = card.querySelector('[data-action="event-status-select"]');
      const box = card.getBoundingClientRect();
      card.style.setProperty('position', 'relative', 'important');
      button.style.cssText = `inset:auto!important;position:absolute!important;left:${x-box.left-22}px!important;top:${y-box.top-22}px!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;margin:0!important;transform:none!important;transition:none!important;z-index:9999!important`;
      return document.elementFromPoint(x, y)?.closest('[data-action]')?.dataset.action;
    }, point);
    expect(target).toBe('event-status-select');
  }
  await page.mouse.up();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', release === 'original action' ? 'event' : 'home');
  if (release === 'original action') await expect(page.locator('.screen [data-action="open-event-settings"]')).toBeVisible();
  else await expect(page.locator('.event-status-menu')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
