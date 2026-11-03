import {expect} from '@playwright/test';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
export const homeArchiveState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const homeArchiveRecords=state=>state.events.map(e=>({id:e.id,currency:e.currency,expenses:e.expenses,transfers:e.transfers,participantIds:e.participantIds}));
export async function homeArchiveReach(page,locator){
 // Firefox commits scrollIntoView before the next paint. Read fresh geometry
 // afterwards; measuring in the same task can undo a valid scroll.
 await locator.evaluate(e=>{e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 await locator.evaluate(e=>{if(!e.closest('.event-status-menu')){const nav=document.querySelector('[aria-label="ניווט ראשי"]'),r=e.getBoundingClientRect();if(nav&&r.bottom>nav.getBoundingClientRect().top-8)document.scrollingElement.scrollTop+=r.bottom-nav.getBoundingClientRect().top+8}return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 await expect.poll(()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit)})).toBe(true);
 const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(-1);expect(Math.round(r.width*100)/100).toBeGreaterThanOrEqual(44);expect(Math.round(r.height*100)/100).toBeGreaterThanOrEqual(44);
 const bottom=await locator.evaluate(e=>{const d=e.closest('.event-status-menu');return d?Math.min(innerHeight,d.getBoundingClientRect().bottom):document.querySelector('[aria-label="ניווט ראשי"]').getBoundingClientRect().top});
 if(await locator.getAttribute('data-action')==='event-status-select'){
  // Existing row hit areas stretch with long event cards. Measure the visible
  // 44px target around their glyph, rather than requiring a page-high row to
  // fit wholly on screen. Newly implemented menu/empty controls stay stricter.
  const glyph=await locator.locator('.event-row-options-chevron').boundingBox(),center=glyph.y+glyph.height/2;
  expect(center-Math.max(0,r.y)).toBeGreaterThanOrEqual(22);expect(Math.min(bottom,r.y+r.height)-center).toBeGreaterThanOrEqual(22);
 }else{expect(r.y).toBeGreaterThanOrEqual(-1);expect(r.y+r.height).toBeLessThanOrEqual(bottom+1)}
}
export async function homeArchiveClick(page,locator){await homeArchiveReach(page,locator);await locator.click()}
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
