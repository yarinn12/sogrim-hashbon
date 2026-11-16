import {expect} from '@playwright/test';
import {personalPinsCloud} from './personalPinsCloud.mjs';
import {closedSummarySeed,eventId} from './closedSummaryFixture.mjs';

export function closeSaveAcknowledged(statuses,start){
  const phase=statuses.slice(start);
  const saving=phase.lastIndexOf('saving');
  return saving>=0&&phase.slice(saving+1).includes('saved');
}

async function waitForPaymentActionReady(page,selector){
  await page.waitForFunction(selector=>{
    const probe=window.__paymentPreparationProbe??={node:null,bounds:null,stableFrames:0};
    const button=document.querySelector(selector);
    if(!button?.isConnected||!button.closest('.settlement-screen')){
      probe.node=null;probe.stableFrames=0;return false;
    }
    for(let element=button;element;element=element.parentElement){
      if(element.getAnimations().some(animation=>animation.playState==='running'&&
        Number.isFinite(animation.effect?.getComputedTiming().endTime))){
        probe.node=null;probe.stableFrames=0;return false;
      }
    }
    const rect=button.getBoundingClientRect(),bounds=[rect.x,rect.y,rect.width,rect.height];
    if(probe.node===button&&probe.bounds?.every((value,index)=>value===bounds[index])){
      probe.stableFrames++;
    }else{
      probe.node=button;probe.bounds=bounds;probe.stableFrames=0;
    }
    return probe.stableFrames>=2;
  },selector,{polling:'raf',timeout:8_000});
  await page.evaluate(()=>delete window.__paymentPreparationProbe);
}

export async function paymentFixture(page,baseURL,root,{beforePreparation}={}){
  await page.setViewportSize({width:root===32?320:393,height:852});
  await page.addInitScript(root=>{
    if(root>16){const url=new URL(location.href);url.searchParams.set('dynamic-type-preview',String(root));history.replaceState(history.state,'',url);}
    window.__connectedPayment={armed:false,events:[],syncStatuses:[]};
    window.addEventListener('sogrim:sync-status',event=>{
      window.__connectedPayment.syncStatuses.push(event.detail?.status);
    });
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
  const saveStart=await page.evaluate(()=>window.__connectedPayment.syncStatuses.length);
  await page.locator('[data-action="confirm-close-event"]').click();
  await expect.poll(()=>cloud.writes.at(-1)?.state.events[0].locked).toBe(true);
  await expect.poll(async()=>closeSaveAcknowledged(
    await page.evaluate(()=>window.__connectedPayment.syncStatuses),saveStart
  )).toBe(true);
  const dismiss=page.locator('[data-action="dismiss-notice"]');
  await expect(dismiss).toHaveCount(1);
  await dismiss.click();
  await expect(dismiss).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
  const before=cloud.state().events[0],transfer=before.transfers.find(t=>t.fromParticipantId===cloud.state().currentParticipantId);
  const selector='.transfer-row [data-action="mark-paid"][data-transfer-id="'+transfer.id+'"]';
  const action=page.locator(selector);
  await beforePreparation?.(page,transfer.id);
  await waitForPaymentActionReady(page,selector);
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
