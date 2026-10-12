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

test('a rendered new home survives a stalled browser-side readiness waiter', async ({ page, baseURL }) => {
  const stalledPath = '/__qa_firefox_stalled_readiness_waiter';
  await page.route(`${baseURL}${stalledPath}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: home.replace('</body>',
      '<script>performance.mark("sogrim:start:first-screen-rendered")</script></body>')
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  let waiterCalled = false;
  page.waitForFunction = async (...args) => {
    waiterCalled = true;
    const ready = await waitForFunction(...args);
    await ready.dispose();
    // Reproduce Firefox's observed timeout after the new document and app
    // milestone are already visible to a separate page.evaluate call.
    return waitForFunction(() => false, null, { polling: 50, timeout: 150 });
  };

  await openRenderedHome(page, { path: stalledPath, bootTimeoutMs: 1_000, readyTimeoutMs: 1_000 });
  expect(waiterCalled).toBe(true);
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('ready');
  expect(new URL(page.url()).pathname).toBe(stalledPath);
});

test('a home after the boot deadline is accepted within the original UI budget', async ({ page, baseURL }) => {
  const path = '/__qa_firefox_boot_then_home';
  await page.route(`${baseURL}/__qa_late_domcontentloaded.js`, async route => {
    await new Promise(resolve => setTimeout(resolve, 650));
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await page.route(`${baseURL}${path}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><script>'
      + 'setTimeout(() => performance.mark("sogrim:start:app-module-ready"), 100);'
      + 'setTimeout(() => {'
      + 'const main = document.createElement("main");'
      + 'main.className = "screen"; main.dataset.screenKind = "home"; main.textContent = "ready";'
      + 'document.body.append(main);'
      + 'performance.mark("sogrim:start:first-screen-rendered")'
      + '}, 500);'
      + '</script><script defer src="/__qa_late_domcontentloaded.js"></script></body></html>'
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = () => waitForFunction(() => false, null, { polling: 50, timeout: 300 });

  const startedAt = Date.now();
  await openRenderedHome(page, { path, bootTimeoutMs: 300, readyTimeoutMs: 700 });
  const marks = await page.evaluate(() => Object.fromEntries(
    performance.getEntriesByType('mark').map(mark => [mark.name, performance.timeOrigin + mark.startTime])));
  expect(marks['sogrim:start:app-module-ready']).toBeLessThan(startedAt + 300);
  expect(marks['sogrim:start:first-screen-rendered']).toBeGreaterThan(startedAt + 300);
  expect(marks['sogrim:start:first-screen-rendered'])
    .toBeLessThan(marks['sogrim:start:app-module-ready'] + 700);
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('ready');
});

test('a late-rendered home cannot recover an expired boot budget', async ({ page, baseURL }) => {
  const latePath = '/__qa_firefox_late_readiness_waiter';
  await page.route(`${baseURL}/__qa_late_boot.js`, async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ status: 200, contentType: 'text/javascript',
      body: 'performance.mark("sogrim:start:app-module-ready"); performance.mark("sogrim:start:first-screen-rendered")' });
  });
  await page.route(`${baseURL}${latePath}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><main class="screen" data-screen-kind="home">late</main>'
      + '<script defer src="/__qa_late_boot.js"></script></body></html>'
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = async () => {
    await waitForFunction(pathname => location.pathname === pathname
      && document.readyState === 'complete', latePath);
    return waitForFunction(() => false, null, { polling: 50, timeout: 50 });
  };

  await expect(openRenderedHome(page,
    { path: latePath, bootTimeoutMs: 100, readyTimeoutMs: 1_000 }))
    .rejects.toThrow('page.waitForFunction: Timeout 50ms exceeded');
});

test('a home rendered after its UI budget cannot recover a stalled waiter', async ({ page, baseURL }) => {
  const latePath = '/__qa_firefox_late_home_waiter';
  await page.route(`${baseURL}${latePath}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><script>'
      + 'performance.mark("sogrim:start:app-module-ready");'
      + 'setTimeout(() => {'
      + 'const main = document.createElement("main");'
      + 'main.className = "screen"; main.dataset.screenKind = "home"; main.textContent = "late";'
      + 'document.body.append(main);'
      + 'performance.mark("sogrim:start:first-screen-rendered")'
      + '}, 300);'
      + '</script></body></html>'
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = async () => {
    await new Promise(resolve => setTimeout(resolve, 450));
    return waitForFunction(() => false, null, { polling: 50, timeout: 50 });
  };

  await expect(openRenderedHome(page,
    { path: latePath, bootTimeoutMs: 1_000, readyTimeoutMs: 100 }))
    .rejects.toThrow('page.waitForFunction: Timeout 50ms exceeded');
  await expect(page.locator('.screen[data-screen-kind="home"]')).toContainText('late');
});

test('a hidden home cannot recover a stalled waiter despite early marks', async ({ page, baseURL }) => {
  const hiddenPath = '/__qa_firefox_hidden_home_waiter';
  await page.route(`${baseURL}${hiddenPath}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body>'
      + '<main class="screen" data-screen-kind="home" style="display:none">hidden</main>'
      + '<script>performance.mark("sogrim:start:app-module-ready");'
      + 'performance.mark("sogrim:start:first-screen-rendered")</script></body></html>'
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = async (...args) => {
    const booted = await waitForFunction(...args);
    await booted.dispose();
    return waitForFunction(() => false, null, { polling: 50, timeout: 50 });
  };

  await expect(openRenderedHome(page,
    { path: hiddenPath, bootTimeoutMs: 1_000, readyTimeoutMs: 1_000 }))
    .rejects.toThrow(/Received:\s*hidden/);
  expect(await page.locator('.screen[data-screen-kind="home"]').isVisible()).toBe(false);
});

test('a home unhidden after its UI deadline cannot use an earlier screen mark', async ({ page, baseURL }) => {
  const latePath = '/__qa_firefox_unhidden_late';
  await page.route(`${baseURL}${latePath}`, route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body>'
      + '<main class="screen" data-screen-kind="home" style="display:none">late</main>'
      + '<script>performance.mark("sogrim:start:app-module-ready");'
      + 'performance.mark("sogrim:start:first-screen-rendered");'
      + 'setTimeout(() => { document.querySelector("main").style.display = "block" }, 250)'
      + '</script></body></html>'
  }));
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = () => waitForFunction(() => false, null, { polling: 50, timeout: 400 });

  await expect(openRenderedHome(page,
    { path: latePath, bootTimeoutMs: 500, readyTimeoutMs: 100 }))
    .rejects.toThrow('page.waitForFunction: Timeout 400ms exceeded');
  expect(await page.locator('.screen[data-screen-kind="home"]').isVisible()).toBe(true);
  const timing = await page.evaluate(() => ({
    homeVisibleAt: window.__qaHomeVisibleAt,
    firstScreenAt: performance.timeOrigin
      + performance.getEntriesByName('sogrim:start:first-screen-rendered')[0].startTime
  }));
  expect(timing.homeVisibleAt).toBeGreaterThan(timing.firstScreenAt + 100);
});

test('a stale same-URL home cannot recover a stalled waiter', async ({ page, baseURL }) => {
  let visits = 0;
  let releaseReload;
  const reloadGate = new Promise(resolve => { releaseReload = resolve; });
  await page.route(`${baseURL}${path}`, async route => {
    visits += 1;
    if (visits === 2) await reloadGate;
    await route.fulfill({ status: 200, contentType: 'text/html', body: home });
  });
  await openRenderedHome(page, { path, bootTimeoutMs: 1_000, readyTimeoutMs: 1_000 });
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = () => waitForFunction(() => false, null, { polling: 50, timeout: 150 });
  try {
    await expect(openRenderedHome(page,
      { path, bootTimeoutMs: 200, readyTimeoutMs: 1_000 }))
      .rejects.toThrow('page.waitForFunction: Timeout 150ms exceeded');
    expect(visits).toBe(2);
  } finally {
    releaseReload();
  }
});

test('a late HTTP error cannot be accepted as a rendered home', async ({ page, baseURL }) => {
  const failedPath = '/__qa_firefox_http_error';
  await page.route(`${baseURL}${failedPath}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.fulfill({ status: 400, contentType: 'text/html', body: home });
  });
  await expect(openRenderedHome(page,
    { path: failedPath, bootTimeoutMs: 1_000, readyTimeoutMs: 1_000 }))
    .rejects.toThrow('Home navigation returned HTTP 400');
});

test('a rejected navigation cannot pass using an old home', async ({ page, baseURL }) => {
  await page.route(`${baseURL}${path}`, route => route.fulfill({
    status: 200, contentType: 'text/html', body: home
  }));
  await openRenderedHome(page, { path, readyTimeoutMs: 1_000 });
  const failedPath = '/__qa_firefox_navigation_rejected';
  await page.route(`${baseURL}${failedPath}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.abort('failed');
  });
  await expect(openRenderedHome(page, { path: failedPath, readyTimeoutMs: 1_000 }))
    .rejects.toThrow('Home navigation failed');
});
