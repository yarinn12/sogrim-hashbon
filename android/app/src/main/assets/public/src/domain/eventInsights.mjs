export function buildEventInsights({ event, participants, settlement }) {
  const expenses = event?.expenses ?? [];
  const savedTransfers = event?.transfers ?? [];
  const calculatedTransfers = settlement?.transfers ?? [];
  const transfers = savedTransfers.length ? savedTransfers : calculatedTransfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const paidTransfers = transfers.filter((transfer) => transfer.status === "paid");
  const invalidExpenseCount = settlement?.issues?.length ?? 0;

  return {
    expenseCount: expenses.length,
    participantCount: participants?.length ?? 0,
    totalExpenses: expenses.reduce((sum, expense) => sum + (expense.total ?? 0), 0),
    transferCount: transfers.length,
    pendingTransferCount: pendingTransfers.length,
    pendingTotal: pendingTransfers.reduce((sum, transfer) => sum + (transfer.amount ?? 0), 0),
    paidTransferCount: paidTransfers.length,
    invalidExpenseCount,
    status: eventInsightStatus({
      isClosed: Boolean(event?.closedAt || event?.locked),
      expenseCount: expenses.length,
      invalidExpenseCount,
      savedTransferCount: savedTransfers.length,
      calculatedTransferCount: calculatedTransfers.length,
      pendingTransferCount: pendingTransfers.length
    })
  };
}

function eventInsightStatus({
  isClosed,
  expenseCount,
  invalidExpenseCount,
  savedTransferCount,
  calculatedTransferCount,
  pendingTransferCount
}) {
  if (isClosed) return "closed";
  if (invalidExpenseCount > 0) return "needs-review";
  if (expenseCount === 0) return "empty";
  if (savedTransferCount > 0 && pendingTransferCount > 0) return "pending-payments";
  if (savedTransferCount > 0 && pendingTransferCount === 0) return "settled";
  if (calculatedTransferCount > 0) return "ready-to-settle";
  return "balanced";
}
