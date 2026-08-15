import { formatMoney, parseMoneyInput } from "./money.mjs";

export function createPayerDraft(participantId, amount = "", options = {}) {
  return {
    participantId,
    amount,
    amountTouched: options.amountTouched ?? false,
    autoAmount: options.autoAmount ?? true
  };
}

export function markPayerAmountEdited(payer, amount) {
  return {
    ...payer,
    amount,
    amountTouched: true,
    autoAmount: false
  };
}

export function balancePayerAmounts(totalInput, payers, preferredIndex = payers.length - 1) {
  if (!Array.isArray(payers) || payers.length === 0) return payers;

  const total = readDraftAmount(totalInput);
  const targetIndex = findAutoPayerIndex(payers, preferredIndex);
  if (total <= 0 || targetIndex === -1) return payers;

  const otherTotal = payers.reduce((sum, payer, index) => {
    if (index === targetIndex) return sum;
    return sum + readDraftAmount(payer.amount);
  }, 0);
  const remaining = Math.max(total - otherTotal, 0);

  return payers.map((payer, index) =>
    index === targetIndex
      ? {
          ...payer,
          amount: formatDraftAmount(remaining),
          amountTouched: false,
          autoAmount: true
        }
      : payer
  );
}

export function assignPayerDifference(
  totalInput,
  payers,
  payerIndex,
  { automatic = false } = {}
) {
  if (!Array.isArray(payers) || !payers[payerIndex]) return payers;

  const summary = summarizePayerDraft(totalInput, payers);
  if (!summary.valid || summary.balanced) return payers;

  const currentAmount = readDraftAmount(payers[payerIndex].amount);
  const nextAmount = summary.remaining > 0
    ? currentAmount + summary.remaining
    : Math.max(0, currentAmount - summary.overpaid);

  return payers.map((payer, index) =>
    index === payerIndex
      ? {
          ...payer,
          amount: formatDraftAmount(nextAmount),
          amountTouched: !automatic,
          autoAmount: automatic
        }
      : payer
  );
}

export function findAutoPayerIndex(payers, preferredIndex = payers.length - 1) {
  if (!Array.isArray(payers) || payers.length === 0) return -1;

  if (payers.length === 1 && canAutoFillPayer(payers[0])) return 0;

  if (Number.isInteger(preferredIndex) && canAutoFillPayer(payers[preferredIndex])) {
    return preferredIndex;
  }

  for (let index = payers.length - 1; index >= 0; index -= 1) {
    if (canAutoFillPayer(payers[index])) return index;
  }

  return -1;
}

export function canAutoFillPayer(payer) {
  return Boolean(payer) && (payer.amountTouched !== true || payer.autoAmount === true);
}

export function summarizePayerDraft(totalInput, payers) {
  const totalResult = readDraftAmountResult(totalInput);
  const payerResults = Array.isArray(payers)
    ? payers.map((payer) => readDraftAmountResult(payer.amount))
    : [];
  const total = totalResult.amount;
  const paid = payerResults.reduce((sum, result) => sum + result.amount, 0);
  const difference = total - paid;
  const valid =
    totalResult.valid &&
    payerResults.length > 0 &&
    payerResults.every((result) => result.valid);

  return {
    total,
    paid,
    remaining: Math.max(difference, 0),
    overpaid: Math.max(-difference, 0),
    balanced: valid && total > 0 && difference === 0,
    valid
  };
}

export function formatDraftAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return formatMoney(amount).replace(/\.00$/, "");
}

function readDraftAmount(value) {
  return readDraftAmountResult(value).amount;
}

function readDraftAmountResult(value) {
  try {
    return { amount: parseMoneyInput(value), valid: true };
  } catch {
    return { amount: 0, valid: false };
  }
}
