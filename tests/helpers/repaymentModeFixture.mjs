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
