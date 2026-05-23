import { formatMoney } from "./money.mjs";

export function formatSettlementSummary({ eventName, participants, transfers }) {
  const participantNames = buildParticipantNames(participants);
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const header = `סיכום התחשבנות - ${eventName}`;

  if (pendingTransfers.length === 0) {
    return `${header}\nהכל סגור. אין העברות פתוחות.`;
  }

  const lines = pendingTransfers.map((transfer) => {
    const from = participantNames.get(transfer.fromParticipantId) ?? "משתתף";
    const to = participantNames.get(transfer.toParticipantId) ?? "משתתף";
    return `${from} מעביר ל${to}: ₪${formatMoney(transfer.amount)}`;
  });

  return [header, ...lines].join("\n");
}

export function formatEventReport({ eventName, participants, expenses, transfers }) {
  const participantNames = buildParticipantNames(participants);
  const expenseLines = expenses.length
    ? expenses.map((expense) => formatExpenseLine(expense, participantNames))
    : ["אין הוצאות עדיין."];
  const pendingSummary = formatSettlementSummary({
    eventName,
    participants,
    transfers
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

function formatExpenseLine(expense, participantNames) {
  const payers = expense.payers
    .map(
      (payer) =>
        `${participantNames.get(payer.participantId) ?? "משתתף"} ₪${formatMoney(payer.amount)}`
    )
    .join(", ");
  const sharedBy = expense.sharedByParticipantIds
    .map((participantId) => participantNames.get(participantId) ?? "משתתף")
    .join(", ");

  return `- ${expense.name}: ₪${formatMoney(expense.total)} | שילמו: ${payers} | שותפים: ${sharedBy}`;
}

function buildParticipantNames(participants) {
  return new Map(
    participants.map((participant) => [participant.id, participant.displayName])
  );
}
