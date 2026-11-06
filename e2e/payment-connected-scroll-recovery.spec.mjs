import {test,expect} from '@playwright/test';
import {personalPinsCloud} from './helpers/personalPinsCloud.mjs';
import {closedSummarySeed,eventId} from './helpers/closedSummaryFixture.mjs';

test.use({serviceWorkers:'block'});
async function paymentFixture(page,baseURL,root){
  await page.setViewportSize({width:root===32?320:393,height:852});
  await page.addInitScript(root=>{
    if(root>16){const url=new URL(location.href);url.searchParams.set('dynamic-type-preview',String(root));history.replaceState(history.state,'',url);}
    window.__connectedPayment={armed:false,events:[]};
    document.addEventListener('pointerdown',event=>{
      const evidence=window.__connectedPayment;
      const button=event.target.closest?.('.transfer-row [data-action="mark-paid"]');
      if(!evidence.armed||button?.dataset.transferId!==evidence.transferId)return;
      evidence.armed=false;
      const before=button.getBoundingClientRect(),scrollBefore=window.scrollY;
      // Match the observed92px scroll, before application capture listeners.
      // Keep the original DOM/button, pointer coordinates and native input.
      window.scrollBy({top:-92,left:0,behavior:'instant'});
      const after=button.getBoundingClientRect();
      evidence.shift={trusted:event.isTrusted,pointerId:event.pointerId,pointerType:event.pointerType,scrollBefore,scrollAfter:window.scrollY,
        beforeTop:before.top,afterTop:after.top,connected:button.isConnected,x:event.clientX,y:event.clientY};
    },true);
    for(const type of['pointerdown','pointerup','click','gotpointercapture','lostpointercapture'])
      document.addEventListener(type,event=>{
        if(!window.__connectedPayment.transferId)return;
        const button=event.target.closest?.('button[data-action]');
        window.__connectedPayment.events.push({type,action:button?.dataset.action,id:button?.dataset.transferId,
          trusted:event.isTrusted,detail:event.detail,pointerType:event.pointerType});
      },true);
    window.addEventListener('click',event=>{
      const button=event.target.closest?.('button[data-action]');
      window.__connectedPayment.events.push({type:'unblocked-click',action:button?.dataset.action,id:button?.dataset.transferId});
    });
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
  const before=cloud.state().events[0],transfer=before.transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId);
  const action=page.locator('.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]');
  await action.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThanOrEqual(92);
  await page.evaluate(id=>{window.__connectedPayment.transferId=id;window.__connectedPayment.armed=true;},transfer.id);
  return{cloud,before,transfer,action};
}
for(const root of[16,32])test('native payment click survives a connected-button viewport shift at pointerdown root '+root,async({page,baseURL},info)=>{
  const{cloud,before,transfer,action}=await paymentFixture(page,baseURL,root);
  await action.click();
  const evidence=await page.evaluate(()=>window.__connectedPayment);
  await info.attach('connected-native-pointer-evidence',{body:JSON.stringify(evidence),contentType:'application/json'});
  expect(evidence.shift.trusted).toBe(true);expect(evidence.shift.pointerType).toBe('mouse');
  expect(evidence.shift.connected).toBe(true);
  expect(evidence.shift.scrollBefore-evidence.shift.scrollAfter).toBe(92);
  expect(evidence.shift.afterTop-evidence.shift.beforeTop).toBe(92);
  await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].transfers.find(t=>t.id===transfer.id)?.status).toBe('paid');
  const saved=cloud.state().events[0];
  expect(saved.expenses).toEqual(before.expenses);
  expect(saved.transfers.map(({id,amount})=>({id,amount}))).toEqual(before.transfers.map(({id,amount})=>({id,amount})));
  expect(saved.activityLog.filter(item=>item.kind==='transfer-paid'&&item.entityId===transfer.id)).toHaveLength(1);
  const clicks=evidence.events.filter(e=>e.type==='click'&&e.action==='mark-paid'&&e.id===transfer.id);
  expect(clicks).toHaveLength(1);expect(clicks[0].trusted).toBe(true);expect(clicks[0].detail).toBeGreaterThan(0);
  expect(cloud.errors).toEqual([]);
});
for(const cancellation of['drag','wheel'])test('connected-button native capture cancels deliberate '+cancellation,async({page,baseURL},info)=>{
  const{cloud,before,transfer,action}=await paymentFixture(page,baseURL,16);
  const writes=cloud.writes.length;
  const point=await action.evaluate(button=>{const b=button.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  expect(await action.evaluate(button=>button.hasPointerCapture(window.__connectedPayment.shift.pointerId))).toBe(true);
  if(cancellation==='drag')await page.mouse.move(point.x+30,point.y);
  else await page.mouse.wheel(0,40);
  await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const evidence=await page.evaluate(()=>window.__connectedPayment);
  await info.attach('cancelled-connected-native-pointer',{body:JSON.stringify(evidence),contentType:'application/json'});
  expect(evidence.events.filter(e=>e.type==='unblocked-click'&&e.action==='mark-paid'&&e.id===transfer.id)).toHaveLength(0);
  await expect(page.locator('.transfer-row[data-transfer-id="'+transfer.id+'"][data-transfer-status="pending"]')).toBeVisible();
  expect(cloud.state().events[0].transfers.find(t=>t.id===transfer.id)?.status).toBe('pending');
  expect(cloud.writes).toHaveLength(writes);
  expect(cloud.state().events[0].expenses).toEqual(before.expenses);
  expect(cloud.errors).toEqual([]);
});
