import { sumMoneyAmounts } from "./money.mjs";

export function buildEventInsights({ event, participants, settlement }) {
  const expenses = event?.expenses ?? [];
  const savedTransfers = event?.transfers ?? [];
  const calculatedTransfers = settlement?.transfers ?? [];
  const transfers = savedTransfers.length ? savedTransfers : calculatedTransfers;
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const paidTransfers = transfers.filter((transfer) => transfer.status === "paid");
  const expenseTotal = safeMoneyTotal(expenses.map((expense) => expense?.total));
  const pendingTransferTotal = safeMoneyTotal(
    pendingTransfers.map((transfer) => transfer?.amount)
  );
  const hasUnsafeMoney = !expenseTotal.safe || !pendingTransferTotal.safe;
  const invalidExpenseCount = settlement?.issues?.length ?? 0;

  return {
    expenseCount: expenses.length,
    participantCount: participants?.length ?? 0,
    totalExpenses: expenseTotal.total,
    transferCount: transfers.length,
    pendingTransferCount: pendingTransfers.length,
    pendingTotal: pendingTransferTotal.total,
    paidTransferCount: paidTransfers.length,
    invalidExpenseCount,
    status: eventInsightStatus({
      isClosed: Boolean(event?.closedAt || event?.locked),
      expenseCount: expenses.length,
      invalidExpenseCount,
      hasUnsafeMoney,
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
  pendingTransferCount,
  hasUnsafeMoney
}) {
  if (isClosed) return "closed";
  if (hasUnsafeMoney) return "needs-review";
  if (invalidExpenseCount > 0) return "needs-review";
  if (expenseCount === 0) return "empty";
  if (savedTransferCount > 0 && pendingTransferCount > 0) return "pending-payments";
  if (savedTransferCount > 0 && pendingTransferCount === 0) return "settled";
  if (calculatedTransferCount > 0) return "ready-to-settle";
  return "balanced";
}

function safeMoneyTotal(amounts) {
  try {
    return {
      total: sumMoneyAmounts(
        (amounts ?? []).map((amount) =>
          Number.isSafeInteger(amount) && amount >= 0 ? amount : 0
        )
      ),
      safe: (amounts ?? []).every(
        (amount) => Number.isSafeInteger(amount) && amount >= 0
      )
    };
  } catch {
    return { total: 0, safe: false };
  }
}
