import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSharedEventWriteState,mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';
import {staleSettlementFixture} from './helpers/staleSettlementFixture.mjs';

const ids={owner:'account-owner',peer:'account-peer',third:'account-third',fourth:'account-fourth'};
const config={storage:{account:{userId:'fourth'}}};
const credentials={id:'space-stable-settlement',key:'synthetic_stable_settlement_key_1234567890'};
for (const path of ['read','write']) {
  test(`canonical settlement keeps exact transfer IDs and amounts through stale ${path} and repeated refresh`,()=>{
    const {canonical,stale}=staleSettlementFixture(ids);
    const before=structuredClone({canonical,stale});
    const merge=local=>path==='read'?mergeSharedEventIntoState(local,canonical,credentials):mergeSharedEventWriteState(canonical,local,config);
    let result=merge(stale);
    for(let retry=0;retry<3;retry++) {
      assert.equal(result.events[0].expenses.length,4);
      assert.deepEqual(result.events[0].transfers,canonical.events[0].transfers);
      result=merge(JSON.parse(JSON.stringify(result)));
    }
    assert.deepEqual({canonical,stale},before,'inputs are immutable');
  });
}

test('settlement stability must retain a new offline payment confirmation',()=>{
  const {canonical}=staleSettlementFixture(ids),local=structuredClone(canonical);
  const transfer=local.events[0].transfers[2],at='2026-09-08T04:00:00.000Z';
  Object.assign(transfer,{status:'paid',markedPaidAt:at,statusUpdatedAt:at,markedPaidByParticipantId:ids.fourth});
  local.events[0].transferStatusUpdates=[{id:transfer.id,status:'paid',updatedAt:at,markedAt:at,markedPaidByParticipantId:ids.fourth}];
  const result=mergeSharedEventWriteState(canonical,local,config).events[0];
  assert.equal(result.transfers.find(t=>t.id===transfer.id).status,'paid');
  assert.deepEqual(result.transferStatusUpdates,local.events[0].transferStatusUpdates);
});

test('settlement stability must recompute after an offline expense edit',()=>{
  const {canonical}=staleSettlementFixture(ids),local=structuredClone(canonical);
  local.events[0].expenses[3].total=103500;
  local.events[0].expenses[3].payers[0].amount=103500;
  local.events[0].expenses[3].updatedAt='2026-09-08T04:00:00.000Z';
  const result=mergeSharedEventWriteState(canonical,local,config).events[0];
  assert.equal(result.expenses.find(e=>e.id==='new-day-trip').total,103500);
  assert.notDeepEqual(result.transfers,canonical.events[0].transfers);
  const balance=party=>result.transfers.reduce((sum,t)=>sum+(t.toParticipantId===party?t.amount:0)-(t.fromParticipantId===party?t.amount:0),0);
  assert.equal(balance(ids.owner),103900);
  assert.equal(balance(ids.third),-126800);
  assert.equal(balance(ids.fourth),-169600);
  assert.equal(balance(ids.peer),192500);
});

test('settlement stability must retain a newer offline payment reversal',()=>{
  const {canonical}=staleSettlementFixture(ids),local=structuredClone(canonical);
  const transfer=canonical.events[0].transfers[2],oldAt='2026-09-08T03:00:00.000Z',at='2026-09-08T04:00:00.000Z';
  Object.assign(transfer,{status:'paid',markedPaidAt:oldAt,statusUpdatedAt:oldAt,markedPaidByParticipantId:ids.fourth});
  canonical.events[0].transferStatusUpdates=[{id:transfer.id,status:'paid',updatedAt:oldAt,markedAt:oldAt,markedPaidByParticipantId:ids.fourth}];
  Object.assign(local.events[0].transfers[2],{status:'pending',statusUpdatedAt:at});
  local.events[0].transferStatusUpdates=[{id:transfer.id,status:'pending',updatedAt:at}];
  const result=mergeSharedEventWriteState(canonical,local,config).events[0];
  assert.equal(result.transfers.filter(t=>t.status==='paid').length,0);
  assert.deepEqual(result.transferStatusUpdates,local.events[0].transferStatusUpdates);
});

test('settlement stability must not discard a requested change in settlement method',()=>{
  const {canonical}=staleSettlementFixture(ids),local=structuredClone(canonical);
  local.events[0].directSettlementTransfers=false;
  local.events[0].settingsFieldUpdatedAt={directSettlementTransfers:'2026-09-08T04:00:00.000Z'};
  local.events[0].transfers=[];
  const result=mergeSharedEventWriteState(canonical,local,{storage:{account:{userId:'owner'}}}).events[0];
  assert.equal(result.directSettlementTransfers,false);
  assert.equal(result.settingsFieldUpdatedAt.directSettlementTransfers,local.events[0].settingsFieldUpdatedAt.directSettlementTransfers);
});
