import { createServer, request as proxyRequest } from 'node:http';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('a browser auth callback never stores its one-time code in the PWA cache', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const server = createServer((incoming, response) => {
    const target = new URL(incoming.url, baseURL);
    if (target.pathname === '/auth/callback') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, max-age=0'
      });
      response.end('<!doctype html><title>QA callback</title><p>synthetic callback received</p>');
      return;
    }
    const forwarded = proxyRequest(target, {
      method: incoming.method,
      headers: incoming.headers
    }, upstream => {
      response.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(response);
    });
    forwarded.on('error', () => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
    incoming.pipe(forwarded);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);

    const code = 'qa-synthetic-one-time-code';
    const state = 'qa-synthetic-state';
    const callback = await page.goto(`${origin}/auth/callback?code=${code}&state=${state}`, {
      waitUntil: 'domcontentloaded'
    });
    expect(callback.status()).toBe(200);
    await expect(page.locator('body')).toContainText('synthetic callback received');

    const result = await page.evaluate(async () => {
      const urls = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        urls
      };
    });
    expect(result.controlled).toBe(true);
    expect(result.urls.some(url => url.includes('/auth/callback'))).toBe(false);
    expect(result.urls.some(url => url.includes(code) || url.includes(state))).toBe(false);
  } finally {
    await page.goto('about:blank').catch(() => {});
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
