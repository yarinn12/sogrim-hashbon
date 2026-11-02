import {expect} from '@playwright/test';
import {openRenderedHome} from './typographyReadiness.mjs';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
import {paint,pointClick} from './eventNotesBatchPresentation.mjs';
export const identityAccount='account-22222222-2222-4222-8222-222222222222',identityOffline='saved-manual-yael';
export const identityState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const identityMoney=s=>s.events.map(e=>({id:e.id,currency:e.currency,expenses:e.expenses,transfers:e.transfers,participants:e.participantIds,links:e.participantAccountLinks||[]}));
export async function openIdentity(page,view='identity',{width=393,height=852,root=16,system=false,query=''}={}){
 if(system)await page.addInitScript(installSyntheticSystemText);
 await page.setViewportSize({width,height});
 await openRenderedHome(page,{path:'/?participant-identity-batch=1&identity-view='+view+'&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
 await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));
 await pointClick(page.locator('[data-action="open-event-participants"]'));
 await pointClick(page.locator('[data-action="review-duplicate-participants"]'));
 const d=page.locator('.event-modal');await expect(d.locator('.participant-identity-review')).toBeVisible();await paint(page);
 if(view==='aliases'||view==='separate'){
  await separateIdentities(page,d);
  const details=d.locator('.participant-aliases');
  if(view==='separate'&&await details.getAttribute('open')!==null)await pointClick(details.locator('summary'));
 }
 return d;
}
export async function separateIdentities(page,d){
 await pointClick(d.locator('[data-action="keep-duplicate-participants"]'));
 await expect.poll(()=>page.evaluate(()=>document.activeElement?.dataset.action)).toBe('participant-alias');
 await expect(d.locator('.participant-aliases')).toBeVisible();
}
export async function identityReach(page,control){
 await control.scrollIntoViewIfNeeded();
 await expect.poll(()=>control.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===e||e.contains(hit))})).toBe(true);
 const b=await control.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);
 const nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();if(nav)expect(b.y+b.height).toBeLessThanOrEqual(nav.y+1);
}
export async function identityGeometry(page,d,root=16){
 await paint(page);
 const fonts=await d.evaluate(e=>({root:parseFloat(getComputedStyle(document.documentElement).fontSize),title:parseFloat(getComputedStyle(e.querySelector('h2')).fontSize),names:[...e.querySelectorAll('.participant-identity-person strong')].map(n=>parseFloat(getComputedStyle(n).fontSize)),inputs:[...e.querySelectorAll('input')].map(n=>parseFloat(getComputedStyle(n).fontSize))}));
 expect(fonts.root).toBe(root);expect(fonts.title).toBe(root*1.5);for(const n of fonts.names)expect(n).toBe(root);for(const n of fonts.inputs)expect(n).toBe(root);
 const bounds=await d.evaluate(e=>{const box=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),bad=[];let lines=0;for(let n=walker.nextNode();n;n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('svg,[aria-hidden="true"],.sr-only,.visually-hidden'))continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects()){if(!r.width||!r.height)continue;lines++;if(r.left<box.left-1||r.right>box.right+1)bad.push(n.textContent.trim())}}return{width:innerWidth,pageWidth:document.documentElement.scrollWidth,left:box.left,right:box.right,lines,bad}});
 expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.width+1);expect(bounds.left).toBeGreaterThanOrEqual(-1);expect(bounds.right).toBeLessThanOrEqual(bounds.width+1);expect(bounds.bad).toEqual([]);expect(bounds.lines).toBeGreaterThan(0);
 for(const control of await d.locator('button:visible,summary:visible,input:visible').all())await identityReach(page,control);
 await expect(d.locator('[data-action="open-participant-statistics"]')).toHaveCount(0);
}
export async function saveIdentityAlias(page,d,id,value){
 const input=d.locator('[data-action="participant-alias"][data-participant-id="'+id+'"]');await input.fill(value);
 await pointClick(d.locator('[data-action="save-participant-alias"][data-participant-id="'+id+'"]'));
 await expect.poll(()=>page.evaluate(id=>__friendInviteQa.canonicalSnapshot.state.events[0].participantAliases?.[id],id)).toBe(value);
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events[0].participantAliases?.[id],id)).toBe(value);
 await expect.poll(()=>page.evaluate(()=>document.activeElement?.dataset.participantId)).toBe(id);
}
