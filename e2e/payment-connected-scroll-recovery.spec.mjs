import {test,expect} from '@playwright/test';
import {paymentFixture,verifyNativeCancellation} from './helpers/connectedPaymentFixture.mjs';

test.use({serviceWorkers:'block'});
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
test('connected-button native capture cancels deliberate drag',async({page,baseURL},info)=>{
  await verifyNativeCancellation(page,baseURL,info,'drag');
});
