import {expect} from '@playwright/test';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';

export async function openRestaurantBill(page,view='method',{width=393,height=852,root=16,system=false,equal=false,long=false}={}){
 await page.setViewportSize({width,height});
 if(system)await page.addInitScript(installSyntheticSystemText);
 await page.goto('/?review=1&requests=empty'+(root>16&&!system?'&dynamic-type-preview='+root:'')+(long?'&expense-long=1':''));
 await page.locator('.event-list [data-action="open-event"][data-event-id="friend-weekend"]').click();
 await page.locator('[data-action="show-expense-form"][data-event-id="friend-weekend"]').click();
 const d=page.locator('.restaurant-quick-modal');await expect(d).toHaveAttribute('data-quick-stage','method');
 if(view==='method')return d;
 await d.locator('[data-action="restaurant-split-mode"][data-mode="'+(equal?'equal':'items')+'"]').click();
 await expect(d).toHaveAttribute('data-quick-stage','items');
 await d.locator('[data-action="quick-item-amount"]').fill(equal?'120':'90');
 if(!equal){
  await restaurantClick(page,d.locator('.quick-item-description-details summary'));await d.locator('[data-action="quick-item-name"]').fill('פסטה');
  await restaurantClick(page,d.locator('[data-action="quick-item-add"]'));
  // The app focuses a newly added row in requestAnimationFrame. Wait for that
  // user-visible readiness before filling; otherwise its late focus can undo
  // the test's next scroll in mobile WebKit.
  const nextAmount=d.locator('[data-action="quick-item-amount"][data-index="1"]');
  await expect(nextAmount).toBeFocused();await nextAmount.fill('30');
  await restaurantClick(page,d.locator('.quick-item-description-details summary').nth(1));await d.locator('[data-action="quick-item-name"][data-index="1"]').fill('שתייה משותפת');
  await restaurantClick(page,d.locator('.quick-item-owner-field .app-choice-trigger').nth(1));await page.getByRole('option',{name:'משותף לכולם',exact:true}).click();
 }
 if(view==='items')return d;
 await restaurantClick(page,d.locator('.expense-modal-actions [data-stage="review"]'));await expect(d).toHaveAttribute('data-quick-stage','review');
 if(view==='review')return d;
 await restaurantClick(page,d.locator('.expense-modal-actions [data-stage="payer"]'));await expect(d).toHaveAttribute('data-quick-stage','payer');return d;
}
export const restaurantState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const restaurantMoney=state=>state.events.map(e=>({id:e.id,currency:e.currency,expenses:e.expenses,transfers:e.transfers}));
export async function restaurantReach(page,locator){
 await locator.evaluate(e=>{e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const d=e.closest('.expense-modal'),r=e.getBoundingClientRect(),box=d.getBoundingClientRect(),nav=d.parentElement.querySelector('[aria-label="ניווט ראשי"]').getBoundingClientRect(),bottom=Math.min(box.bottom,nav.top);if(r.top<box.top)d.scrollTop+=r.top-box.top-4;else if(r.bottom>bottom)d.scrollTop+=r.bottom-bottom+4;return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 await expect.poll(()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit)})).toBe(true);
 const r=await locator.boundingBox(),nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();
 // Firefox may return 43.999996 for a 44px target; keep hundredth-pixel precision.
 expect(Math.round(r.width*100)/100).toBeGreaterThanOrEqual(44);expect(Math.round(r.height*100)/100).toBeGreaterThanOrEqual(44);
 expect(r.y).toBeGreaterThanOrEqual(-1);expect(r.y+r.height).toBeLessThanOrEqual(nav.y+1);
}
export async function restaurantClick(page,l){await restaurantReach(page,l);await l.click()}
