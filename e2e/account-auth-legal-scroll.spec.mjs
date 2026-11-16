import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const AUTH_ORIGIN = 'https://auth-legal-scroll.supabase.co';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/api/config', route => route.fulfill({ json: {
    publicUrl: baseURL,
    storage: { mode: 'supabase', url: AUTH_ORIGIN, anonKey: 'synthetic-anon-key', table: 'app_snapshots' },
    launch: { googleAuthReady: false, authEmailDeliveryReady: true }
  } }));
  await page.route(`${AUTH_ORIGIN}/**`, route => route.fulfill({ status: 200, json: [] }));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('settle-friends-skip-next-splash', '1');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const viewport = new EventTarget();
    // Model visual-viewport-only keyboard changes; desktop WebKit has no iOS keyboard.
    let keyboardHeight = null;
    Object.assign(viewport, { offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(viewport, 'width', { get: () => innerWidth });
    Object.defineProperty(viewport, 'height', { get: () => keyboardHeight ?? innerHeight });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__setAuthLegalKeyboardViewport = height => {
      keyboardHeight = height;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
});

async function inspect(page, testInfo, phase) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => {
    const gate = document.querySelector('#public-account-auth-gate');
    const shell = gate.querySelector('.account-auth-shell');
    const links = [...gate.querySelectorAll('.account-auth-legal a')].map(link => {
      const rect = link.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { href: link.getAttribute('href'), text: link.textContent, top: rect.top, bottom: rect.bottom,
        left: rect.left, right: rect.right, height: rect.height, hit: Boolean(hit && (hit === link || link.contains(hit))) };
    });
    return { windowY: scrollY, viewportHeight: innerHeight, visualHeight: visualViewport.height,
      viewportWidth: innerWidth, classes: document.documentElement.className,
      gate: { top: gate.scrollTop, height: gate.clientHeight, contentHeight: gate.scrollHeight,
        background: getComputedStyle(gate).background, overflow: getComputedStyle(gate).overflow },
      shell: { height: shell.getBoundingClientRect().height, overflow: getComputedStyle(shell).overflow }, links };
  });
  await testInfo.attach(`${phase}-geometry`, { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`${phase}.png`) });
  console.log(JSON.stringify({ kind: 'account-auth-legal-scroll', phase, profile: testInfo.project.name, geometry }));
  return geometry;
}

async function activate(locator, testInfo) {
  if (testInfo.project.use.hasTouch) await locator.tap();
  else await locator.click();
}

async function maximumScroll(page) {
  await page.locator('#public-account-auth-gate').evaluate(gate => gate.scrollTo(0, gate.scrollHeight));
}

function assertLegalReachable(geometry) {
  expect(geometry.links).toHaveLength(2);
  for (const link of geometry.links) {
    expect(link.top).toBeGreaterThanOrEqual(0);
    // Keep an iPhone home-indicator band clear even when desktop env() insets are zero.
    expect(link.bottom).toBeLessThanOrEqual(Math.min(geometry.viewportHeight, geometry.visualHeight) - 34);
    expect(link.left).toBeGreaterThanOrEqual(0);
    expect(link.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(link.hit, `${link.text} must receive the tap`).toBe(true);
  }
}

for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`auth legal links remain reachable after scroll and simulated keyboard return (${size.width}x${size.height})`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
    await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : '/');
    const gate = page.locator('#public-account-auth-gate');
    await expect(gate).toBeVisible();
    await expect(gate.locator('.account-auth-legal a')).toHaveCount(2);
    await expect(page.locator('html')).toHaveClass(/ledger-workspace-v1/);
    if (dynamicType) await expect(page.locator('html')).toHaveClass(/dynamic-type/);
    await inspect(page, testInfo, 'initial');
    await gate.evaluate(element => element.scrollTo(0, 120));
    await inspect(page, testInfo, 'short-scroll');
    await maximumScroll(page);
    assertLegalReachable(await inspect(page, testInfo, 'maximum-scroll'));
    await activate(gate.locator('input[name="email"]'), testInfo);
    await page.evaluate(height => window.__setAuthLegalKeyboardViewport(height), Math.round(size.height / 2));
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.__setAuthLegalKeyboardViewport(innerHeight);
    });
    await maximumScroll(page);
    assertLegalReachable(await inspect(page, testInfo, 'keyboard-return'));
    for (const href of ['./terms.html', './privacy.html']) {
      await maximumScroll(page);
      await activate(gate.locator(`.account-auth-legal a[href="${href}"]`), testInfo);
      await expect(page).toHaveURL(new RegExp(href.slice(1).replace('.', '\\.') + '$'));
      await page.goBack();
      await expect(gate).toBeVisible();
    }
  });
}
