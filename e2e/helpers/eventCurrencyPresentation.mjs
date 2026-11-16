import {expect} from '@playwright/test';
import {readable} from './syncNoticePresentation.mjs';
async function finish(page,{allowCurrency=false}={}){const m=await page.evaluate(allowCurrency=>{const q=__friendInviteQa,keys=['id','participantIds','expenses','transfers','activityLog','notes','adminIds','createdByParticipantId','locked','adminsCanEditOnly',...(!allowCurrency?['currency']:[])];const bad=s=>s.events.some(e=>{const seed=q.seedFinancialEvents.find(x=>x.id===e.id);return !seed||keys.some(k=>JSON.stringify(e[k])!==JSON.stringify(seed[k]))});return{profile:q.profileWrites.length,friends:q.writes.length,reward:q.rewardWrites.length,shared:q.shared.length,copied:q.copied.length,windows:q.shareWindows.length,financial:q.snapshotWrites.filter(w=>{const d=Array.isArray(w.body)?w.body[0]:w.body;return d.state&&bad(d.state)}).length,canonicalFinancial:q.canonicalWrites.filter(bad).length}},allowCurrency);for(const[k,v]of Object.entries(m))expect(v,k).toBe(0)}
async function ack(page,currency){await expect.poll(()=>page.evaluate(()=>__friendInviteQa.canonicalWrites.at(-1)?.events?.[0]?.currency)).toBe(currency);await expect.poll(()=>page.evaluate(async()=>{const m=await import('/src/data/localStore.mjs');return m.pendingSharedSyncStatus().pending})).toBe(false)}

export async function geometry({page,menu,root}) {
 await expect(menu.locator(".app-choice-trigger")).toBeVisible();
 const specs=[['h2',1.5],['#event-modal-description',.8125],['.event-currency-field > span',1],['.app-choice-trigger-copy',.9375],['.event-currency-field > small',.875]];
 const metrics=await menu.evaluate((e,specs)=>{
  const fonts=[],bad=[];
  for(const[s,ratio]of specs)for(const n of e.querySelectorAll(s)){
   const box=n.getBoundingClientRect();fonts.push({s,ratio,size:parseFloat(getComputedStyle(n).fontSize)});
   const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;
   while(t=walker.nextNode())for(let i=0;i<t.length;i++){
    if(!t.textContent[i].trim())continue;const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);
    for(const b of r.getClientRects())if(b.width&&(b.left<Math.max(0,box.left)-1||b.right>Math.min(innerWidth,box.right)+1))bad.push(s);
   }
  }
  const trigger=e.querySelector('.app-choice-trigger'),a=trigger.getBoundingClientRect(),b=trigger.querySelector('.app-choice-trigger-arrow').getBoundingClientRect();
  return{fonts,bad,arrowOffset:Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2),overflow:document.documentElement.scrollWidth-innerWidth,body:getComputedStyle(e.querySelector('.event-modal-body')).overflowY,document:getComputedStyle(document.documentElement).overflowY};
 },specs);
 expect(metrics.bad).toEqual([]);expect(metrics.overflow).toBe(0);expect(metrics.body).toBe('visible');expect(metrics.document).toBe('hidden');expect(metrics.arrowOffset).toBeLessThanOrEqual(1);
 for(const f of metrics.fonts)expect(f.size,f.s).toBe(root*f.ratio);
 for(const[s]of specs)await readable(menu.locator(s));
 const box=await menu.locator('.app-choice-trigger').boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
 return metrics;
}
export async function pickerSearch(page,root) {
 const picker=page.locator('.app-choice-picker-backdrop'),input=picker.locator('input[type=search]');await expect(picker).toBeVisible();
 await expect(input).toHaveCSS('font-size',(root*.9375)+'px');expect(await input.evaluate(e=>getComputedStyle(e,'::placeholder').fontSize)).toBe((root*.9375)+'px');
 const placeholder=await input.evaluate(e=>{const s=getComputedStyle(e,'::placeholder'),c=document.createElement('canvas').getContext('2d');c.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;return{ink:c.measureText(e.placeholder).width,width:e.clientWidth}});expect(placeholder.ink).toBeLessThanOrEqual(placeholder.width+1);
 await input.fill('תאילנד');await expect(picker.locator('.app-choice-option:visible')).toHaveCount(1);await expect(picker.locator('[data-choice-value="THB"]')).toContainText('באט');
 await expect(picker.locator('[data-choice-value="THB"] strong')).toHaveCSS('font-size',(root*.9375)+'px');
 await input.fill('zzzz-no-currency');await expect(picker.locator('.app-choice-search-empty')).toBeVisible();
 return{picker,input};
}
export{finish,ack};
