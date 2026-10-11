import { expect, test } from '@playwright/test';

const trackedPages = new WeakSet();

async function startupReadinessStatus(page) {
  try {
    return await page.evaluate(() => ({
      documentReadyState: document.readyState,
      domContentLoaded: Boolean(window.__qaHomeDomContentLoaded),
      accountAuthPending: document.documentElement.classList.contains('account-auth-pending'),
      homeCount: document.querySelectorAll('.screen[data-screen-kind="home"]').length,
      marks: Object.fromEntries(performance.getEntriesByType('mark')
        .filter(entry => entry.name.startsWith('sogrim:start:'))
        .map(entry => [entry.name.slice('sogrim:start:'.length), Math.round(entry.startTime)]))
    }));
  } catch (error) {
    return { diagnosticError: String(error?.message ?? error) };
  }
}

export async function openRenderedHome(page, { path = '/', readyTimeoutMs = 8_000, bootTimeoutMs = 0 } = {}) {
  if (!trackedPages.has(page)) {
    await page.addInitScript(() => {
      // Identifies this document even when Firefox never settles page.goto's
      // "commit" promise after the response and app have already rendered.
      window.__qaHomeDocumentId = `${performance.timeOrigin}:${Math.random()}`;
      window.__qaHomeDomContentLoaded = false;
      document.addEventListener('DOMContentLoaded', () => {
        window.__qaHomeDomContentLoaded = true;
      }, { once: true });
    });
    trackedPages.add(page);
  }
  // Navigation owns module loading. A held unrelated deferred resource must
  // not block a rendered app, but the home UI budget starts only when the app
  // module executes (or DOMContentLoaded proves a broken module has finished).
  try {
    const previousDocumentId = await page.evaluate(() => window.__qaHomeDocumentId);
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error('A Playwright baseURL is required for home readiness');
    const targetURL = new URL(path, baseURL).href;
    let rejectNavigation;
    const navigationFailure = new Promise((_, reject) => { rejectNavigation = reject; });
    const onRequestFailed = request => {
      if (request.isNavigationRequest() && request.url() === targetURL) {
        rejectNavigation(new Error(`Home navigation failed: ${request.failure()?.errorText ?? targetURL}`));
      }
    };
    const onResponse = response => {
      if (response.request().isNavigationRequest()
        && response.url() === targetURL && response.status() >= 400) {
        rejectNavigation(new Error(`Home navigation returned HTTP ${response.status()}: ${targetURL}`));
      }
    };
    page.on('requestfailed', onRequestFailed);
    page.on('response', onResponse);
    // Firefox can render the full app while page.goto({ waitUntil: 'commit' })
    // remains pending. Playwright locators then wait for that navigation forever.
    // Start the browser navigation without leaving a pending navigation API call.
    try {
      await page.evaluate(url => { setTimeout(() => location.assign(url), 0); }, targetURL);
      const bootSignal = await Promise.race([
        page.waitForFunction(({ previousDocumentId, targetURL }) => {
          if (!window.__qaHomeDocumentId
            || window.__qaHomeDocumentId === previousDocumentId
            || location.origin === 'null') return false;
          return location.href === targetURL
            && (performance.getEntriesByName('sogrim:start:app-module-ready').length > 0
              || window.__qaHomeDomContentLoaded === true);
        }, { previousDocumentId, targetURL }, { polling: 100, timeout: bootTimeoutMs }),
        navigationFailure
      ]);
      await bootSignal.dispose();
    } finally {
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    }
    await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible({ timeout: readyTimeoutMs });
  } catch (error) {
    error.message += `\nStartup readiness: ${JSON.stringify(await startupReadinessStatus(page))}`;
    throw error;
  }
}

export async function openTypographyHome(page, { path = '/', readyTimeoutMs = 8_000 } = {}) {
  // Geometry additionally needs the local Hebrew face at its measured size.
  await openRenderedHome(page, { path, readyTimeoutMs });
  const rubikLoaded = await page.evaluate(async () => {
    // Request only the Hebrew face used for geometry. On some engines,
    // document.fonts.ready also waits for an unrelated image to finish layout.
    await document.fonts.load('17px Rubik', 'סוגרים חשבון');
    return document.fonts.check('17px Rubik', 'סוגרים חשבון')
      && [...document.fonts].some(face =>
        face.family.replace(/["']/g, '') === 'Rubik' && face.status === 'loaded');
  });
  expect(rubikLoaded, 'the Hebrew Rubik face is ready before geometry measurement').toBe(true);
}
