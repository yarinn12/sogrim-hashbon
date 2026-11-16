// A fresh, visible destination is the boundary this journey needs. An
// unrelated image must not keep an already rendered event behind goto(load).
export function renderedNavigationDestinationReady({ previousDocumentId, targetURL, screenKind }) {
  if (!window.__qaNavigationDocumentId
    || window.__qaNavigationDocumentId === previousDocumentId
    || location.href !== targetURL) return false;
  const screen = document.querySelector(`.screen[data-screen-kind="${screenKind}"]`);
  if (!screen) return false;
  const rect = screen.getBoundingClientRect();
  const style = getComputedStyle(screen);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none'
    && style.visibility !== 'hidden' && style.visibility !== 'collapse';
}

export async function openRenderedNavigationDestination(page, {
  baseURL, path, screenKind, timeoutMs = 30_000
}) {
  if (!['home', 'event'].includes(screenKind)) throw new Error('Unsupported navigation destination');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error('Navigation readiness needs a bounded positive timeout of at most 30000ms');
  }
  const targetURL = new URL(path, baseURL).href;
  await page.addInitScript(() => {
    window.__qaNavigationDocumentId = `${performance.timeOrigin}:${Math.random()}`;
  });
  const previousDocumentId = await page.evaluate(() => window.__qaNavigationDocumentId);
  let navigationError;
  let rejectNavigation;
  const navigationFailure = new Promise((_, reject) => { rejectNavigation = reject; });
  // Keep an early response rejection observed while evaluate is still pending;
  // the same promise is raced below and its error can never grant readiness.
  navigationFailure.catch(() => {});
  const fail = error => { navigationError = error; rejectNavigation(error); };
  const onResponse = response => {
    if (response.request().isNavigationRequest() && response.url() === targetURL
      && response.status() >= 400) fail(new Error(`Navigation returned HTTP ${response.status()}`));
  };
  const onRequestFailed = request => {
    if (request.isNavigationRequest() && request.url() === targetURL) {
      fail(new Error(`Navigation failed: ${request.failure()?.errorText ?? targetURL}`));
    }
  };
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  try {
    await Promise.race([
      page.evaluate(url => { setTimeout(() => location.assign(url), 0); }, targetURL),
      navigationFailure
    ]);
    const ready = await Promise.race([
      page.waitForFunction(renderedNavigationDestinationReady,
        { previousDocumentId, targetURL, screenKind }, { timeout: timeoutMs, polling: 100 }),
      navigationFailure
    ]);
    await ready.dispose();
    if (navigationError) throw navigationError;
  } finally {
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }
}
