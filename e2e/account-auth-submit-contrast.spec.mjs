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

function contrastRatio(foreground, background) {
  const luminance = value => {
    const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function assertReadable(button, testInfo, phase) {
  await button.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const appearance = await button.evaluate(element => {
    const css = getComputedStyle(element);
    return { color: css.color, backgroundColor: css.backgroundColor, backgroundImage: css.backgroundImage,
      opacity: css.opacity, fontSize: css.fontSize, fontWeight: css.fontWeight,
      enabled: !element.matches(':disabled'), hover: element.matches(':hover'), focus: element.matches(':focus') };
  });
  const ratio = contrastRatio(appearance.color, appearance.backgroundColor);
  const fontSize = Number.parseFloat(appearance.fontSize);
  const isLargeText = fontSize >= 24 || (fontSize >= 18.5 && Number(appearance.fontWeight) >= 700);
  const minimum = isLargeText ? 3 : 4.5;
  await testInfo.attach(`${phase}-contrast`, { body: JSON.stringify({ ...appearance, ratio, minimum }, null, 2), contentType: 'application/json' });
  expect(appearance.enabled).toBe(true);
  expect(appearance.backgroundImage).toBe('none');
  expect(Number(appearance.opacity)).toBe(1);
  expect(ratio, `${phase}: enabled submit text must remain readable`).toBeGreaterThanOrEqual(minimum);
}

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`enabled auth submit remains readable after scroll and keyboard return (${size.width}x${size.height})`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const dynamicType = Number(testInfo.project.metadata?.dynamicTypePreview || 0);
    await page.goto(dynamicType ? `/?dynamic-type-preview=${dynamicType}` : '/');
    const gate = page.locator('#public-account-auth-gate');
    await expect(gate).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/ledger-workspace-v1/);
    if (dynamicType) await expect(page.locator('html')).toHaveClass(/dynamic-type/);
    await gate.evaluate(element => element.scrollTo(0, 120));
    await gate.evaluate(element => element.scrollTo(0, element.scrollHeight));
    const email = gate.locator('input[name="email"]');
    if (testInfo.project.use.hasTouch) await email.tap();
    else await email.click();
    await page.evaluate(height => window.__setAuthLegalKeyboardViewport(height), Math.round(size.height / 2));
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.__setAuthLegalKeyboardViewport(innerHeight);
    });
    await gate.evaluate(element => element.scrollTo(0, element.scrollHeight));
    await email.fill('contrast-check@example.test');
    await gate.locator('input[name="password"]').fill('SyntheticPassword123');
    const button = gate.locator('.account-auth-submit');
    await expect(button).toBeEnabled();
    await gate.evaluate(element => element.scrollTo(0, element.scrollHeight));
    await assertReadable(button, testInfo, 'keyboard-return');
    await button.hover();
    await expect(button).toHaveJSProperty('disabled', false);
    await assertReadable(button, testInfo, 'hover');
    await button.focus();
    await assertReadable(button, testInfo, 'focus');
    // Do not submit synthetic credentials or change the account state.
    await page.screenshot({ path: testInfo.outputPath('auth-submit-readable.png') });
  });
}
