import { errors, expect, test } from '@playwright/test';

const trackedPages = new WeakSet();

async function startupReadinessStatus(page, { previousDocumentId, targetURL } = {}) {
  try {
    return await page.evaluate(({ previousDocumentId, targetURL }) => ({
      documentReadyState: document.readyState,
      domContentLoaded: Boolean(window.__qaHomeDomContentLoaded),
      documentIdPresent: Boolean(window.__qaHomeDocumentId),
      documentIdChanged: Boolean(window.__qaHomeDocumentId
        && window.__qaHomeDocumentId !== previousDocumentId),
      urlMatchesTarget: location.href === targetURL,
      homeVisibleAt: window.__qaHomeVisibleAt,
      accountAuthPending: document.documentElement.classList.contains('account-auth-pending'),
      homeCount: document.querySelectorAll('.screen[data-screen-kind="home"]').length,
      marks: Object.fromEntries(performance.getEntriesByType('mark')
        .filter(entry => entry.name.startsWith('sogrim:start:'))
        .map(entry => [entry.name.slice('sogrim:start:'.length), Math.round(entry.startTime)]))
    }), { previousDocumentId, targetURL });
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
      window.__qaHomeDomContentLoadedAt = null;
      window.__qaHomeVisibleAt = null;
      const recordVisibleHome = () => {
        if (window.__qaHomeVisibleAt !== null) return;
        const home = document.querySelector('.screen[data-screen-kind="home"]');
        if (!home) return;
        const rect = home.getBoundingClientRect();
        const style = getComputedStyle(home);
        if (rect.width > 0 && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.visibility !== 'collapse') {
          window.__qaHomeVisibleAt = performance.timeOrigin + performance.now();
        }
      };
      const homeObserver = new MutationObserver(recordVisibleHome);
      homeObserver.observe(document, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      const homeCheck = setInterval(() => {
        recordVisibleHome();
        if (window.__qaHomeVisibleAt !== null) {
          homeObserver.disconnect();
          clearInterval(homeCheck);
        }
      }, 50);
      document.addEventListener('DOMContentLoaded', () => {
        window.__qaHomeDomContentLoaded = true;
        window.__qaHomeDomContentLoadedAt = performance.timeOrigin + performance.now();
        recordVisibleHome();
      }, { once: true });
    });
    trackedPages.add(page);
  }
  // Navigation owns module loading. A held unrelated deferred resource must
  // not block a rendered app, but the home UI budget starts only when the app
  // module executes (or DOMContentLoaded proves a broken module has finished).
  let previousDocumentId;
  let targetURL;
  try {
    previousDocumentId = await page.evaluate(() => window.__qaHomeDocumentId);
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error('A Playwright baseURL is required for home readiness');
    targetURL = new URL(path, baseURL).href;
    let navigationError;
    let rejectNavigation;
    const navigationFailure = new Promise((_, reject) => {
      rejectNavigation = error => {
        navigationError = error;
        reject(error);
      };
    });
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
    let verifiedHomeAtTimeout = false;
    try {
      await page.evaluate(url => { setTimeout(() => location.assign(url), 0); }, targetURL);
      // The browser and Playwright worker run on the same host, so browser
      // performance.timeOrigin and this wall clock share the deadline clock.
      const bootDeadline = bootTimeoutMs > 0 ? Date.now() + bootTimeoutMs : null;
      try {
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
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)
          || !error.message.startsWith('page.waitForFunction: Timeout')
          || bootDeadline === null) throw error;
        // Firefox can time out its browser-side waiter after the new app is
        // already rendered. Recover only when independent browser state proves
        // the boot signal and rendered home occurred within the original
        // deadlines. Never start a fresh UI budget after the timeout.
        const readRecoveryStatus = ({ previousDocumentId, targetURL }) => {
          const moduleReady = performance.getEntriesByName('sogrim:start:app-module-ready')[0];
          const freshDocument = Boolean(window.__qaHomeDocumentId
            && window.__qaHomeDocumentId !== previousDocumentId);
          const urlMatches = location.origin !== 'null' && location.href === targetURL;
          const bootSignals = [
            moduleReady && performance.timeOrigin + moduleReady.startTime,
            window.__qaHomeDomContentLoadedAt
          ].filter(Number.isFinite);
          const bootSignalAt = bootSignals.length ? Math.min(...bootSignals) : null;
          return { freshDocument, urlMatches, bootSignalAt,
            homeVisibleAt: window.__qaHomeVisibleAt };
        };
        const initial = await page.evaluate(readRecoveryStatus,
          { previousDocumentId, targetURL });
        if (!initial.freshDocument || !initial.urlMatches
          || initial.bootSignalAt === null || initial.bootSignalAt > bootDeadline
          || navigationError) throw navigationError ?? error;
        const uiDeadline = initial.bootSignalAt + readyTimeoutMs;
        const home = page.locator('.screen[data-screen-kind="home"]');
        const remainingUiMs = uiDeadline - Date.now();
        if (remainingUiMs > 0) {
          await Promise.race([
            expect(home).toBeVisible({ timeout: remainingUiMs }),
            navigationFailure
          ]);
        }
        const verification = await page.evaluate(readRecoveryStatus,
          { previousDocumentId, targetURL });
        const homeVisible = await home.isVisible();
        const readyInTime = verification.freshDocument && verification.urlMatches
          && verification.bootSignalAt !== null
          && verification.homeVisibleAt !== null
          && verification.bootSignalAt <= bootDeadline
          && verification.homeVisibleAt <= uiDeadline;
        if (!readyInTime || navigationError || !homeVisible) {
          throw navigationError ?? error;
        }
        await test.info().attach('home-readiness-waiter-timeout-recovered', {
          body: JSON.stringify({ ...verification, homeVisible, bootDeadline, uiDeadline,
            bootTimeoutMs, readyTimeoutMs }),
          contentType: 'application/json'
        });
        console.warn('QA home readiness: browser-side waiter timed out after timely rendered-home verification');
        verifiedHomeAtTimeout = true;
      }
    } finally {
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    }
    if (!verifiedHomeAtTimeout) {
      await expect(page.locator('.screen[data-screen-kind="home"]'))
        .toBeVisible({ timeout: readyTimeoutMs });
    }
  } catch (error) {
    error.message += `\nStartup readiness: ${JSON.stringify(await startupReadinessStatus(page,
      { previousDocumentId, targetURL }))}`;
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
