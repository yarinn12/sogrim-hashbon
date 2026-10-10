import { expect } from '@playwright/test';

export async function openTypographyHome(page, { readyTimeoutMs = 8_000 } = {}) {
  // Geometry needs a rendered home screen and the local Hebrew font. Firefox
  // can keep the document load event pending after both are ready.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible({ timeout: readyTimeoutMs });
  const rubikLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(face =>
      face.family.replace(/["']/g, '') === 'Rubik' && face.status === 'loaded');
  });
  expect(rubikLoaded, 'the Hebrew Rubik face is ready before geometry measurement').toBe(true);
}
