import {expect} from '@playwright/test';
export async function presentationReach(page,locator){
 await locator.evaluate(e=>{e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 // Re-measure after each painted scroll. Firefox can settle input scroll geometry
 // after the first adjustment; every final bound and hit assertion remains strict.
 for(let attempt=0;attempt<4;attempt++){
  const delta=await locator.evaluate(e=>{
   const nav=document.querySelector('[aria-label="ניווט ראשי"]'),buttons=[...document.querySelectorAll('.product-route-controls button')].map(x=>x.getBoundingClientRect()).filter(r=>r.height>0&&r.top>=0&&r.top<80);
   const menu=e.closest('.event-status-menu')?.getBoundingClientRect(),top=menu?Math.max(0,menu.top)+8:Math.max(0,...buttons.map(r=>r.bottom))+8,bottom=menu?Math.min(innerHeight,menu.bottom)-8:nav.getBoundingClientRect().top-8,box=e.getBoundingClientRect(),g=e.dataset.action==='event-status-select'?e.querySelector('.event-row-options-chevron')?.getBoundingClientRect():null;
   const r=g?{top:g.y+g.height/2-22,bottom:g.y+g.height/2+22}:box;
   return r.top<top?r.top-top:r.bottom>bottom?r.bottom-bottom:0;
  });
  if(Math.abs(delta)<.5)break;
  await page.evaluate(d=>{window.scrollBy({top:d,left:0,behavior:'instant'});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},delta);
 }
 const measured=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),nav=document.querySelector('[aria-label="ניווט ראשי"]').getBoundingClientRect(),menu=e.closest('.event-status-menu')?.getBoundingClientRect(),g=e.dataset.action==='event-status-select'?e.querySelector('.event-row-options-chevron')?.getBoundingClientRect():null;
  const x=r.x+r.width/2,y=g?g.y+g.height/2:r.y+r.height/2,hit=document.elementFromPoint(x,y);return{rect:r.toJSON(),x,y,hit:e===hit||e.contains(hit),targetTop:g?y-22:r.top,targetBottom:g?y+22:r.bottom,bottom:menu?Math.min(innerHeight,menu.bottom):nav.top};});
 expect(measured.rect.width).toBeGreaterThanOrEqual(43.99);expect(measured.rect.height).toBeGreaterThanOrEqual(43.99);expect(measured.rect.x).toBeGreaterThanOrEqual(-1);expect(measured.targetTop).toBeGreaterThanOrEqual(-1);expect(measured.targetBottom).toBeLessThanOrEqual(measured.bottom+1);expect(measured.hit).toBe(true);
 return measured;
}
export async function presentationClick(page,locator){await expect(locator).toBeEnabled();const m=await presentationReach(page,locator);await page.mouse.click(m.x,m.y)}
