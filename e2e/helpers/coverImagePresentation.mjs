import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
export {paint} from './cropInviteBlockPresentation.mjs';
import {paint} from './cropInviteBlockPresentation.mjs';
export async function reach(page,locator){
 await locator.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await paint(page);
 for(let i=0;i<4;i++){
  const m=await locator.evaluate(e=>{
   let owner=e.parentElement;while(owner&&!(owner.scrollHeight>owner.clientHeight+1&&/auto|scroll/.test(getComputedStyle(owner).overflowY)))owner=owner.parentElement;
   const b=e.getBoundingClientRect(),modal=e.closest('dialog'),d=modal?.getBoundingClientRect(),pane=owner?.getBoundingClientRect(),nav=document.querySelector('.product-app-nav')?.getBoundingClientRect(),routes=[...document.querySelectorAll('.product-route-controls button')].map(e=>e.getBoundingClientRect()).filter(r=>r.height&&r.top>=0&&r.top<80);
   const top=modal?d.top+4:Math.max(0,pane?.top??0,...routes.map(r=>r.bottom))+6,bottom=modal?d.bottom-4:Math.min(innerHeight,pane?.bottom??innerHeight,nav?.height?nav.top:innerHeight)-6;
   return{delta:b.top<top?b.top-top:b.bottom>bottom?b.bottom-bottom:0,before:owner?.scrollTop??scrollY,top,bottom};
  });
  if(Math.abs(m.delta)<.5)break;
  const after=await locator.evaluate((e,y)=>{let owner=e.parentElement;while(owner&&!(owner.scrollHeight>owner.clientHeight+1&&/auto|scroll/.test(getComputedStyle(owner).overflowY)))owner=owner.parentElement;(owner||window).scrollBy({top:y,left:0,behavior:'instant'});return owner?.scrollTop??scrollY},m.delta>0?Math.ceil(m.delta):Math.floor(m.delta));
  await paint(page);
  // Settings owns its scroll surface. Firefox can ignore an immediate scroll
  // after scrollIntoView; test the actual owner before using real wheel input.
  if(page.context().browser()?.browserType().name()==='firefox'&&Math.abs(after-m.before)<.5){const size=page.viewportSize();await page.mouse.move(size.width/2,Math.max(4,Math.min(size.height-4,(m.top+m.bottom)/2)));await page.mouse.wheel(0,m.delta);await paint(page)}
 }
 const p=await locator.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{width:r.width,height:r.height,x,y,hit:h===e||e.contains(h)}});
 expect(p.width).toBeGreaterThanOrEqual(43.99);expect(p.height).toBeGreaterThanOrEqual(43.99);expect(p.hit,JSON.stringify(p)).toBe(true);return p;
}
export async function click(page,locator){await expect(locator).toBeVisible();await expect(locator).toBeEnabled();const p=await reach(page,locator);await page.mouse.click(p.x,p.y);await paint(page)}
export const imageBytes=readFileSync(new URL('../../assets/avatars/avatar-3.png',import.meta.url));
export async function chooseImage(page,{profile=false,bad=false,type='image/png'}={}){
 const input=page.locator(profile?'[data-action="profile-avatar-image"][data-image-source="gallery"]':'.event-cover-settings [data-action="event-cover-image"]').first();
 await input.setInputFiles({name:bad?'unreadable.png':'example-photo.png',mimeType:type,buffer:bad?Buffer.from('not-a-valid-image-file'):imageBytes});
 if(!bad&&type.startsWith('image/')){await expect(page.locator('.image-crop-dialog[open]')).toBeVisible();await expect.poll(()=>page.locator('[data-crop-preview]').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true)}
 await paint(page);
}
export async function start(page,view,{root=16,width=393,height=852,system=false}={}){
 await page.setViewportSize({width,height});
 await page.goto('/?cover-image-qa=1&requests=empty&reward=inactive'+(root>16&&!system?'&dynamic-type-preview='+root:'')+(view==='cover-save-error'?'&image-mode=permission':'')+(process.env.COVER_IMAGE_NATIVE?'&native=1':''));
 await page.evaluate(()=>document.fonts.ready);
 if(view==='profile-image-error'){
  const nav=page.getByRole('navigation',{name:'ניווט ראשי',exact:true});await click(page,nav.getByRole('button',{name:'פרופיל',exact:true}));await click(page,page.locator('.profile-avatar-picker-summary'));
 }else{
  await click(page,page.locator('.product-home-screen [data-action="open-event"][data-event-id="friend-weekend"]').first());await click(page,page.locator('.screen [data-action="open-event-settings"]'));
 }
 await chooseImage(page,{profile:view==='profile-image-error',bad:['profile-image-error','cover-image-error'].includes(view)});
 if(view==='cover-save-error'){
  await click(page,page.locator('[data-crop-action="confirm"]'));await expect(page.locator('.image-crop-dialog[open]')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>__friendInviteQa.coverDeniedAttempts.length)).toBeGreaterThan(0);
 }
 if(view!=='cover-crop')await expect(page.locator('.image-selection-feedback,#profile-name-error,.app-toast').filter({hasText:/תמונה|תמונת/}).first()).toBeAttached();
 await paint(page);return page.locator(view==='cover-crop'?'.image-crop-dialog':view==='profile-image-error'?'.profile-avatar-picker-shell':'.event-cover-settings');
}
export const financial=page=>page.evaluate(()=>JSON.stringify(__friendInviteQa.canonicalSnapshot.state.events.map(({expenses,transfers,participantIds,adminIds,currency})=>({expenses,transfers,participantIds,adminIds,currency}))));
