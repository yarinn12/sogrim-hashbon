export function parseMoneyInput(value) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    throw new Error("אפשר להזין סכום עם עד שתי ספרות אחרי הנקודה.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) {
    throw new Error("הסכום גדול מדי.");
  }
  return amount;
}

export function formatMoney(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Money amounts must be safe integer agorot.");
  }
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export function splitEvenly(amount, participantIds) {
  const uniqueParticipantIds = [...new Set(participantIds.filter(Boolean))];

  if (uniqueParticipantIds.length === 0) {
    throw new Error("Cannot split an amount without participants.");
  }

  const baseShare = Math.floor(amount / uniqueParticipantIds.length);
  let remainder = amount - baseShare * uniqueParticipantIds.length;
  const shares = {};

  for (const participantId of uniqueParticipantIds) {
    const extra = remainder > 0 ? 1 : 0;
    shares[participantId] = baseShare + extra;
    remainder -= extra;
  }

  return shares;
}
