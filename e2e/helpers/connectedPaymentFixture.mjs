import {expect} from '@playwright/test';
import {personalPinsCloud} from './personalPinsCloud.mjs';
import {closedSummarySeed,eventId} from './closedSummaryFixture.mjs';

export async function paymentFixture(page,baseURL,root){
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

export async function verifyNativeCancellation(page,baseURL,info,cancellation){
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
}
