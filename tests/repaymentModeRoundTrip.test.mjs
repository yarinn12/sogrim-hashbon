import test from 'node:test';
import assert from 'node:assert/strict';
import {setEventDirectSettlementTransfers, setEventCoverImage, rollbackEventSettingChange, updateTransferStatus} from '../src/domain/appActions.mjs';
import {reconcileSettlementTransfers, settlementOptionsForEvent} from '../src/domain/settlement.mjs';
import {mergeSharedEventWriteState, mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';
import {repaymentModeFixture} from './helpers/repaymentModeFixture.mjs';

const config={storage:{account:{userId:'owner'}}};
const credentials={id:'synthetic-repayment-space',key:'synthetic_repayment_key_1234567890'};
const field='directSettlementTransfers';
const eventOf=state=>state.events[0];
const net=event=>{
  const balances=Object.fromEntries(event.participantIds.map(id=>[id,0]));
  for(const t of event.transfers){
    assert.ok(Number.isSafeInteger(t.amount)&&t.amount>0);
    assert.notEqual(t.fromParticipantId,t.toParticipantId);
    balances[t.fromParticipantId]-=t.amount;
    balances[t.toParticipantId]+=t.amount;
  }
  assert.equal(new Set(event.transfers.map(t=>t.id)).size,event.transfers.length);
  return balances;
};
function checkPlan(state,direct,total=10000,rounded=false){
  const event=eventOf(state);
  assert.equal(event[field],direct);
  const expectedTotal=rounded?Math.round(total/100)*100:total;
  assert.equal(event.transfers.length,expectedTotal===0?0:direct?4:2);
  assert.deepEqual(net(event),Object.fromEntries(event.participantIds.map((id,i)=>[id,i<2?expectedTotal:-expectedTotal])));
  const owner=event.participantIds[0],peer=event.participantIds[1];
  const debtors=event.participantIds.slice(2);
  if(direct&&expectedTotal>0)for(const debtor of debtors){
    assert.deepEqual(event.transfers.filter(t=>t.fromParticipantId===debtor).map(t=>t.toParticipantId).sort(),[owner,peer].sort());
  }
  const rendered=reconcileSettlementTransfers(state.participants,event.expenses,event.transfers,settlementOptionsForEvent(event));
  assert.deepEqual(rendered.issues,[]);
  assert.deepEqual(rendered.transfers,event.transfers);
}
function roundTrip(canonical,direct,total=10000,rounded=false){
  const stale=structuredClone(canonical);
  const chosen=setEventDirectSettlementTransfers(canonical,eventOf(canonical).id,direct);
  canonical=mergeSharedEventWriteState(canonical,chosen,config);
  checkPlan(canonical,direct,total,rounded);
  assert.deepEqual(eventOf(canonical).expenses,eventOf(stale).expenses);
  for(let replay=0;replay<3;replay++){
    const peer=mergeSharedEventIntoState(stale,canonical,credentials);
    checkPlan(peer,direct,total,rounded);
    canonical=mergeSharedEventWriteState(canonical,stale,config);
    checkPlan(canonical,direct,total,rounded);
    canonical=mergeSharedEventWriteState(canonical,peer,config);
    checkPlan(canonical,direct,total,rounded);
  }
  return canonical;
}

for(const currency of ['ILS','USD','EUR','KRW','PHP'])
for(const rounded of [false,true])
test(`both repayment directions survive stale replicas: ${currency}, rounding=${rounded}`,()=>{
  for(const total of [200,10000,10002,19998,2000000]){
    let state=repaymentModeFixture();
    Object.assign(eventOf(state),{currency,roundSettlementTransfers:rounded,transfers:[]});
    for(const expense of eventOf(state).expenses){expense.total=total;expense.payers[0].amount=total;}
    for(const direct of [false,true,false,true])state=roundTrip(state,direct,total,rounded);
  }
});

test('rapid opposite selections keep increasing revisions and latest routes under a frozen clock',t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-29T10:00:00Z')});
  let canonical=repaymentModeFixture();
  const history=[];
  for(let i=0;i<30;i++){
    history.push(structuredClone(canonical));
    const priorClock=Date.parse(eventOf(canonical).settingsFieldUpdatedAt[field]);
    const direct=i%2===1;
    canonical=roundTrip(canonical,direct);
    assert.ok(Date.parse(eventOf(canonical).settingsFieldUpdatedAt[field])>priorClock);
    for(const stale of history)checkPlan(mergeSharedEventWriteState(canonical,stale,config),direct);
  }
});

test('reselecting direct mode repairs an existing smart plan without touching expenses',()=>{
  let state=setEventDirectSettlementTransfers(repaymentModeFixture(),'repayment-mode',false);
  eventOf(state)[field]=true;
  state=roundTrip(state,true);
  checkPlan(state,true);
});

for(const initialDirect of [false,true])
for(const allPaid of [false,true])
test(`both directions retain ${allPaid?'all':'partial'} paid receipts from ${initialDirect?'direct':'smart'} mode`,()=>{
  let canonical=setEventDirectSettlementTransfers(repaymentModeFixture(),'repayment-mode',initialDirect);
  const event=eventOf(canonical);
  const paid=event.transfers.slice(0,allPaid?event.transfers.length:1).map(t=>({...t,status:'paid',
    statusUpdatedAt:'2026-09-29T11:00:00Z',markedPaidAt:'2026-09-29T11:00:00Z',
    markedPaidByParticipantId:event.participantIds[0]}));
  event.transfers=event.transfers.map(t=>paid.find(p=>p.id===t.id)??t);
  event.transferStatusUpdates=paid.map(t=>({id:t.id,status:'paid',updatedAt:t.statusUpdatedAt,
    markedAt:t.markedPaidAt,markedPaidByParticipantId:t.markedPaidByParticipantId}));
  const receipts=structuredClone(event.transferStatusUpdates),original=structuredClone(canonical);
  for(const direct of [!initialDirect,initialDirect,!initialDirect,initialDirect]){
    canonical=mergeSharedEventWriteState(canonical,setEventDirectSettlementTransfers(canonical,event.id,direct),config);
    const saved=eventOf(canonical);
    assert.equal(saved[field],direct);
    assert.deepEqual(saved.expenses,event.expenses);
    assert.deepEqual(saved.transferStatusUpdates,receipts);
    assert.deepEqual(saved.transfers.filter(t=>t.status==='paid'),paid);
    assert.deepEqual(net(saved),{'account-owner':10000,'account-peer':10000,'guest-c':-10000,'guest-d':-10000});
    if(allPaid)assert.equal(saved.transfers.filter(t=>t.status!=='paid').length,0);
    const staleWrite=mergeSharedEventWriteState(canonical,original,config);
    assert.deepEqual(eventOf(staleWrite).transfers,saved.transfers);
  }
});

for(const direct of [false,true])
test(`rejected ${direct?'direct':'smart'} choice restores the old method and ignores a later choice`,()=>{
  const original=setEventDirectSettlementTransfers(repaymentModeFixture(),'repayment-mode',!direct);
  const attempted=setEventDirectSettlementTransfers(original,'repayment-mode',direct);
  const restored=rollbackEventSettingChange(attempted,'repayment-mode',eventOf(original),eventOf(attempted),field);
  checkPlan(restored,!direct);
  assert.equal(eventOf(restored).settingsFieldUpdatedAt[field],eventOf(original).settingsFieldUpdatedAt[field]);
  const later=setEventDirectSettlementTransfers(attempted,'repayment-mode',direct);
  assert.deepEqual(rollbackEventSettingChange(later,'repayment-mode',eventOf(original),eventOf(attempted),field),later);
});

test('an unrelated newer cover image does not revive an older repayment plan',()=>{
  const original=repaymentModeFixture();
  let canonical=roundTrip(original,false);
  const renamed=setEventCoverImage(original,'repayment-mode','data:image/png;base64,syntheticOne');
  canonical=mergeSharedEventWriteState(canonical,renamed,config);
  checkPlan(canonical,false);
  assert.equal(eventOf(canonical).coverImage,'data:image/png;base64,syntheticOne');
  canonical=roundTrip(canonical,true);
  const newerName=setEventCoverImage(renamed,'repayment-mode','data:image/png;base64,syntheticTwo');
  canonical=mergeSharedEventWriteState(canonical,newerName,config);
  checkPlan(canonical,true);
  assert.equal(eventOf(canonical).coverImage,'data:image/png;base64,syntheticTwo');
});

test('empty and fully balanced events remain empty when choosing either method',()=>{
  for(const balanced of [false,true]){
    let state=repaymentModeFixture();
    const event=eventOf(state);
    event.expenses=balanced?event.participantIds.map((id,i)=>({id:`balanced-${i}`,name:'Balanced',
      total:400,payers:[{participantId:id,amount:400}],sharedByParticipantIds:event.participantIds,
      createdByParticipantId:event.participantIds[0],updatedAt:event.createdAt})):[];
    event.transfers=[];
    const expenses=structuredClone(event.expenses);
    for(const direct of [false,true,false,true]){
      state=mergeSharedEventWriteState(state,setEventDirectSettlementTransfers(state,event.id,direct),config);
      assert.equal(eventOf(state)[field],direct);
      assert.deepEqual(eventOf(state).transfers,[]);
      assert.deepEqual(eventOf(state).expenses,expenses);
    }
  }
});

for(const direct of [false,true])
for(const reversed of [false,true])
test(`a concurrent ${reversed?'reversal':'payment'} survives switching to ${direct?'direct':'smart'} mode`,()=>{
  let original=setEventDirectSettlementTransfers(repaymentModeFixture(),'repayment-mode',!direct);
  const transferId=eventOf(original).transfers[0].id;
  const update=(state,status,markedAt)=>updateTransferStatus(state,'repayment-mode',transferId,
    {status,markedAt,participantId:'account-owner'});
  if(reversed)original=update(original,'paid','2026-09-29T09:00:00.000Z');
  const selected=setEventDirectSettlementTransfers(original,'repayment-mode',direct);
  const paid=update(original,reversed?'pending':'paid','2026-09-29T09:01:00.000Z');
  for(const [remote,local] of [[selected,paid],[paid,selected]]){
    const saved=mergeSharedEventWriteState(remote,local,config);
    const event=eventOf(saved);
    assert.equal(event[field],direct);
    assert.deepEqual(event.expenses,eventOf(original).expenses);
    assert.deepEqual(event.transferStatusUpdates,eventOf(paid).transferStatusUpdates);
    assert.deepEqual(event.transfers.filter(t=>t.status==='paid'),eventOf(paid).transfers.filter(t=>t.status==='paid'));
    assert.deepEqual(net(event),{'account-owner':10000,'account-peer':10000,'guest-c':-10000,'guest-d':-10000});
    for(const stale of [original,selected,paid]){
      const replayed=mergeSharedEventWriteState(saved,stale,config);
      assert.deepEqual(eventOf(replayed).transfers,event.transfers);
      assert.deepEqual(eventOf(replayed).transferStatusUpdates,event.transferStatusUpdates);
    }
  }
});
