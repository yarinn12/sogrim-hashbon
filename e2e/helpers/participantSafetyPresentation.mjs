import {expect} from '@playwright/test';
import {openRenderedHome} from './typographyReadiness.mjs';
import {installSyntheticSystemText} from './accessibilityPresentation.mjs';
import {paint,pointClick,settled} from './eventNotesBatchPresentation.mjs';
export {paint,pointClick,settled};
export const account='account-22222222-2222-4222-8222-222222222222',owner='account-11111111-1111-4111-8111-111111111111';
export const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('settle-friends-state:friend-invitation-space')));
export const financial=s=>s.events.map(e=>({id:e.id,currency:e.currency,participantIds:e.participantIds,adminIds:e.adminIds,expenses:e.expenses,transfers:e.transfers}));
export async function openSafety(page,kind,{width=393,height=852,root=16,system=false,query=''}={}){
 if(system)await page.addInitScript(installSyntheticSystemText);await page.setViewportSize({width,height});
 await openRenderedHome(page,{path:'/?participant-safety-batch=1&requests=accepted&reward=inactive'+(!system&&root>16?'&dynamic-type-preview='+root:'')+query,bootTimeoutMs:30000,readyTimeoutMs:8000});
 await pointClick(page.locator('.product-home-screen .event-list [data-action="open-event"][data-event-id="friend-weekend"]'));await pointClick(page.locator('[data-action="open-event-participants"]'));
 const target=kind==='self'?owner:kind==='offline'?'saved-manual-yael':account;
 await pointClick(page.locator('.event-participant-roster-row[data-participant-id="'+target+'"]'));
 if(kind==='self'){const settings=page.getByRole('region',{name:'הגדרות האירוע',exact:true});await expect(settings).toBeVisible();return settings;}
 const detail=page.locator('.event-participant-management-modal');await expect(detail).toBeVisible();await paint(page);
 if(['entry','self','offline'].includes(kind))return detail;
 if(kind==='privacy'||kind==='block'){
  await pointClick(detail.locator('[data-action="open-participant-statistics"][data-participant-id="'+account+'"]'));
  const panel=page.locator('.relationship-safety-management');await pointClick(panel.locator('summary'));
  if(kind==='privacy')return panel;
  await pointClick(panel.locator('[data-action="block-connected-user"]'));const d=page.locator('[data-important-action-kind="block-connected-user"]');await expect(d).toBeVisible();await paint(page);return d;
 }
 await pointClick(detail.locator('.relationship-safety-management summary'));
 await pointClick(detail.locator('[data-action="open-participant-report"]'));
 const form=page.locator('.event-participant-report-modal');await expect(form).toBeVisible();await paint(page);return form;
}
export async function chooseReason(page,form,label='ספאם או הזמנות חוזרות'){
 await pointClick(form.locator('.app-choice-trigger'));await pointClick(page.getByRole('option',{name:label,exact:true}));await paint(page);
}
export async function geometry(page,scope,kind,root){
 await paint(page);
 const metrics=await scope.evaluate((e,kind)=>{
  const box=e.getBoundingClientRect(),fonts=[],specs=kind==='privacy'?[['summary>span:not([aria-hidden])',1],['.safety-option>span:not([aria-hidden])',.9375]]:kind==='block'?[['h2',1.25],['.participant-confirm-person strong',1],['.participant-username',.8125]]:[['h2',1.5],['.participant-report-person strong',1],['.field>span',.875],['textarea',1],['.app-choice-trigger-copy',1]];
  for(const[s,ratio]of specs)for(const n of e.querySelectorAll(s))fonts.push({s,ratio,size:parseFloat(getComputedStyle(n).fontSize)});
  const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),bad=[];let lines=0;
  for(let n=walker.nextNode();n;n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('svg,[aria-hidden="true"],.sr-only,.visually-hidden'))continue;const r=document.createRange();r.selectNodeContents(n);for(const b of r.getClientRects()){if(!b.width||!b.height)continue;lines++;if(b.left<box.left-1||b.right>box.right+1)bad.push(n.textContent.trim())}}
  return{fonts,bad,lines,left:box.left,right:box.right,pageWidth:document.documentElement.scrollWidth};
 },kind);
 for(const f of metrics.fonts)expect(f.size,f.s).toBeCloseTo(root*f.ratio,1);expect(metrics.bad).toEqual([]);expect(metrics.pageWidth).toBeLessThanOrEqual(page.viewportSize().width+1);expect(metrics.left).toBeGreaterThanOrEqual(-1);expect(metrics.right).toBeLessThanOrEqual(page.viewportSize().width+1);
 for(const c of await scope.locator('button:visible:not([disabled]),summary:visible,textarea:visible').all()){
  await c.scrollIntoViewIfNeeded();await expect.poll(()=>c.evaluate(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return !!hit&&(hit===e||e.contains(hit))})).toBe(true);const b=await c.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);
  if(kind!=='block'){const nav=page.getByRole('navigation',{name:'ניווט ראשי',exact:true});if(await nav.isVisible())expect(b.y+b.height).toBeLessThanOrEqual((await nav.boundingBox()).y+1);}
 }
 return metrics;
}
