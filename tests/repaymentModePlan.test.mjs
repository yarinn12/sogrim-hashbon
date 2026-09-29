import test from 'node:test';
import assert from 'node:assert/strict';
import {setEventDirectSettlementTransfers, rollbackEventSettingChange} from '../src/domain/appActions.mjs';
import {reconcileSettlementTransfers, settlementOptionsForEvent} from '../src/domain/settlement.mjs';
import {mergeSharedEventWriteState, mergeSharedEventIntoState, saveSharedEventState} from '../src/data/sharedEventStore.mjs';
import {repaymentModeFixture} from './helpers/repaymentModeFixture.mjs';

const config = {storage:{account:{userId:'owner'}}};
const credentials = {id:'synthetic-repayment-space',key:'synthetic_repayment_key_1234567890'};
function assertPlan(state, direct) {
  const event = state.events[0];
  assert.equal(event.directSettlementTransfers, direct);
  assert.equal(event.transfers.length, direct ? 4 : 2, 'selected mode must change the actual payment plan');
  const [owner, peer, third, fourth] = event.participantIds;
  const balances = Object.fromEntries(event.participantIds.map(id => [id,0]));
  for (const t of event.transfers) {
    balances[t.fromParticipantId] -= t.amount;
    balances[t.toParticipantId] += t.amount;
    assert.equal(t.status, 'pending');
    assert.equal(t.amount, direct ? 5000 : 10000);
  }
  assert.deepEqual(balances, {[owner]:10000,[peer]:10000,[third]:-10000,[fourth]:-10000});
  assert.deepEqual(reconcileSettlementTransfers(state.participants,event.expenses,event.transfers,
    settlementOptionsForEvent(event)).transfers,event.transfers,'rendering must keep the new plan');
}

for (const reselect of [false,true]) test(`smart repayment rebuilds stored direct routes (reselect=${reselect})`, () => {
  const original = repaymentModeFixture();
  if (reselect) original.events[0].directSettlementTransfers = false;
  const before = structuredClone(original);
  const smart = setEventDirectSettlementTransfers(original, 'repayment-mode', false);
  assertPlan(smart, false);
  assert.deepEqual(original,before);
  assertPlan(setEventDirectSettlementTransfers(smart,'repayment-mode',true),true);
});

for (const reselect of [false,true]) test(`repayment choice survives final write, stale reads and retries (reselect=${reselect})`, () => {
  let canonical = repaymentModeFixture();
  if (reselect) canonical.events[0].directSettlementTransfers = false;
  const stale = structuredClone(canonical);
  const chosen = setEventDirectSettlementTransfers(canonical,'repayment-mode',false);
  canonical = mergeSharedEventWriteState(canonical,chosen,config);
  assertPlan(canonical,false);
  for (let retry = 0; retry < 3; retry++) {
    assertPlan(mergeSharedEventIntoState(stale,canonical,credentials),false);
    canonical = mergeSharedEventWriteState(canonical,stale,config);
    assertPlan(canonical,false);
  }
  const direct = setEventDirectSettlementTransfers(canonical,'repayment-mode',true);
  assertPlan(mergeSharedEventWriteState(canonical,direct,config),true);
});

test('mode change keeps paid receipts and recalculates only the remaining balance', () => {
  const original = repaymentModeFixture(), event = original.events[0];
  const paid = {...event.transfers[0], status:'paid',markedPaidAt:'2026-09-02T00:00:00.000Z',
    statusUpdatedAt:'2026-09-02T00:00:00.000Z', markedPaidByParticipantId:event.participantIds[0]};
  event.transfers[0] = paid;
  event.transferStatusUpdates = [{id:paid.id,status:'paid',updatedAt:paid.statusUpdatedAt,
    markedAt:paid.markedPaidAt,markedPaidByParticipantId:paid.markedPaidByParticipantId}];
  const smart = setEventDirectSettlementTransfers(original,event.id,false);
  const saved = mergeSharedEventWriteState(original,smart,config).events[0];
  assert.deepEqual(saved.transfers.filter(t=>t.status==='paid'),[paid]);
  assert.deepEqual(saved.transferStatusUpdates,event.transferStatusUpdates);
  assert.equal(saved.transfers.filter(t=>t.status==='pending').reduce((sum,t)=>sum+t.amount,0),15000);
});

test('a rejected repayment setting restores its previous payment plan', () => {
  const original = repaymentModeFixture();
  const attempted = setEventDirectSettlementTransfers(original,'repayment-mode',false);
  assertPlan(rollbackEventSettingChange(attempted,'repayment-mode',original.events[0],
    attempted.events[0],'directSettlementTransfers'),true);
});

test('repayment save retries a concurrent expense and waits for the final payload acknowledgement', async () => {
  const remote = repaymentModeFixture();
  const local = setEventDirectSettlementTransfers(remote,'repayment-mode',false);
  Object.assign(local.events[0],{sharedSpaceId:credentials.id,sharedSpaceKey:credentials.key});
  const raced = structuredClone(remote);
  // A peer adds another identical expense while the mode change is being saved.
  raced.events[0].expenses.push({...raced.events[0].expenses[0],id:'concurrent-expense',updatedAt:new Date().toISOString()});
  const writes = [];
  let readCount = 0, releaseAck, resolved = false;
  const ack = new Promise(resolve=>{releaseAck=resolve;});
  const response = body => ({ok:true,status:200,json:async()=>body});
  const saving = saveSharedEventState({storage:{mode:'supabase',url:'https://fixture.supabase.co',
    anonKey:'synthetic',table:'app_snapshots',account:{userId:'owner',accessToken:'synthetic'}}},
    local,'repayment-mode',async(url,options={})=>{
      if(url.includes('/rpc/join_shared_event')) return response({status:'active'});
      if(url.includes('/rpc/update_shared_event_snapshot')) {
        writes.push(JSON.parse(options.body).p_state);
        if(writes.length===1) return response({status:'conflict'});
        await ack;
        return response({status:'updated',updatedAt:'2026-09-29T12:00:01.000Z'});
      }
      readCount++;
      return response([{state:readCount===1?remote:raced,updated_at:readCount===1?'2026-09-29T12:00:00.000Z':'2026-09-29T12:00:00.500Z'}]);
    }).then(value=>{resolved=true;return value;});
  try {
    for(let i=0;i<100 && writes.length<2;i++) await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(writes.length,2);
    assert.equal(resolved,false,'success must wait for the server acknowledgement');
    assertPlan(writes[0],false);
    assert.equal(writes[1].events[0].directSettlementTransfers,false);
    assert.equal(writes[1].events[0].expenses.length,3);
    const event=writes[1].events[0], balances=Object.fromEntries(event.participantIds.map(id=>[id,0]));
    for(const t of event.transfers){balances[t.fromParticipantId]-=t.amount;balances[t.toParticipantId]+=t.amount;}
    assert.deepEqual(balances,{'account-owner':20000,'account-peer':10000,'guest-c':-15000,'guest-d':-15000});
    assert.equal(event.transfers.length,3);
  } finally {releaseAck();}
  const saved=await saving;
  assert.deepEqual(saved.events[0].transfers,writes[1].events[0].transfers);
  assert.equal(saved.events[0].expenses.length,3);
});
