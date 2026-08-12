export const DEFAULT_CURRENCY = "ILS";

const CURRENCIES = [
  { id: "ILS", label: "שקל ישראלי", symbol: "₪" },
  { id: "USD", label: "דולר אמריקאי", symbol: "$" },
  { id: "EUR", label: "אירו", symbol: "€" },
  { id: "GBP", label: "ליש״ט", symbol: "£" },
  { id: "AED", label: "דירהם איחוד האמירויות", symbol: "د.إ" },
  { id: "THB", label: "באט תאילנדי", symbol: "฿" },
  { id: "GEL", label: "לארי גאורגי", symbol: "₾" },
  { id: "CHF", label: "פרנק שווייצרי", symbol: "CHF" },
  { id: "CAD", label: "דולר קנדי", symbol: "C$" },
  { id: "AUD", label: "דולר אוסטרלי", symbol: "A$" },
  { id: "PLN", label: "זלוטי פולני", symbol: "zł" },
  { id: "CZK", label: "קורונה צ׳כית", symbol: "Kč" },
  { id: "TRY", label: "לירה טורקית", symbol: "₺" }
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
  return `${currency.label} (${currency.symbol})`;
}

export function formatCurrency(amount, currency = DEFAULT_CURRENCY) {
  const config = currencyConfig(currency);
  const sign = amount < 0 ? "-" : "";
  const separator = config.symbol.length > 1 ? " " : "";
  return `${sign}${config.symbol}${separator}${formatDecimal(Math.abs(amount))}`;
}

function formatDecimal(amount) {
  const whole = Math.floor(amount / 100);
  const cents = String(amount % 100).padStart(2, "0");
  return `${whole}.${cents}`;
}
