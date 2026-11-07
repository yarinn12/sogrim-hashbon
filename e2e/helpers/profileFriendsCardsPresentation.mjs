import {expect} from '@playwright/test';
import {alignPaintedTarget,paintedTargetIsReachable} from './paintedTarget.mjs';
export async function presentationReach(page,locator){
 let measured;
 await expect.poll(async()=>{measured=await locator.evaluate(alignPaintedTarget);return paintedTargetIsReachable(measured,43.99)}).toBe(true);
 expect(measured.rect.width).toBeGreaterThanOrEqual(43.99);expect(measured.rect.height).toBeGreaterThanOrEqual(43.99);expect(measured.rect.x).toBeGreaterThanOrEqual(-1);expect(measured.targetTop).toBeGreaterThanOrEqual(-1);expect(measured.targetBottom).toBeLessThanOrEqual(measured.bottom+1);expect(measured.hit).toBe(true);
 return measured;
}
export async function presentationClick(page,locator){await expect(locator).toBeEnabled();const m=await presentationReach(page,locator);await page.mouse.click(m.x,m.y)}
