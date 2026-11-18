import {openRenderedHome} from './typographyReadiness.mjs';

// Reuse the established fresh-document, real-module and rendered-home checks.
// A pending navigation API promise must not block an already usable document.
export async function localQaNavigationReady(page, url = "/", selector = '.screen[data-screen-kind="home"]',
  {openHome = openRenderedHome} = {}) {
  await openHome(page, {path: url, readyTimeoutMs: 8_000});
  await page.locator(selector).waitFor({ state: "visible" });
}
