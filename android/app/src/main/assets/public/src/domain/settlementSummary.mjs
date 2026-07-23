import { formatCurrency, normalizeCurrency } from "./currencies.mjs";

export function formatSettlementSummary({ eventName, participants, transfers, currency }) {
  const participantNames = buildParticipantNames(participants);
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const header = `סיכום התחשבנות - ${eventName}`;
  const eventCurrency = normalizeCurrency(currency);

  if (pendingTransfers.length === 0) {
    return `${header}\nהכל סגור. אין העברות פתוחות.`;
  }

  const lines = pendingTransfers.map((transfer) => {
    const from = participantNames.get(transfer.fromParticipantId) ?? "משתתף";
    const to = participantNames.get(transfer.toParticipantId) ?? "משתתף";
    return `${from} מעביר ל${to}: ${formatCurrency(transfer.amount, eventCurrency)}`;
  });

  return [header, ...lines].join("\n");
}

export function formatEventReport({ eventName, participants, expenses, transfers, currency }) {
  const participantNames = buildParticipantNames(participants);
  const eventCurrency = normalizeCurrency(currency);
  const expenseLines = expenses.length
    ? expenses.map((expense) => formatExpenseLine(expense, participantNames, eventCurrency))
    : ["אין הוצאות עדיין."];
  const pendingSummary = formatSettlementSummary({
    eventName,
    participants,
    transfers,
    currency: eventCurrency
  })
    .split("\n")
    .slice(1);

  return [
    `דוח אירוע - ${eventName}`,
    "הוצאות:",
    ...expenseLines,
    "התחשבנות פתוחה:",
    ...pendingSummary
  ].join("\n");
}

function formatExpenseLine(expense, participantNames, currency) {
  const payers = expense.payers
    .map(
      (payer) =>
        `${participantNames.get(payer.participantId) ?? "משתתף"} ${formatCurrency(payer.amount, currency)}`
    )
    .join(", ");
  const sharedBy = expense.sharedByParticipantIds
    .map((participantId) => participantNames.get(participantId) ?? "משתתף")
    .join(", ");

  return `- ${expense.name}: ${formatCurrency(expense.total, currency)} | שילמו: ${payers} | שותפים: ${sharedBy}`;
}

function buildParticipantNames(participants) {
  return new Map(
    participants.map((participant) => [participant.id, participant.displayName])
  );
}
