import {expect} from '@playwright/test';
import {alignPaintedTarget,paintedTargetIsReachable} from './paintedTarget.mjs';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
export const homeArchiveState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const homeArchiveRecords=state=>state.events.map(e=>({id:e.id,currency:e.currency,expenses:e.expenses,transfers:e.transfers,participantIds:e.participantIds}));
export async function homeArchiveReach(page,locator){
 let sample;
 await expect.poll(async()=>{sample=await locator.evaluate(alignPaintedTarget);return paintedTargetIsReachable(sample,43.995)}).toBe(true);
 const r=sample.rect;expect(r.x).toBeGreaterThanOrEqual(-1);expect(Math.round(r.width*100)/100).toBeGreaterThanOrEqual(44);expect(Math.round(r.height*100)/100).toBeGreaterThanOrEqual(44);
 if(sample.glyph){
  const center=sample.y;
  expect(center-Math.max(0,r.y)).toBeGreaterThanOrEqual(22);expect(Math.min(sample.bottom,r.y+r.height)-center).toBeGreaterThanOrEqual(22);
 }else{expect(r.y).toBeGreaterThanOrEqual(-1);expect(r.y+r.height).toBeLessThanOrEqual(sample.bottom+1)}
 return sample;
}
export async function homeArchiveClick(page,locator){
 await expect(locator).toBeEnabled();const point=await homeArchiveReach(page,locator);
 // Locator.click performs another automatic scroll in Chromium, which can
 // put a short landscape target back under the floating accessibility button.
 // Use real pointer input at the already hit-tested visible center instead.
 await page.mouse.click(point.x,point.y);
}
export async function openHomeArchive(page,view='menu',{width=393,height=852,root=16,system=false,long=false,member=false}={}){
 await page.setViewportSize({width,height});if(system)await page.addInitScript(installSyntheticSystemText);
 await page.goto('/?review=1&requests=empty&preview='+view+(root>16&&!system?'&dynamic-type-preview='+root:'')+(long?'&long-event-name=1':'')+(member?'&menu-member=1':''));
 const home=page.locator('[data-screen-kind="home"]');await expect(home).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 if(view==='home-empty'){await expect(home.locator('.home-empty-events')).toBeVisible();return home}
 await expect(home.locator('.event-row')).toHaveCount(view==='archive-menu'?2:3);
 if(view.startsWith('archive-'))await homeArchiveClick(page,home.locator('[data-action="event-status-filter"][data-filter="archive"]').first());
 if(view==='archive-empty'){const empty=home.locator('.event-list .empty-state:visible');await expect(empty).toHaveCount(1);await expect(empty).toBeVisible();return home}
 await homeArchiveClick(page,home.locator('[data-action="event-status-select"][data-event-id="friend-weekend"]'));
 const menu=page.locator('.event-status-menu');await expect(menu).toBeVisible();await expect(menu.locator('h2')).toContainText(long?'סוף השבוע הארוך':'סוף השבוע');return menu;
}
