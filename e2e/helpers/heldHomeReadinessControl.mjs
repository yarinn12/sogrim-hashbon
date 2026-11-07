import { expect } from '@playwright/test';
import { holdNonessentialHomeImage } from './heldHomeImage.mjs';
import { openRenderedHome } from './typographyReadiness.mjs';

const checkedPages = new WeakSet();
const heldGates = new WeakMap();

export async function openHeldRenderedHome(page, options) {
  const gate = heldGates.get(page);
  try {
    await openRenderedHome(page, { bootTimeoutMs: 30_000, ...options });
    // A later same-page navigation may be fulfilled by the app service worker.
    // The first fresh document is the controlled load boundary for this page.
    if (gate && !checkedPages.has(page)) {
      expect(await page.evaluate(() => document.readyState),
        'the visible home must precede nonessential load or DCL').toBe('interactive');
      checkedPages.add(page);
    }
  } finally {
    // Let the rest of the journey use its original font and screenshot waits.
    gate?.release();
  }
}

async function holdNonessentialDeferredScript(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const scriptPath = `/__qa_held_home_defer_${Math.random().toString(36).slice(2)}.js`;
  let releaseScript;
  let requested = false;
  const gate = new Promise(resolve => { releaseScript = resolve; });

  await page.route(`${origin}${scriptPath}`, async route => {
    requested = true;
    await gate;
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await page.route(url => url.origin === origin && url.pathname === '/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace('</body>',
      `<script defer src="${scriptPath}"></script></body>`) });
  });
  return {
    get requested() { return requested; },
    release() { releaseScript(); }
  };
}

// Keep a nonessential resource pending through the real journey. Replacing a
// callsite with page.goto(load/DCL) then fails while the rendered app is ready.
export function requireHeldHomeReadiness(test, { resource = 'defer', skipTitles = [] } = {}) {
  test.beforeEach(async ({ page, baseURL }, testInfo) => {
    if (skipTitles.includes(testInfo.title)) return;
    const gate = resource === 'defer'
      ? await holdNonessentialDeferredScript(page, baseURL)
      : await holdNonessentialHomeImage(page, baseURL);
    heldGates.set(page, gate);
  });
  test.afterEach(async ({ page }, testInfo) => {
    const gate = heldGates.get(page);
    if (!gate) return;
    try {
      if (testInfo.status === 'passed') {
        expect(gate.requested, 'the held resource must have been requested').toBe(true);
      } else {
        const browserState = await page.evaluate(() => ({
          readyState: document.readyState,
          homeVisible: Boolean(document.querySelector('.screen[data-screen-kind="home"]'))
        })).catch(error => ({ diagnosticError: String(error) }));
        console.log(JSON.stringify({ kind: 'held-home-control', requested: gate.requested,
          url: page.url(), ...browserState }));
      }
    } finally {
      gate.release();
    }
  });
}
