import {calculateSettlement, reconcileSettlementTransfers, settlementOptionsForEvent} from './settlement.mjs';

const MODES = ['smart', 'direct'];
const modeOf = event => event.directSettlementTransfers === true ? 'direct' : 'smart';
const pending = transfers => (transfers ?? []).filter(transfer => transfer.status !== 'paid');
const paid = transfers => (transfers ?? []).filter(transfer => transfer.status === 'paid');
const clone = value => JSON.parse(JSON.stringify(value));
const routes = transfers => (transfers ?? []).map(transfer =>
  [transfer.fromParticipantId, transfer.toParticipantId, transfer.amount]
).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

// This is an exact, bounded financial key, not a clock or a lossy hash. Notes,
// names, array ordering and repeated mode selections cannot invalidate a plan.
// Actual balances, payment receipts, rounding or direct reimbursement routes can.
export function settlementPlanInputKey(event, participants, direct) {
  const orderedParticipants = [...participants].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const expenses = [...(event.expenses ?? [])].sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
  const ledger = calculateSettlement(orderedParticipants, expenses, {directTransfers: direct});
  if (ledger.issues.length) return null;
  return JSON.stringify([
    event.roundSettlementTransfers !== false,
    Object.entries(ledger.balances).sort(([a], [b]) => a.localeCompare(b)),
    paid(event.transfers).map(transfer => [transfer.id, transfer.fromParticipantId,
      transfer.toParticipantId, transfer.amount]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    direct ? routes(ledger.transfers) : []
  ]);
}

function validEntry(entry) {
  return entry && typeof entry.inputKey === 'string' && entry.inputKey.length <= 262144 &&
    Array.isArray(entry.transfers) && entry.transfers.length <= 2000 &&
    entry.transfers.every(transfer => transfer && transfer.status === 'pending' &&
      typeof transfer.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(transfer.id) &&
      Number.isSafeInteger(transfer.amount) && transfer.amount > 0);
}

function validatedPlan(event, participants, direct, transfers) {
  const options = {...settlementOptionsForEvent(event), directTransfers: direct};
  const previous = [...paid(event.transfers), ...pending(transfers)];
  const result = reconcileSettlementTransfers(participants, event.expenses, previous, options);
  return !result.issues.length &&
    JSON.stringify(pending(result.transfers)) === JSON.stringify(pending(transfers))
    ? result : null;
}

// Used after status reconciliation on reads and final writes as well as on a
// settings click. A stale client may publish a newer setting clock with a
// different valid plan; the first canonical plan still owns that financial key.
export function restoreRememberedSettlementPlan(event, participants, direct = modeOf(event) === 'direct') {
  const entry = event.settlementPlans?.[direct ? 'direct' : 'smart'];
  if (!validEntry(entry)) return null;
  const inputKey = settlementPlanInputKey(event, participants, direct);
  return inputKey && entry.inputKey === inputKey
    ? validatedPlan(event, participants, direct, entry.transfers) : null;
}

function rememberCurrentPlan(event, participants, plans) {
  const mode = modeOf(event), direct = mode === 'direct';
  const inputKey = settlementPlanInputKey(event, participants, direct);
  if (!inputKey || (plans[mode]?.inputKey === inputKey &&
    validatedPlan(event, participants, direct, plans[mode].transfers))) return;
  const valid = validatedPlan(event, participants, direct, event.transfers);
  if (!valid) return;
  const fresh = reconcileSettlementTransfers(participants, event.expenses, paid(event.transfers),
    {...settlementOptionsForEvent(event), directTransfers: direct, preservePendingRoutes: false});
  // Adopt legacy published plans while retaining the existing repair of a mode
  // label paired with the other method's rows. Smart's established stability
  // policy allows one extra route; direct must match direct reimbursements.
  const compatible = direct
    ? JSON.stringify(routes(pending(valid.transfers))) === JSON.stringify(routes(pending(fresh.transfers)))
    : pending(valid.transfers).length <= pending(fresh.transfers).length + 1;
  if (compatible) plans[mode] = {inputKey, transfers: clone(pending(valid.transfers))};
}

export function selectRememberedSettlementPlan(event, participants, direct) {
  const plans = Object.fromEntries(MODES.filter(mode => validEntry(event.settlementPlans?.[mode]))
    .map(mode => [mode, clone(event.settlementPlans[mode])]));
  rememberCurrentPlan(event, participants, plans);
  const mode = direct ? 'direct' : 'smart';
  const inputKey = settlementPlanInputKey(event, participants, direct);
  const restored = restoreRememberedSettlementPlan({...event, settlementPlans: plans}, participants, direct);
  const result = restored ?? reconcileSettlementTransfers(participants, event.expenses, paid(event.transfers),
    {...settlementOptionsForEvent(event), directTransfers: direct, preservePendingRoutes: false});
  if (result.issues.length || !inputKey) return result;
  plans[mode] = {inputKey, transfers: clone(pending(result.transfers))};
  return {...result, settlementPlans: plans};
}

// The authenticated canonical copy owns the first plan for a financial key.
// Older personal replicas must not erase the inactive method's remembered plan.
// A genuinely changed ledger may contribute a newer applicable plan instead.
export function mergeSettlementPlanMemory(canonical, replica, merged) {
  if (!Object.hasOwn(canonical, 'settlementPlans') && !Object.hasOwn(replica, 'settlementPlans')) return {};
  const participants = (merged.participantIds ?? []).map(id => ({id}));
  const plans = {};
  for (const mode of MODES) {
    const remote = canonical.settlementPlans?.[mode], local = replica.settlementPlans?.[mode];
    const inputKey = settlementPlanInputKey(merged, participants, mode === 'direct');
    const candidates = [remote, local].filter(validEntry);
    const entry = candidates.find(candidate => candidate.inputKey === inputKey) ?? candidates[0];
    if (entry) plans[mode] = clone(entry);
  }
  return {settlementPlans: plans};
}
