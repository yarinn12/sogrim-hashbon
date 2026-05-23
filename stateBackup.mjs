export function parseMoneyInput(value) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    throw new Error("אפשר להזין סכום עם עד שתי ספרות אחרי הנקודה.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatMoney(amount) {
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export function splitEvenly(amount, participantIds) {
  if (participantIds.length === 0) {
    throw new Error("Cannot split an amount without participants.");
  }

  const baseShare = Math.floor(amount / participantIds.length);
  let remainder = amount - baseShare * participantIds.length;
  const shares = {};

  for (const participantId of participantIds) {
    const extra = remainder > 0 ? 1 : 0;
    shares[participantId] = baseShare + extra;
    remainder -= extra;
  }

  return shares;
}
