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
  const total = readDraftAmount(totalInput);
  const paid = Array.isArray(payers)
    ? payers.reduce((sum, payer) => sum + readDraftAmount(payer.amount), 0)
    : 0;
  const difference = total - paid;

  return {
    total,
    paid,
    remaining: Math.max(difference, 0),
    overpaid: Math.max(-difference, 0),
    balanced: total > 0 && difference === 0
  };
}

export function formatDraftAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return formatMoney(amount).replace(/\.00$/, "");
}

function readDraftAmount(value) {
  try {
    return parseMoneyInput(value);
  } catch {
    return 0;
  }
}
