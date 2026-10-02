import test from 'node:test';
import assert from 'node:assert/strict';
import {setEventDirectSettlementTransfers, rollbackEventSettingChange, updateTransferStatus} from '../src/domain/appActions.mjs';
import {reconcileSettlementTransfers, settlementOptionsForEvent} from '../src/domain/settlement.mjs';
import {mergeSharedEventWriteState, mergeSharedEventIntoState} from '../src/data/sharedEventStore.mjs';
import {stableRepaymentFixture} from './helpers/repaymentModeFixture.mjs';

const config = {storage:{account:{userId:'owner'}}};
const credentials = {id:'synthetic-stable-space',key:'synthetic_stability_key_1234567890'};
const eventOf = state => state.events[0];
const choose = (state, direct) => setEventDirectSettlementTransfers(state, eventOf(state).id, direct);

test('reselecting smart keeps the first published 998 route, amounts and IDs', () => {
  const initial = stableRepaymentFixture();
  const selected = choose(initial, false);
  assert.deepEqual(eventOf(selected).transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(selected).expenses, eventOf(initial).expenses);
});

test('a rejected mode change restores the exact legacy plan including opaque IDs', () => {
  const initial = stableRepaymentFixture(), attempted = choose(initial, true);
  const restored = rollbackEventSettingChange(attempted, eventOf(initial).id,
    eventOf(initial), eventOf(attempted), 'directSettlementTransfers');
  assert.deepEqual(eventOf(restored).transfers, eventOf(initial).transfers);
  assert.equal(eventOf(restored).directSettlementTransfers, false);
});

test('changed expenses invalidate remembered amounts instead of reviving an obsolete debt', () => {
  let state = choose(stableRepaymentFixture(), true);
  const expense = eventOf(state).expenses[0];
  expense.total += 10000;
  expense.payers[0].amount += 10000;
  state = choose(state, false);
  const reconciled = reconcileSettlementTransfers(state.participants, eventOf(state).expenses,
    eventOf(state).transfers, settlementOptionsForEvent(eventOf(state)));
  assert.deepEqual(reconciled.issues, []);
  assert.deepEqual(reconciled.outstandingBalances,
    {'account-owner':-256200,'account-peer':256200,'guest-c':146400,'guest-d':-146400});
  assert.deepEqual(reconciled.transfers, eventOf(state).transfers);
});

test('a real payment while another method is selected is retained and invalidates the old pending plan', () => {
  let state = choose(stableRepaymentFixture(), true);
  const transfer = eventOf(state).transfers.find(t => t.fromParticipantId === 'account-owner' &&
    t.toParticipantId === 'account-peer');
  state = updateTransferStatus(state, eventOf(state).id, transfer.id,
    {status:'paid', markedAt:new Date().toISOString(), participantId:'account-owner'});
  const receipt = structuredClone(eventOf(state).transfers.find(t => t.id === transfer.id));
  const updates = structuredClone(eventOf(state).transferStatusUpdates);
  for (const direct of [false, true, false]) {
    state = choose(state, direct);
    assert.deepEqual(eventOf(state).transfers.filter(t => t.status === 'paid'), [receipt]);
    assert.deepEqual(eventOf(state).transferStatusUpdates, updates);
    const reconciled = reconcileSettlementTransfers(state.participants, eventOf(state).expenses,
      eventOf(state).transfers, settlementOptionsForEvent(eventOf(state)));
    assert.deepEqual(reconciled.outstandingBalances,
      {'account-owner':-146400,'account-peer':146400,'guest-c':146400,'guest-d':-146400});
    assert.deepEqual(reconciled.transfers, eventOf(state).transfers);
  }
});

test('malformed remembered amounts and fake paid receipts are never trusted', () => {
  for (const corrupt of [entry => {entry.transfers[0].amount += 100;},
    entry => {entry.transfers[0].status = 'paid';},
    entry => {entry.transfers[0].fromParticipantId = 'unknown';}]) {
    let state = choose(stableRepaymentFixture(), true);
    corrupt(eventOf(state).settlementPlans.smart);
    state = choose(state, false);
    assert.deepEqual(eventOf(state).transfers.filter(t => t.status === 'paid'), []);
    const result = reconcileSettlementTransfers(state.participants, eventOf(state).expenses,
      eventOf(state).transfers, settlementOptionsForEvent(eventOf(state)));
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.outstandingBalances,
      {'account-owner':-246200,'account-peer':246200,'guest-c':146400,'guest-d':-146400});
    assert.deepEqual(result.transfers, eventOf(state).transfers);
  }
});

test('smart -> direct -> smart restores the exact first plan rather than changing 998 to 2462', () => {
  const initial = stableRepaymentFixture();
  const direct = choose(initial, true);
  const returned = choose(direct, false);
  assert.deepEqual(eventOf(returned).transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(returned).expenses, eventOf(initial).expenses);
  assert.deepEqual(eventOf(choose(returned, true)).transfers, eventOf(direct).transfers);
});

test('a newer stale replica cannot replace the canonical first smart plan with another valid plan', () => {
  const initial = stableRepaymentFixture();
  const canonical = mergeSharedEventWriteState(initial, choose(initial, true), config);
  const stale = structuredClone(initial);
  const fresh = reconcileSettlementTransfers(stale.participants, eventOf(stale).expenses, [],
    {...settlementOptionsForEvent(eventOf(stale)), preservePendingRoutes:false});
  eventOf(stale).transfers = fresh.transfers;
  const selected = choose(stale, false);
  const saved = mergeSharedEventWriteState(canonical, selected, config);
  assert.deepEqual(eventOf(saved).transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(saved).settlementPlans.smart.transfers, eventOf(initial).transfers);
  const hydrated = mergeSharedEventIntoState(selected, saved, credentials);
  assert.deepEqual(eventOf(hydrated).transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(hydrated).settlementPlans.smart.transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(choose(choose(hydrated, true), false)).transfers, eventOf(initial).transfers);
});

test('tied whole-currency rounding keeps the first plans when participant order changes', () => {
  const initial = stableRepaymentFixture();
  eventOf(initial).roundSettlementTransfers = true;
  eventOf(initial).expenses[0].total += 50;
  eventOf(initial).expenses[0].payers[0].amount += 50;
  let state = choose(initial, true);
  const directPlan = structuredClone(eventOf(state).transfers);
  state.participants.reverse();
  eventOf(state).participantIds.reverse();
  state = choose(state, false);
  assert.deepEqual(eventOf(state).transfers, eventOf(initial).transfers);
  assert.deepEqual(eventOf(choose(state, true)).transfers, directPlan);
  const saved = mergeSharedEventWriteState(initial, state, config);
  assert.deepEqual(eventOf(saved).transfers, eventOf(initial).transfers);
});

test('each first plan survives 30 switches, reordered replicas, final writes and JSON reloads', () => {
  const initial = stableRepaymentFixture(), smartPlan = structuredClone(eventOf(initial).transfers);
  let canonical = mergeSharedEventWriteState(initial, choose(initial, true), config);
  const directPlan = structuredClone(eventOf(canonical).transfers);
  const stale = structuredClone(initial);
  stale.participants.reverse();
  stale.events[0].participantIds.reverse();
  stale.events[0].expenses.reverse();
  for (let i = 0; i < 30; i++) {
    const direct = i % 2 === 1, expected = direct ? directPlan : smartPlan;
    canonical = mergeSharedEventWriteState(canonical, choose(canonical, direct), config);
    canonical = mergeSharedEventWriteState(canonical, stale, config);
    canonical = JSON.parse(JSON.stringify(canonical));
    assert.deepEqual(eventOf(canonical).transfers, expected, `switch ${i}`);
    const hydrated = mergeSharedEventIntoState(stale, canonical, credentials);
    assert.deepEqual(eventOf(hydrated).transfers, expected, `hydration ${i}`);
    const rendered = reconcileSettlementTransfers(canonical.participants, eventOf(canonical).expenses,
      eventOf(canonical).transfers, settlementOptionsForEvent(eventOf(canonical)));
    assert.deepEqual(rendered.transfers, expected, `render ${i}`);
  }
});
