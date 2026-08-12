export const PRODUCT_METRIC_EVENT = "sogrim:product-metric";

export const PRODUCT_METRIC_NAMES = Object.freeze([
  "app_ready",
  "event_creation_started",
  "event_created",
  "expense_started",
  "expense_created",
  "settlement_opened",
  "invite_shared",
  "invite_joined",
  "transfer_marked_paid",
  "operation_failure",
  "client_error"
]);

export const PRODUCT_METRIC_OPERATIONS = Object.freeze([
  "auth",
  "state_load",
  "state_save",
  "event_invite",
  "friend_network",
  "notification_inbox",
  "feedback",
  "push",
  "ads",
  "share"
]);

export const PRODUCT_METRIC_SCREENS = Object.freeze([
  "boot",
  "auth",
  "home",
  "new_event",
  "event",
  "expense",
  "settlement",
  "invite",
  "groups",
  "profile",
  "notifications",
  "unknown"
]);

export const PRODUCT_METRIC_PLATFORMS = Object.freeze([
  "web",
  "android",
  "ios"
]);

const EVENT_NAMES = new Set(PRODUCT_METRIC_NAMES);
const SCREENS = new Set(PRODUCT_METRIC_SCREENS);
const PLATFORMS = new Set(PRODUCT_METRIC_PLATFORMS);
const EVENT_TYPES = new Set(["standard", "trip", "restaurant"]);
const OPERATIONS = new Set(PRODUCT_METRIC_OPERATIONS);
const METRIC_KEYS = new Set([
  "id",
  "sessionId",
  "eventName",
  "screen",
  "platform",
  "appVersion",
  "buildNumber",
  "detail",
  "occurredAt"
]);
const ERROR_KINDS = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError",
  "ResourceError",
  "UnhandledRejection"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^[0-9A-Za-z._-]{0,24}$/;
const ERROR_DETAIL_PATTERN = /^(Error|TypeError|ReferenceError|RangeError|SyntaxError|ResourceError|UnhandledRejection):(app|public-layer|vendor|resource|unknown):\d{1,6}(?::\d{1,6}:[0-9a-f]{8})?$/;
const MAX_BATCH_SIZE = 20;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeProductMetricBatch(value, { now = Date.now } = {}) {
  if (!isPlainObject(value) || hasUnknownKeys(value, new Set(["events"]))) {
    throw metricError("Invalid metrics payload");
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > MAX_BATCH_SIZE) {
    throw metricError("Metrics batch size is invalid");
  }
  return value.events.map((metric) => normalizeProductMetric(metric, { now }));
}

export function normalizeProductMetric(value, { now = Date.now } = {}) {
  if (!isPlainObject(value) || hasUnknownKeys(value, METRIC_KEYS)) {
    throw metricError("Metric contains unsupported fields");
  }

  const id = String(value.id ?? "").trim();
  const sessionId = String(value.sessionId ?? "").trim();
  const eventName = String(value.eventName ?? "").trim();
  const screen = String(value.screen ?? "unknown").trim();
  const platform = String(value.platform ?? "web").trim();
  const appVersion = String(value.appVersion ?? "").trim();
  const buildNumber = Number(value.buildNumber ?? 0);
  const detail = String(value.detail ?? "").trim();

  if (!UUID_PATTERN.test(id)) throw metricError("Metric id is invalid");
  if (sessionId && !UUID_PATTERN.test(sessionId)) throw metricError("Metric session is invalid");
  if (!EVENT_NAMES.has(eventName)) throw metricError("Metric name is invalid");
  if (!SCREENS.has(screen)) throw metricError("Metric screen is invalid");
  if (!PLATFORMS.has(platform)) throw metricError("Metric platform is invalid");
  if (!VERSION_PATTERN.test(appVersion)) throw metricError("Metric version is invalid");
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 0 || buildNumber > 10_000_000) {
    throw metricError("Metric build is invalid");
  }
  validateMetricDetail(eventName, detail);

  const currentTime = Number(now()) || Date.now();
  const parsedTime = Date.parse(String(value.occurredAt ?? ""));
  const occurredAt = Number.isFinite(parsedTime) &&
    parsedTime >= currentTime - MAX_EVENT_AGE_MS &&
    parsedTime <= currentTime + MAX_CLOCK_SKEW_MS
      ? new Date(parsedTime).toISOString()
      : new Date(currentTime).toISOString();

  return {
    id,
    sessionId,
    eventName,
    screen,
    platform,
    appVersion,
    buildNumber,
    detail,
    occurredAt
  };
}

export function sanitizeClientError({
  error,
  filename = "",
  line = 0,
  column = 0,
  kind: requestedKind = ""
} = {}) {
  const rawKind = String(requestedKind || error?.name || "Error");
  const kind = ERROR_KINDS.has(rawKind) ? rawKind : "Error";
  const frames = sanitizedStackFrames(error?.stack);
  const explicitSource = errorSourceCategory(filename);
  const source = explicitSource !== "unknown" ? explicitSource : frames[0]?.source ?? "unknown";
  const lineBucket = numericBucket(line || frames[0]?.line, 50, 999_950);
  const columnBucket = numericBucket(column || frames[0]?.column, 10, 999_990);
  const fingerprintInput = [
    kind,
    source,
    lineBucket,
    columnBucket,
    ...frames.map((frame) => `${frame.source}:${frame.line}:${frame.column}`)
  ].join("|");
  return `${kind}:${source}:${lineBucket}:${columnBucket}:${fnv1a(fingerprintInput)}`;
}

export function createProductMetricId(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID();
  const randomHex = (length) => Array.from(
    { length },
    () => Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

function validateMetricDetail(eventName, detail) {
  if (eventName === "event_created") {
    if (!EVENT_TYPES.has(detail)) throw metricError("Event type detail is invalid");
    return;
  }
  if (eventName === "client_error") {
    if (!ERROR_DETAIL_PATTERN.test(detail)) throw metricError("Error detail is invalid");
    return;
  }
  if (eventName === "operation_failure") {
    if (!OPERATIONS.has(detail)) throw metricError("Operation detail is invalid");
    return;
  }
  if (detail) throw metricError("Metric detail is not allowed");
}

function errorSourceCategory(filename) {
  const value = String(filename ?? "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("/src/app.mjs") || value.endsWith("/app.mjs")) return "app";
  if (value.includes("/src/public") && value.includes("layer.mjs")) return "public-layer";
  if (value.includes("/src/vendor/") || value.includes("/node_modules/")) return "vendor";
  if (/\.(?:css|png|jpe?g|webp|svg|mp4|webm|woff2?)(?:[?#]|$)/.test(value)) return "resource";
  return "unknown";
}

function sanitizedStackFrames(stack) {
  return String(stack ?? "")
    .split(/\r?\n/)
    .map((frame) => {
      const location = frame.match(/:(\d{1,7}):(\d{1,7})(?:\)?\s*$)/);
      if (!location) return null;
      return {
        source: errorSourceCategory(frame),
        line: numericBucket(location[1], 50, 999_950),
        column: numericBucket(location[2], 10, 999_990)
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function numericBucket(value, size, maximum) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.min(maximum, Math.floor(numericValue / size) * size)
    : 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasUnknownKeys(value, allowedKeys) {
  return Object.keys(value).some((key) => !allowedKeys.has(key));
}

function metricError(message) {
  const error = new Error(message);
  error.code = "INVALID_PRODUCT_METRIC";
  return error;
}
