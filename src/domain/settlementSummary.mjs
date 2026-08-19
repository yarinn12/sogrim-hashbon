import {
  currencyConfig,
  formatCurrency,
  normalizeCurrency
} from "./currencies.mjs";
import { participantEventDisplayName } from "./participantIdentity.mjs";

const LEFT_TO_RIGHT_ISOLATE = "\u2066";
const RIGHT_TO_LEFT_ISOLATE = "\u2067";
const POP_DIRECTIONAL_ISOLATE = "\u2069";
const SETTLEMENT_HEADING = "*העברות פתוחות*";

export function formatSettlementSummary({
  eventName,
  participants,
  transfers,
  currency,
  participantAliases = {},
  directSettlementTransfers = false
}) {
  const participantNames = buildParticipantNames(participants, participantAliases, {
    preferFullNameAliases: true
  });
  const pendingTransfers = transfers.filter((transfer) => transfer.status !== "paid");
  const header = ["*סוגרים חשבון*", `אירוע: ${isolateText(eventName)}`];
  const eventCurrency = normalizeCurrency(currency);

  if (pendingTransfers.length === 0) {
    return [...header, "", "הכול סגור. אין העברות פתוחות."].join("\n");
  }

  const transfersByRecipient = new Map();
  for (const transfer of pendingTransfers) {
    const recipientTransfers = transfersByRecipient.get(transfer.toParticipantId) ?? [];
    recipientTransfers.push(transfer);
    transfersByRecipient.set(transfer.toParticipantId, recipientTransfers);
  }

  const lines = [];
  for (const [recipientId, recipientTransfers] of transfersByRecipient) {
    const recipient = participantNames.get(recipientId) ?? "משתתף";
    if (lines.length) lines.push("");
    lines.push(`*אל ${isolateText(recipient)}*`);
    for (const transfer of recipientTransfers) {
      const sender = participantNames.get(transfer.fromParticipantId) ?? "משתתף";
      lines.push(
        `• ${isolateText(sender)} — ${isolateText(formatMessageCurrency(transfer.amount, eventCurrency))}`
      );
    }
  }

  const methodExplanation = directSettlementTransfers
    ? "ההחזרים הם ישירות למי שמימן יותר."
    : "הסכומים כוללים קיזוז בין כל הוצאות הקבוצה. לכן המקבל לא תמיד מי ששילם ישירות.";

  return [
    ...header,
    "",
    SETTLEMENT_HEADING,
    methodExplanation,
    "",
    ...lines
  ].join("\n");
}

export function formatEventReport({
  eventName,
  participants,
  expenses,
  transfers,
  currency,
  participantAliases = {},
  directSettlementTransfers = false
}) {
  const participantNames = buildParticipantNames(participants, participantAliases);
  const eventCurrency = normalizeCurrency(currency);
  const expenseLines = expenses.length
    ? expenses.map((expense) => formatExpenseLine(expense, participantNames, eventCurrency))
    : ["אין הוצאות עדיין."];
  const settlementLines = formatSettlementSummary({
    eventName,
    participants,
    transfers,
    currency: eventCurrency,
    participantAliases,
    directSettlementTransfers
  }).split("\n");
  const transfersHeadingIndex = settlementLines.indexOf(SETTLEMENT_HEADING);
  const pendingSummary = transfersHeadingIndex >= 0
    ? settlementLines.slice(transfersHeadingIndex + 1).filter((line, index) => index > 0 || line)
    : settlementLines.slice(3);

  return [
    `דוח אירוע - ${eventName}`,
    "הוצאות:",
    ...expenseLines,
    "התחשבנות פתוחה:",
    ...pendingSummary
  ].join("\n");
}

function formatMessageCurrency(amount, currency) {
  const config = currencyConfig(currency);
  const formatted = formatCurrency(amount, currency);
  const number = formatted.replace(config.symbol, "").trim();
  return `${number} ${config.symbol}`;
}

function isolateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const isolate = /[א-ת]/.test(text)
    ? RIGHT_TO_LEFT_ISOLATE
    : LEFT_TO_RIGHT_ISOLATE;
  return `${isolate}${text}${POP_DIRECTIONAL_ISOLATE}`;
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

function buildParticipantNames(
  participants,
  participantAliases,
  { preferFullNameAliases = false } = {}
) {
  const event = {
    participantIds: participants.map((participant) => participant.id),
    participantAliases
  };
  return new Map(
    participants.map((participant) => [
      participant.id,
      preferredParticipantName(
        participantAliases?.[participant.id],
        participant.displayName,
        participantEventDisplayName(participants, event, participant.id),
        preferFullNameAliases
      )
    ])
  );
}

function preferredParticipantName(alias, baseName, fallbackName, preferFullNameAliases) {
  if (!preferFullNameAliases) return fallbackName;

  const normalizedAlias = String(alias ?? "").trim().replace(/\s+/g, " ");
  const aliasLooksLikeFullName =
    normalizedAlias.split(" ").filter(Boolean).length >= 2;
  const aliasUsesHebrew = /[א-ת]/.test(normalizedAlias);
  const fallbackUsesHebrew = /[א-ת]/.test(baseName);
  if (aliasLooksLikeFullName && aliasUsesHebrew !== fallbackUsesHebrew) {
    return normalizedAlias;
  }

  return fallbackName;
}
