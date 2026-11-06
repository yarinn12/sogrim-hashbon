import {test,expect} from '@playwright/test';
import {waitForStaticVisualGeometry} from './helpers/staticVisualGeometry.mjs';

test('final geometry waits for finite route transforms without rounding target dimensions',async({page})=>{
  await page.setContent('<section id="route"><button style="box-sizing:border-box;width:100px;height:44px">פעולה</button></section>');
  const route=page.locator('#route'),button=route.locator('button');
  await route.evaluate(element=>{
    const animation=element.animate([{transform:'scale(.99)'},{transform:'scale(1)'}],{duration:400,fill:'none'});
    animation.pause();animation.currentTime=0;
    window.__geometryControlAnimation=animation;
  });
  const before=await button.boundingBox();
  expect(before.height).toBeLessThan(44);
  await route.evaluate(()=>window.__geometryControlAnimation.play());
  await waitForStaticVisualGeometry(route);
  const after=await button.boundingBox();
  expect(after.height).toBeGreaterThanOrEqual(44);
  expect(after.width).toBe(100);
});

test('static geometry preserves an undersized target instead of rounding or resizing it',async({page})=>{
  await page.setContent('<section id="route"><button style="box-sizing:border-box;width:100px;height:43.5px">פעולה</button></section>');
  const route=page.locator('#route');
  await waitForStaticVisualGeometry(route);
  const after=await route.locator('button').boundingBox();
  expect(after.height).toBe(43.5);
  expect(after.height).toBeLessThan(44);
  expect(await route.locator('button').getAttribute('style')).toBe('box-sizing:border-box;width:100px;height:43.5px');
});
