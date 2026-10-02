// Two funders and two debtors: direct reimbursement needs four payments;
// settling the same net balances needs just two. All amounts are in agorot.
export function repaymentModeFixture(ids = ['account-owner', 'account-peer', 'guest-c', 'guest-d']) {
  const [owner, peer, third, fourth] = ids;
  const at = '2026-09-01T00:00:00.000Z';
  return {
    currentParticipantId: owner, groups: [],
    participants: ids.map(id => ({id, displayName: id, kind: id.startsWith('account-') ? 'user' : 'guest'})),
    events: [{id: 'repayment-mode', name: 'Synthetic repayment test', currency: 'ILS',
      participantIds: ids, adminIds: [owner], createdByParticipantId: owner,
      createdAt: at, settingsUpdatedAt: at,
      settingsFieldUpdatedAt: {directSettlementTransfers: at},
      directSettlementTransfers: true, roundSettlementTransfers: false,
      notes: [], transferStatusUpdates: [],
      expenses: [owner, peer].map((payer, i) => ({id: `expense-${i}`, name: `Expense ${i}`,
        total: 10000, payers: [{participantId: payer, amount: 10000}],
        sharedByParticipantIds: [third, fourth], createdByParticipantId: owner, updatedAt: at})),
      transfers: [third, fourth].flatMap(from => [owner, peer].map(to => ({
        id: `direct-${from}-${to}`, fromParticipantId: from, toParticipantId: to,
        amount: 5000, status: 'pending'
      })))
    }]
  };
}

// A previously published, valid smart plan need not be the plan a fresh greedy
// calculation chooses. Mirrors the reported 998 -> 2462 route change with
// synthetic identities and preserves the same net balances in either plan.
export function stableRepaymentFixture(ids = ['account-owner', 'account-peer', 'guest-c', 'guest-d']) {
  const [owner, peer, third, fourth] = ids;
  const state = repaymentModeFixture(ids), event = state.events[0];
  event.directSettlementTransfers = false;
  const routes = [[owner, peer, 99800], [owner, third, 146400], [fourth, peer, 146400]];
  event.expenses = routes.map(([from, to, amount], i) => ({
    id: `stable-expense-${i}`, name: `Synthetic expense ${i}`, total: amount,
    payers: [{participantId: to, amount}], sharedByParticipantIds: [from],
    createdByParticipantId: owner, updatedAt: event.createdAt
  }));
  event.transfers = routes.map(([fromParticipantId, toParticipantId, amount], i) => ({
    id: `published-smart-${i}`, fromParticipantId, toParticipantId, amount, status: 'pending'
  }));
  return state;
}

// A completed payment followed by an expense in the opposite direction. The
// outstanding reverse route must be regenerated during plan validation, exposing
// comparisons that incorrectly depend on the JSON object's property order.
export function reversePaymentFixture(ids = ['account-owner', 'account-peer', 'guest-c', 'guest-d']) {
  const [owner, peer] = ids;
  const state = repaymentModeFixture(ids), event = state.events[0];
  event.expenses = [{id: 'reverse-expense', name: 'Synthetic later expense', total: 20000,
    payers: [{participantId: owner, amount: 20000}], sharedByParticipantIds: [peer],
    createdByParticipantId: owner, updatedAt: event.createdAt}];
  event.transfers = [{id: 'completed-payment', fromParticipantId: owner, toParticipantId: peer,
    amount: 99800, status: 'paid', markedPaidAt: event.createdAt,
    statusUpdatedAt: event.createdAt, markedPaidByParticipantId: owner}];
  event.transferStatusUpdates = [{id: 'completed-payment', status: 'paid',
    updatedAt: event.createdAt, markedAt: event.createdAt, markedPaidByParticipantId: owner}];
  return state;
}

// Deliberately vary wire-object ordering; arrays and values remain unchanged.
// Real PostgreSQL JSONB serialization is covered in databaseIntegrity.test.mjs.
export function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseObjectKeys(value[key])]));
}
