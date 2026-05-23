import { splitEvenly } from "./money.mjs";

export function calculateSettlement(participants, expenses) {
  const balances = Object.fromEntries(
    participants.map((participant) => [participant.id, 0])
  );

  for (const expense of expenses) {
    const shares = splitEvenly(expense.total, expense.sharedByParticipantIds);

    for (const [participantId, share] of Object.entries(shares)) {
      balances[participantId] = (balances[participantId] ?? 0) - share;
    }

    for (const payer of expense.payers) {
      balances[payer.participantId] =
        (balances[payer.participantId] ?? 0) + payer.amount;
    }
  }

  const debtors = Object.entries(balances)
    .filter(([, balance]) => balance < 0)
    .map(([participantId, balance]) => ({
      participantId,
      amount: Math.abs(balance)
    }));

  const creditors = Object.entries(balances)
    .filter(([, balance]) => balance > 0)
    .map(([participantId, balance]) => ({
      participantId,
      amount: balance
    }));

  const transfers = [];

  while (debtors.some((debtor) => debtor.amount > 0)) {
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const debtor = debtors.find((item) => item.amount > 0);
    const creditor = creditors.find((item) => item.amount > 0);

    if (!debtor || !creditor) break;

    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({
      id: `transfer-${debtor.participantId}-${creditor.participantId}-${amount}`,
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amount,
      status: "pending"
    });

    debtor.amount -= amount;
    creditor.amount -= amount;
  }

  return { balances, transfers };
}
