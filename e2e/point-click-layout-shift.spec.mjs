import { test, expect } from '@playwright/test';
import { pointClick } from './helpers/eventNotesBatchPresentation.mjs';

test('point click reaches a scrollable action after the bottom navigation grows', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 390 });
  await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html,body{margin:0;height:100%;overflow:hidden}
      .route{height:390px;overflow-y:auto}
      .spacer{height:500px}
      .target{display:block;width:120px;height:48px;margin:auto}
      .product-app-nav{position:fixed;bottom:0;left:0;right:0;height:80px;background:white;z-index:10}
    </style>
    <div class="route"><div class="spacer"></div><button class="target">פתיחת בדיקה</button><div class="spacer"></div></div>
    <nav class="product-app-nav"></nav>`);
  await page.evaluate(() => {
    window.__targets = { button: 0, navigation: 0 };
    const button = document.querySelector('.target');
    const scroll = button.scrollIntoView.bind(button);
    button.scrollIntoView = options => {
      scroll(options);
      document.querySelector('.product-app-nav').style.height = '250px';
    };
    button.addEventListener('click', () => {
      window.__targets.button++;
      document.body.insertAdjacentHTML('beforeend', '<div class="opened">נפתח</div>');
    });
    document.querySelector('.product-app-nav').addEventListener('click', () => window.__targets.navigation++);
  });
  await pointClick(page.locator('.target'));
  await expect(page.locator('.opened')).toBeVisible();
  expect(await page.evaluate(() => window.__targets)).toEqual({ button: 1, navigation: 0 });
});
