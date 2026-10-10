import { expect } from '@playwright/test';

export async function openTypographyHome(page, { path = '/', readyTimeoutMs = 8_000 } = {}) {
  // Geometry needs a rendered home screen and the local Hebrew font. The
  // document load event can remain pending after both are ready.
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.screen[data-screen-kind="home"]')).toBeVisible({ timeout: readyTimeoutMs });
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
