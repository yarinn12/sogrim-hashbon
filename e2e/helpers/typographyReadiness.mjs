import { expect } from '@playwright/test';

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

export async function openRenderedHome(page, { path = '/', readyTimeoutMs = 8_000 } = {}) {
  if (!trackedPages.has(page)) {
    await page.addInitScript(() => {
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
  await page.goto(path, { waitUntil: 'commit' });
  try {
    const bootSignal = await page.waitForFunction(() =>
      performance.getEntriesByName('sogrim:start:app-module-ready').length > 0 ||
      window.__qaHomeDomContentLoaded === true,
    null, { polling: 100, timeout: 0 });
    await bootSignal.dispose();
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
