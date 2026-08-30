export const DEFAULT_CURRENCY = "ILS";

const CURRENCIES = [
  { id: "ILS", label: "שקל ישראלי", country: "ישראל", symbol: "₪" },
  { id: "USD", label: "דולר אמריקאי", country: "ארצות הברית", symbol: "$" },
  { id: "EUR", label: "אירו", country: "גוש האירו", symbol: "€" },
  { id: "GBP", label: "ליש״ט", country: "בריטניה", symbol: "£" },
  { id: "AED", label: "דירהם", country: "איחוד האמירויות", symbol: "د.إ" },
  { id: "THB", label: "באט", country: "תאילנד", symbol: "฿" },
  { id: "GEL", label: "לארי", country: "גאורגיה", symbol: "₾" },
  { id: "CHF", label: "פרנק שווייצרי", country: "שווייץ", symbol: "CHF" },
  { id: "CAD", label: "דולר קנדי", country: "קנדה", symbol: "C$" },
  { id: "AUD", label: "דולר אוסטרלי", country: "אוסטרליה", symbol: "A$" },
  { id: "PLN", label: "זלוטי", country: "פולין", symbol: "zł" },
  { id: "CZK", label: "קורונה צ׳כית", country: "צ׳כיה", symbol: "Kč" },
  { id: "TRY", label: "לירה טורקית", country: "טורקיה", symbol: "₺" },
  { id: "HUF", label: "פורינט", country: "הונגריה", symbol: "Ft" },
  { id: "RON", label: "לאו", country: "רומניה", symbol: "lei" },
  { id: "JPY", label: "ין", country: "יפן", symbol: "¥" },
  { id: "CNY", label: "יואן", country: "סין", symbol: "CN¥" },
  { id: "INR", label: "רופי", country: "הודו", symbol: "₹" },
  { id: "KRW", label: "וון", country: "דרום קוריאה", symbol: "₩" },
  { id: "VND", label: "דונג", country: "וייטנאם", symbol: "₫" },
  { id: "SGD", label: "דולר סינגפורי", country: "סינגפור", symbol: "S$" },
  { id: "NZD", label: "דולר ניו זילנדי", country: "ניו זילנד", symbol: "NZ$" },
  { id: "SEK", label: "כתר שוודי", country: "שוודיה", symbol: "kr" },
  { id: "NOK", label: "כתר נורווגי", country: "נורווגיה", symbol: "kr" },
  { id: "DKK", label: "כתר דני", country: "דנמרק", symbol: "kr" },
  { id: "MAD", label: "דירהם מרוקאי", country: "מרוקו", symbol: "MAD" },
  { id: "EGP", label: "לירה מצרית", country: "מצרים", symbol: "E£" },
  { id: "JOD", label: "דינר ירדני", country: "ירדן", symbol: "JD" },
  { id: "ZAR", label: "ראנד", country: "דרום אפריקה", symbol: "R" }
];

const CURRENCY_BY_ID = new Map(CURRENCIES.map((currency) => [currency.id, currency]));

export function currencyOptions() {
  return CURRENCIES.map((currency) => ({ ...currency }));
}

export function normalizeCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  return CURRENCY_BY_ID.has(currency) ? currency : DEFAULT_CURRENCY;
}

export function currencyConfig(value) {
  return CURRENCY_BY_ID.get(normalizeCurrency(value));
}

export function currencySelectLabel(value) {
  const currency = currencyConfig(value);
  return `${currency.label} (${currency.country}) · ${currency.symbol}`;
}

export function formatCurrency(amount, currency = DEFAULT_CURRENCY) {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Currency amounts must be safe integer minor units.");
  }
  const config = currencyConfig(currency);
  const sign = amount < 0 ? "-" : "";
  const separator = config.symbol.length > 1 ? " " : "";
  return `${sign}${config.symbol}${separator}${formatDecimal(Math.abs(amount))}`;
}

function formatDecimal(amount) {
  const whole = Math.floor(amount / 100);
  const cents = String(amount % 100).padStart(2, "0");
  const groupedWhole = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${groupedWhole}.${cents}`;
}
