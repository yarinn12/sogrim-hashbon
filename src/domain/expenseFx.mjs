const MAX_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);
const RATE_ENDPOINT = "https://api.frankfurter.dev/v2/providers/ecb/rate";

export function currencyFractionDigits(currency) {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    if (Number.isInteger(digits) && digits >= 0 && digits <= 3) return digits;
  } catch {
    // Unknown currencies are never accepted for conversion.
  }
  throw new Error("מטבע המקור אינו נתמך להמרה.");
}

export function parseSourceAmount(value, currency) {
  const digits = currencyFractionDigits(currency);
  const normalized = String(value ?? "").trim().replace(",", ".");
  const pattern = digits ? new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(normalized)) throw new Error(`יש להזין סכום עם עד ${digits} ספרות אחרי הנקודה עבור ${currency}.`);
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt((fraction || "0").padEnd(digits, "0"));
  if (minor > MAX_MINOR_UNITS) throw new Error("הסכום גדול מדי.");
  return minor;
}

export function formatSourceAmount(minorUnits, currency) {
  const digits = currencyFractionDigits(currency);
  const minor = BigInt(minorUnits);
  const scale = 10n ** BigInt(digits);
  const whole = minor / scale;
  const fraction = digits ? `.${String(minor % scale).padStart(digits, "0")}` : "";
  return `${whole}${fraction}`;
}

export function summarizeSourcePayers(totalInput, payers, currency) {
  try {
    const total = parseSourceAmount(totalInput, currency);
    const amounts = payers.map((payer) => parseSourceAmount(payer.amount, currency));
    const paid = amounts.reduce((sum, amount) => sum + amount, 0n);
    const difference = total - paid;
    return { total: Number(total), paid: Number(paid), remaining: Number(difference > 0n ? difference : 0n), overpaid: Number(difference < 0n ? -difference : 0n), balanced: total > 0n && difference === 0n && payers.length > 0 && amounts.every((amount) => amount > 0n), valid: payers.length > 0 };
  } catch {
    return { total: 0, paid: 0, remaining: 0, overpaid: 0, balanced: false, valid: false };
  }
}

export function assignSourcePayerDifference(totalInput, payers, index, currency, { automatic = false } = {}) {
  if (!payers[index]) return payers;
  try {
    const total = parseSourceAmount(totalInput, currency);
    const other = payers.reduce((sum, payer, payerIndex) => payerIndex === index ? sum : sum + parseSourceAmount(payer.amount || "0", currency), 0n);
    const next = total > other ? total - other : 0n;
    return payers.map((payer, payerIndex) => payerIndex === index ? { ...payer, amount: formatSourceAmount(next, currency), amountTouched: !automatic, autoAmount: automatic } : payer);
  } catch {
    return payers;
  }
}

function parseRate(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,16})?$/.test(normalized)) throw new Error("השער אינו מספר עשרוני תקין.");
  const [whole, fraction = ""] = normalized.split(".");
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error("שער ההמרה חייב להיות גדול מאפס.");
  return { numerator, denominator: 10n ** BigInt(fraction.length), value: normalized };
}

const JSON_NUMBER = "-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?";

function decimalJsonRateToken(token) {
  const match = /^(-?(?:0|[1-9]\d*))(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי.");
  const [, whole, fraction = "", exponent = "0"] = match;
  const shift = Number(exponent);
  const point = whole.length + shift;
  if (whole.startsWith("-") || !Number.isSafeInteger(shift) || point < -16 || point > 32) {
    throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי.");
  }
  const digits = whole + fraction;
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}`
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const normalized = expanded.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  parseRate(normalized);
  return normalized;
}

function exactJsonRate(raw, key) {
  if (!/^[A-Za-z]{3}$|^rate$/.test(key)) throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי.");
  const token = raw.match(new RegExp(`"${key}"\\s*:\\s*(${JSON_NUMBER})(?=\\s*[,}])`))?.[1];
  if (!token) throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי.");
  return decimalJsonRateToken(token);
}

function roundHalfUp(numerator, denominator) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function convertExpenseInput({ sourceCurrency, targetCurrency, sourceAmount, sourcePayers, rate, mode, sourceDate = null, fetchedAt = null }) {
  if (sourceCurrency === targetCurrency) throw new Error("אין צורך להמיר מטבע זהה.");
  const fractionDigits = currencyFractionDigits(sourceCurrency);
  currencyFractionDigits(targetCurrency);
  const totalMinor = parseSourceAmount(sourceAmount, sourceCurrency);
  const parsedPayers = sourcePayers.map((payer) => ({ participantId: payer.participantId, minor: parseSourceAmount(payer.amount, sourceCurrency) }));
  if (!parsedPayers.length || totalMinor <= 0n || parsedPayers.some((payer) => payer.minor <= 0n) || parsedPayers.reduce((sum, payer) => sum + payer.minor, 0n) !== totalMinor) {
    throw new Error("סכומי המשלמים במטבע המקור חייבים להסתכם לסכום ההוצאה.");
  }
  if (parsedPayers.some((payer) => typeof payer.participantId !== "string" || !payer.participantId.trim()) ||
      new Set(parsedPayers.map((payer) => payer.participantId)).size !== parsedPayers.length) {
    throw new Error("כל משלם חייב להופיע פעם אחת.");
  }
  const parsedRate = parseRate(rate);
  if (mode !== "manual" && mode !== "automatic") throw new Error("מצב השער אינו תקין.");
  if (mode === "automatic" && (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate ?? "") || !Number.isFinite(Date.parse(fetchedAt)))) {
    throw new Error("תאריך השער האוטומטי חסר.");
  }
  const denominator = parsedRate.denominator * 10n ** BigInt(fractionDigits);
  const multiplier = parsedRate.numerator * 100n; // Existing event ledger units always have two decimal places.
  const targetTotal = roundHalfUp(totalMinor * multiplier, denominator);
  if (targetTotal <= 0n || targetTotal > MAX_MINOR_UNITS) throw new Error("הסכום המומר אינו בטווח הנתמך.");
  const portions = parsedPayers.map((payer, index) => {
    const exact = payer.minor * multiplier;
    return { participantId: payer.participantId, index, amount: exact / denominator, remainder: exact % denominator };
  });
  let unassigned = targetTotal - portions.reduce((sum, payer) => sum + payer.amount, 0n);
  const byRemainder = [...portions].sort((left, right) => left.remainder === right.remainder ? left.index - right.index : left.remainder > right.remainder ? -1 : 1);
  for (const payer of byRemainder) {
    if (unassigned <= 0n) break;
    payer.amount += 1n;
    unassigned -= 1n;
  }
  if (unassigned !== 0n || portions.some((payer) => payer.amount <= 0n)) throw new Error("לא ניתן לחלק את הסכום המומר בין כל המשלמים; יש להתאים את הסכומים או השער.");
  const payers = portions.sort((left, right) => left.index - right.index).map((payer) => ({ participantId: payer.participantId, amount: Number(payer.amount) }));
  return {
    total: Number(targetTotal),
    payers,
    fxConversion: {
      version: 1,
      sourceCurrency,
      sourceAmountMinorUnits: String(totalMinor),
      sourceFractionDigits: fractionDigits,
      sourcePayers: parsedPayers.map((payer) => ({ participantId: payer.participantId, amountMinorUnits: String(payer.minor) })),
      targetCurrency,
      targetAmountMinorUnits: String(targetTotal),
      targetFractionDigits: 2,
      rate: parsedRate.value,
      rateUnits: "target major units per 1 source major unit",
      mode,
      source: mode === "automatic" ? "ECB via Frankfurter v2" : "user",
      sourceDate: mode === "automatic" ? sourceDate : null,
      fetchedAt: mode === "automatic" ? fetchedAt : null
    }
  };
}

export function validateExpenseFx(expense, eventCurrency) {
  const fx = expense?.fxConversion;
  if (!fx) return true;
  try {
    if (fx.version !== 1 || fx.targetCurrency !== eventCurrency || fx.targetFractionDigits !== 2 ||
      fx.sourceFractionDigits !== currencyFractionDigits(fx.sourceCurrency) ||
      fx.rateUnits !== "target major units per 1 source major unit" ||
      fx.source !== (fx.mode === "automatic" ? "ECB via Frankfurter v2" : "user")) return false;
    const result = convertExpenseInput({
      sourceCurrency: fx.sourceCurrency,
      targetCurrency: fx.targetCurrency,
      sourceAmount: formatSourceAmount(fx.sourceAmountMinorUnits, fx.sourceCurrency),
      sourcePayers: fx.sourcePayers.map((payer) => ({ participantId: payer.participantId, amount: formatSourceAmount(payer.amountMinorUnits, fx.sourceCurrency) })),
      rate: fx.rate, mode: fx.mode, sourceDate: fx.sourceDate, fetchedAt: fx.fetchedAt
    });
    // Participant merges may combine or rename payers after the original FX snapshot.
    // The event ledger remains the authority for the current payer distribution.
    return result.total === expense.total && fx.targetAmountMinorUnits === String(expense.total);
  } catch {
    return false;
  }
}

export function rateIsStale(sourceDate, now = new Date()) {
  const source = Date.parse(`${sourceDate}T00:00:00Z`);
  return !Number.isFinite(source) || source > now.getTime() || now.getTime() - source > 7 * 24 * 60 * 60 * 1000;
}

export async function fetchEcbRate(sourceCurrency, targetCurrency, { fetchImpl = fetch, now = () => new Date(), timeoutMs = 8000 } = {}) {
  currencyFractionDigits(sourceCurrency);
  currencyFractionDigits(targetCurrency);
  let response;
  let raw;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetchImpl(`${RATE_ENDPOINT}/${encodeURIComponent(sourceCurrency.toLowerCase())}/${encodeURIComponent(targetCurrency.toLowerCase())}`, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (response.ok) raw = await response.text();
  } catch {
    throw new Error("לא ניתן לקבל שער כעת. אפשר להזין שער אישי.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(response.status === 404 ? "אין שער ECB לזוג המטבעות הזה. אפשר להזין שער אישי." : "לא ניתן לקבל שער כעת. אפשר להזין שער אישי.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי."); }
  let exactRate;
  try { exactRate = exactJsonRate(raw, "rate"); } catch { throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי."); }
  if (String(data.base).toUpperCase() !== sourceCurrency || String(data.quote).toUpperCase() !== targetCurrency || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !exactRate) {
    throw new Error("תשובת השער אינה תקינה. אפשר להזין שער אישי.");
  }
  return { rate: exactRate, sourceDate: data.date, fetchedAt: now().toISOString(), stale: rateIsStale(data.date, now()) };
}
