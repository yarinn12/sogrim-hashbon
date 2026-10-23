import {test,expect} from '@playwright/test';
import {personalPinsCloud} from './helpers/personalPinsCloud.mjs';
import {seed} from './helpers/closedSummaryFixture.mjs';
test.use({serviceWorkers:'block'});
const sizes=[['.friend-row-name > strong',.9375],['.friend-identity-heading strong',.9375],['.friend-privacy-summary-label',.75],['#referral-reward-card-friends .referral-reward-copy > strong',.875]];
async function setup(page,baseURL,{root=16,w=393,h=852,system=false,long=false,empty=false}={}){
 await page.setViewportSize({width:w,height:h});
 if(root>16&&!system)await page.addInitScript(root=>{const u=new URL(location.href);u.searchParams.set('dynamic-type-preview',root);history.replaceState(history.state,'',u)},root);
 if(system)await page.addInitScript(()=>{const supports=CSS.supports.bind(CSS);CSS.supports=(...a)=>a[0]==='font'&&a[1]==='-apple-system-body'?true:supports(...a);const media=matchMedia.bind(window);window.matchMedia=q=>{const m=media(q);return q.replaceAll(' ','')==='(any-pointer:coarse)'?{matches:true,media:q,addEventListener:m.addEventListener.bind(m),removeEventListener:m.removeEventListener.bind(m),addListener:m.addListener.bind(m),removeListener:m.removeListener.bind(m)}:m};const insert=()=>{const s=document.createElement('style');s.id='friends-system-text-fixture';s.textContent='#apple-system-body-size-probe{font-size:34px!important}';document.head.append(s)};if(document.head)insert();else document.addEventListener('DOMContentLoaded',insert,{once:true})});
 const state=seed();if(long)state.participants[1].displayName='דנה אלכסנדרה לוי ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';state.friendContacts=empty?[]:state.participants.slice(1).map(p=>({id:'contact-'+p.id,participantId:p.id,active:true,source:'offline'}));
 const cloud=await personalPinsCloud(page,baseURL,state,{accountId:'friends-text-owner',profileUpdatedAt:'2026-09-03T08:00:00.000Z'});
 await page.getByRole('button',{name:'חברים',exact:true}).click();await expect(page.getByRole('heading',{name:'חברים',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(root);return cloud;
}
async function glyphs(page,root,{empty=false}={}){
 for(const [selector,ratio] of sizes){if(empty&&selector.startsWith('.friend-')){if(selector!=='.friend-privacy-summary-label')continue;}
 const xs=page.locator(selector);await expect(xs.first()).toBeVisible();const values=await xs.evaluateAll(es=>es.map(e=>{const own=e.getBoundingClientRect(),walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),leaves=[],bad=[];let n;while(n=walk.nextNode())for(let i=0;i<n.length;i++){if(!n.textContent[i].trim())continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);for(const g of r.getClientRects())if(g.width&&g.height){leaves.push(parseFloat(getComputedStyle(n.parentElement).fontSize));if(g.left<own.left-1||g.right>own.right+1||g.top<own.top-1||g.bottom>own.bottom+1)bad.push(n.textContent[i]);}}return{font:parseFloat(getComputedStyle(e).fontSize),leaves,bad,text:e.textContent.trim()}}));for(const x of values){expect(x.font,selector+' must scale its real leaf text').toBeCloseTo(root*ratio,2);expect(x.leaves.length).toBeGreaterThan(0);for(const f of x.leaves)expect(f).toBeCloseTo(root*ratio,2);expect(x.bad,'wrapped glyphs must fit their own text box: '+selector).toEqual([]);}
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
}
async function reachable(locator){
 // Match a user's scroll into the usable space between floating Back controls
 // and persistent navigation. scrollIntoViewIfNeeded alone only considers the
 // viewport and can leave an already-visible control behind a fixed overlay.
 await locator.evaluate(e=>{
  e.scrollIntoView({block:'center',behavior:'instant'});
  const back=document.querySelector('[aria-label="ניווט מהיר"]')?.getBoundingClientRect();
  const nav=document.querySelector('.product-app-nav')?.getBoundingClientRect();
  const top=Math.max(0,back?.bottom||0)+8,bottom=Math.min(innerHeight,nav?.top??innerHeight)-8;
  const r=e.getBoundingClientRect();window.scrollBy({top:r.top+r.height/2-(top+bottom)/2,behavior:'instant'});
 });
 const read=()=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {w:r.width,h:r.height,hit:e.contains(hit),cover:hit?.outerHTML.slice(0,160),top:r.top,bottom:r.bottom,height:innerHeight}});
 await expect.poll(async()=>(await read()).hit,{message:'The actual touch center must be clear after user scrolling'}).toBe(true);
 const v=await read();expect(v.w).toBeGreaterThanOrEqual(44);expect(v.h).toBeGreaterThanOrEqual(44);expect(v.top).toBeGreaterThanOrEqual(0);expect(v.bottom).toBeLessThanOrEqual(v.height);expect(v.hit,JSON.stringify(v)).toBe(true);
}
for(const c of [{name:'normal',root:16},{name:'enlarged long names',root:32,w:320,long:true},{name:'short text',root:20,w:393,h:390},{name:'short enlarged',root:32,w:320,h:390,long:true},{name:'system text at startup',root:32,system:true}])test('friend glyph scaling and trash confirmation '+c.name,async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,c),before=cloud.state();await glyphs(page,c.root);const buttons=page.locator('.friend-remove-button');await expect(buttons).toHaveCount(2);await expect(buttons.first().locator('svg path').first()).toHaveAttribute('d','M4 7h16');await reachable(buttons.first());await buttons.first().click();const d=page.locator('.important-action-dialog');await expect(d).toBeVisible();await expect(d).toContainText('השם יישאר באירועים ובהוצאות קיימים');await d.locator('[data-action="cancel-important-action"]').click();await expect(d).toBeHidden();await expect(buttons).toHaveCount(2);await reachable(page.locator('#referral-reward-card-friends'));expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
test('friend text survives reload rotation and resetting to normal size',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,long:true,system:true}),before=cloud.state();await glyphs(page,32);await cloud.reload();await page.getByRole('button',{name:'חברים',exact:true}).click();await glyphs(page,32);await page.setViewportSize({width:852,height:320});await glyphs(page,32);await reachable(page.locator('#referral-reward-card-friends'));await page.evaluate(()=>{document.getElementById('friends-system-text-fixture').textContent='#apple-system-body-size-probe{font-size:17px!important}';window.dispatchEvent(new Event('resize'))});await expect.poll(()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16);await page.setViewportSize({width:393,height:852});await glyphs(page,16);expect(cloud.state()).toEqual(before);expect(cloud.errors).toEqual([]);
});
test('empty friends keep enlarged privacy reward and add action reachable',async({page,baseURL})=>{
 const cloud=await setup(page,baseURL,{root:32,w:320,empty:true});await expect(page.getByRole('heading',{name:'עוד אין חברים',exact:true})).toBeVisible();await glyphs(page,32,{empty:true});await reachable(page.getByRole('button',{name:'הוסף חבר',exact:true}));await reachable(page.locator('#referral-reward-card-friends'));expect(cloud.errors).toEqual([]);
});
