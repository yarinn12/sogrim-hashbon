import { splitEvenly } from "./money.mjs";

export function calculateSettlement(participants, expenses) {
  const knownParticipantIds = new Set(
    participants.map((participant) => participant.id).filter(Boolean)
  );
  const balances = Object.fromEntries(
    participants.map((participant) => [participant.id, 0])
  );
  const issues = [];

  for (const expense of expenses ?? []) {
    const normalizedExpense = normalizeExpenseForSettlement(expense, knownParticipantIds);
    if (normalizedExpense.issue) {
      issues.push({
        expenseId: expense?.id ?? "",
        reason: normalizedExpense.issue
      });
      continue;
    }

    const shares = splitEvenly(
      normalizedExpense.total,
      normalizedExpense.sharedByParticipantIds
    );

    for (const [participantId, share] of Object.entries(shares)) {
      balances[participantId] = (balances[participantId] ?? 0) - share;
    }

    for (const payer of normalizedExpense.payers) {
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

  return { balances, transfers, issues };
}

function normalizeExpenseForSettlement(expense, knownParticipantIds) {
  if (!expense || !isPositiveAgoraAmount(expense.total)) {
    return { issue: "invalid-total" };
  }

  const sharedByParticipantIds = uniqueIds(expense.sharedByParticipantIds ?? []);
  if (sharedByParticipantIds.length === 0) {
    return { issue: "missing-shared-participants" };
  }

  const payers = Array.isArray(expense.payers) ? expense.payers : [];
  if (payers.length === 0) {
    return { issue: "missing-payers" };
  }

  if (sharedByParticipantIds.some((participantId) => !knownParticipantIds.has(participantId))) {
    return { issue: "participant-not-in-event" };
  }

  if (payers.some((payer) => !knownParticipantIds.has(payer.participantId))) {
    return { issue: "participant-not-in-event" };
  }

  if (payers.some((payer) => !isPositiveAgoraAmount(payer.amount))) {
    return { issue: "invalid-payer-amount" };
  }

  const paidTotal = payers.reduce((sum, payer) => sum + payer.amount, 0);
  if (paidTotal !== expense.total) {
    return { issue: "payer-total-mismatch" };
  }

  return {
    total: expense.total,
    payers,
    sharedByParticipantIds
  };
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function isPositiveAgoraAmount(amount) {
  return Number.isInteger(amount) && amount > 0;
}
