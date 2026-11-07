import {test,expect} from '@playwright/test';
import {personalPinsCloud} from './helpers/personalPinsCloud.mjs';
import {closedSummarySeed,eventId} from './helpers/closedSummaryFixture.mjs';

// Browser-generated touch events, including on desktop-engine profiles.
// This remains browser emulation, not a physical iPad/iPhone measurement.
test.use({serviceWorkers:'block',hasTouch:true});

for(const root of [16,32])test('touch payment survives a render during pointerdown root '+root,async({page,baseURL},info)=>{
 await page.setViewportSize({width:root===32?320:393,height:852});
 await page.addInitScript(root=>{
  if(root>16){const url=new URL(location.href);url.searchParams.set('dynamic-type-preview',String(root));history.replaceState(history.state,'',url);}
 },root);
 const cloud=await personalPinsCloud(page,baseURL,closedSummarySeed({payer:true}),{
  accountId:'closed-summary-owner',profileUpdatedAt:'2026-09-03T08:00:00.000Z'});
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole('button',{name:'פתיחת הסיכום: מי מעביר למי',exact:true}).click();
 await page.locator('.settlement-close-primary').click();
 await page.locator('[data-action="confirm-close-event"]').click();
 await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].locked).toBe(true);
 await page.locator('[data-action="dismiss-notice"]').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
 await page.evaluate(()=>document.fonts.ready);
 const before=cloud.state().events[0];
 const transfer=before.transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId);
 const selector='.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]';
 const action=page.locator(selector);await action.scrollIntoViewIfNeeded();
 await page.evaluate(selector=>{
  window.__touchPaymentEvidence={downs:[],ups:[],cancelled:[],replaced:false};
  const geometry=()=>{
   const button=document.querySelector(selector),b=button?.getBoundingClientRect();
   return {scrollY:window.scrollY,box:b?{x:b.x,y:b.y,width:b.width,height:b.height}:null,
    modal:document.querySelector('[aria-modal="true"]')?.className};
  };
  document.addEventListener('pointerdown',function renderDuringTouch(event){
   const button=event.target.closest?.(selector);if(!button)return;
   document.removeEventListener('pointerdown',renderDuringTouch,true);
   window.__touchPaymentEvidence.downs.push({pointerType:event.pointerType,pointerId:event.pointerId,trusted:event.isTrusted,
    button:event.button,primary:event.isPrimary,x:event.clientX,y:event.clientY,geometry:geometry()});
   document.dispatchEvent(new CustomEvent('settle-friends:notice',{detail:{message:'רענון מבוקר במהלך לחיצת מגע'}}));
   window.__touchPaymentEvidence.replaced=!button.isConnected;
   window.__touchPaymentEvidence.afterRender=geometry();
  },true);
  document.addEventListener('pointercancel',event=>window.__touchPaymentEvidence.cancelled.push({pointerId:event.pointerId,pointerType:event.pointerType}),true);
  document.addEventListener('pointerup',event=>window.__touchPaymentEvidence.ups.push({pointerType:event.pointerType,pointerId:event.pointerId,trusted:event.isTrusted,
   button:event.button,primary:event.isPrimary,x:event.clientX,y:event.clientY,geometry:geometry(),
   hit:document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-action]')?.dataset.action}),{capture:true,once:true});
 },selector);
 const point=await action.evaluate(button=>{const b=button.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
 await page.touchscreen.tap(point.x,point.y);
 const evidence=await page.evaluate(()=>window.__touchPaymentEvidence);
 await info.attach('browser-generated-payment-touch',{body:JSON.stringify(evidence),contentType:'application/json'});
 expect(evidence.replaced).toBe(true);
 expect(evidence.downs).toHaveLength(1);expect(evidence.ups).toHaveLength(1);
 expect(evidence.downs[0].pointerType).toBe('touch');expect(evidence.ups[0].pointerType).toBe('touch');
 expect(evidence.downs[0].trusted&&evidence.ups[0].trusted).toBe(true);
 expect(evidence.ups[0].pointerId).toBe(evidence.downs[0].pointerId);
 await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.find(t=>t.id===transfer.id)?.status).toBe('paid');
 const saved=cloud.state().events[0];
 expect(saved.expenses).toEqual(before.expenses);
 expect(saved.transfers.map(({id,amount})=>({id,amount}))).toEqual(before.transfers.map(({id,amount})=>({id,amount})));
 expect(saved.activityLog.filter(item=>item.kind==='transfer-paid'&&item.entityId===transfer.id)).toHaveLength(1);
 expect(cloud.errors).toEqual([]);
});
