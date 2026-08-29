import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout
} from "./fetchTimeout.mjs";

const FEEDBACK_CATEGORIES = new Set(["bug", "clarity", "idea"]);
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 1200;

export function appFeedbackAvailable(config) {
  return Boolean(feedbackIdentity(config));
}

export async function submitAppFeedback(
  config,
  { category, message, context = {} },
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const identity = feedbackIdentity(config);
  if (!identity) throw new Error("Sign in is required");

  const normalizedCategory = normalizeFeedbackCategory(category);
  const normalizedMessage = normalizeFeedbackMessage(message);
  const normalizedContext = normalizeFeedbackContext(context);
  const response = await fetchWithTimeout(
    fetchImpl,
    `${identity.url}/rest/v1/rpc/submit_app_feedback`,
    {
      method: "POST",
      headers: {
        apikey: identity.anonKey,
        authorization: `Bearer ${identity.accessToken}`,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        p_category: normalizedCategory,
        p_message: normalizedMessage,
        p_context: normalizedContext
      })
    },
    timeoutMs
  );

  if (!response.ok) throw new Error("Feedback could not be submitted");
  return true;
}

export function normalizeFeedbackCategory(value) {
  const category = String(value ?? "").trim().toLowerCase();
  if (!FEEDBACK_CATEGORIES.has(category)) {
    throw new Error("Feedback category is invalid");
  }
  return category;
}

export function normalizeFeedbackMessage(value) {
  const message = String(value ?? "").replace(/\s+/g, " ").trim();
  if (
    message.length < MIN_MESSAGE_LENGTH ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    throw new Error("Feedback message length is invalid");
  }
  return message;
}

export function normalizeFeedbackContext(value) {
  const source = value && typeof value === "object" ? value : {};
  const context = {};
  for (const key of [
    "appVersion",
    "buildNumber",
    "platform",
    "locale",
    "screen",
    "viewport"
  ]) {
    const normalized = String(source[key] ?? "").trim().slice(0, 120);
    if (normalized) context[key] = normalized;
  }
  return context;
}

function feedbackIdentity(config) {
  const url = String(config?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(config?.storage?.anonKey ?? "").trim();
  const userId = String(config?.storage?.account?.userId ?? "").trim();
  const accessToken = String(
    config?.storage?.account?.accessToken ?? ""
  ).trim();
  return url && anonKey && userId && accessToken
    ? { url, anonKey, userId, accessToken }
    : null;
}
