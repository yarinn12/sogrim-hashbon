import { expect, test } from '@playwright/test';
import { openRenderedHome } from '../e2e/helpers/typographyReadiness.mjs';

const path = '/__qa_firefox_navigation_commit';
const home = '<!doctype html><html><body>'
  + '<main class="screen" data-screen-kind="home">ready</main>'
  + '<script>performance.mark("sogrim:start:app-module-ready")</script>'
  + '</body></html>';

test('rendered home survives a pending Firefox commit navigation result', async ({ page, baseURL }) => {
  test.setTimeout(10_000);
  await page.route(`${baseURL}${path}`, route => route.fulfill({
    status: 200, contentType: 'text/html', body: home
  }));

  const goto = page.goto.bind(page);
  page.goto = async (...args) => {
    await goto(...args);
    return new Promise(() => {});
  };

  await openRenderedHome(page, { path, readyTimeoutMs: 1_000 });
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('ready');
  expect(new URL(page.url()).pathname).toBe(path);
});

test('a stale home at the same URL cannot satisfy a new navigation', async ({ page, baseURL }) => {
  let visits = 0;
  await page.route(`${baseURL}${path}`, async route => {
    visits += 1;
    if (visits === 2) await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200, contentType: 'text/html',
      body: home.replace('>ready</main>', `>${visits === 1 ? 'stale' : 'fresh'}</main>`)
    });
  });
  await openRenderedHome(page, { path, readyTimeoutMs: 1_000 });
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('stale');

  const started = Date.now();
  await openRenderedHome(page, { path, readyTimeoutMs: 1_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(450);
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('fresh');
});

test('a rejected navigation cannot pass using an old home', async ({ page, baseURL }) => {
  await page.route(`${baseURL}${path}`, route => route.fulfill({
    status: 200, contentType: 'text/html', body: home
  }));
  await openRenderedHome(page, { path, readyTimeoutMs: 1_000 });
  const failedPath = '/__qa_firefox_navigation_rejected';
  await page.route(`${baseURL}${failedPath}`, route => route.abort('failed'));
  await expect(openRenderedHome(page, { path: failedPath, readyTimeoutMs: 1_000 }))
    .rejects.toThrow('Home navigation failed');
});
