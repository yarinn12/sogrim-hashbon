import {expect} from '@playwright/test';
import {openRenderedHome} from './typographyReadiness.mjs';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
import {paint,pointClick,settled} from './eventNotesBatchPresentation.mjs';
export {paint,pointClick,settled};
export const owner='account-11111111-1111-4111-8111-111111111111',account='account-22222222-2222-4222-8222-222222222222',offline='saved-manual-yael';
export async function state(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')))}
export async function openAction(page,kind,{width=393,height=852,root=16,system=false,query=''}={}){
 if(system)await page.addInitScript(installSyntheticSystemText);await page.setViewportSize({width,height});
 await openRenderedHome(page,{path:'/?participant-actions-batch=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
 await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));await pointClick(page.locator('[data-action="open-event-participants"]'));
 await pointClick(page.locator('.event-participant-roster-row[data-participant-id="'+(kind==='remove-account'||kind==='detail-account'?account:offline)+'"]'));
 const detail=page.locator('.event-participant-management-modal');await expect(detail).toBeVisible();await paint(page);await settled(page);
 if(kind.startsWith('detail-'))return detail;
 if(kind==='rename'){await pointClick(detail.locator('[data-action="open-offline-participant-rename"]'));const form=page.locator('.event-modal:has(.event-participant-rename-card)');await expect(form).toBeVisible();await paint(page);return form;}
 if(kind==='link'){await pointClick(detail.locator('[data-action="open-event-participant-link"]'));await pointClick(page.locator('[data-action="link-offline-participant-account"][data-target-participant-id="'+account+'"]'));}
 else await pointClick(detail.locator('[data-action="remove-event-participant"]'));
 const modal=page.locator('.important-action-dialog[data-important-action-kind="'+(kind==='link'?'merge-participants':'remove-event-participant')+'"]');await expect(modal).toBeVisible();await paint(page);return modal;
}
export function amounts(e){return{currency:e.currency,expenses:e.expenses.map(x=>({total:x.total,payers:x.payers.map(p=>p.amount).sort()})),transfers:e.transfers.map(x=>({amount:x.amount,status:x.status}))};}
export async function receipts(page){await settled(page);return page.evaluate(()=>({canonical:__friendInviteQa.canonicalSnapshot.state,personal:JSON.parse(localStorage.getItem('qa-invite-server-row')).state,requests:__friendInviteQa.canonicalRequests,profileWrites:__friendInviteQa.profileWrites.length,friends:__friendInviteQa.writes.length,rewards:__friendInviteQa.rewardWrites.length}));}
export async function geometry(page,scope,kind,root){
 await paint(page);const specs=kind==='rename'?[['h2',1.5],['.field>span',.875],['input',1],['#event-participant-rename-note',.875],['.event-participant-rename-actions>button',.9375]]:[['#important-action-title',1.25],['.participant-confirm-person strong',1],['.participant-confirm-caption',.8125],['#important-action-description',.875],['.important-action-dialog-actions>button',.9375]];
 const m=await scope.evaluate((e,specs)=>{const box=e.getBoundingClientRect(),bad=[],fonts=[];let lines=0;for(const[s,ratio]of specs)for(const el of e.querySelectorAll(s)){fonts.push({s,ratio,size:parseFloat(getComputedStyle(el).fontSize)});if(el.matches('input'))continue;const range=document.createRange();range.selectNodeContents(el);for(const r of range.getClientRects()){if(r.width&&r.height){lines++;if(r.left<box.left-1||r.right>box.right+1)bad.push(s)}}}return{bad,fonts,lines,pageOverflow:document.documentElement.scrollWidth-innerWidth,localOverflow:e.scrollWidth-e.clientWidth};},specs);
 expect(m.bad).toEqual([]);expect(m.lines).toBeGreaterThan(0);expect(m.fonts.length).toBeGreaterThan(3);expect(m.pageOverflow).toBe(0);expect(m.localOverflow).toBe(0);for(const f of m.fonts)expect(f.size,f.s).toBe(root*f.ratio);
 for(const b of await scope.locator('button:not([disabled]):visible').all()){await b.scrollIntoViewIfNeeded();await expect.poll(()=>b.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return !!hit&&(hit===e||e.contains(hit))})).toBe(true);const r=await b.boundingBox();expect(r.height).toBeGreaterThanOrEqual(44);}
 if(kind==='rename'){const b=await scope.locator('[data-action="save-offline-participant-name"]').boundingBox(),nav=await page.getByRole('navigation',{name:'ניווט ראשי',exact:true}).boundingBox();if(nav)expect(b.y+b.height).toBeLessThanOrEqual(nav.y+1);}
}
