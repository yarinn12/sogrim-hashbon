import { loadStoredAccountSession } from "./accountAuth.mjs";
import {
  PRODUCT_METRIC_EVENT,
  classifyOperationFailure,
  createProductMetricId,
  normalizeProductMetric,
  operationMetricDetail,
  sanitizeClientError
} from "../domain/productMetrics.mjs";

const FLUSH_DELAY_MS = 700;
const RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_PENDING_METRICS = 100;
const CLIENT_ERROR_DEDUPE_MS = 30_000;

export function emitProductMetric(eventName, fields = {}, documentRef = globalThis.document) {
  if (!documentRef?.dispatchEvent || typeof globalThis.CustomEvent !== "function") return false;
  documentRef.dispatchEvent(
    new CustomEvent(PRODUCT_METRIC_EVENT, {
      detail: { eventName, ...fields }
    })
  );
  return true;
}

export function emitOperationFailure(
  operation,
  { screen = "unknown", error = null, failureClass = "" } = {},
  documentRef = globalThis.document
) {
  return emitProductMetric("operation_failure", {
    screen: screen === "unknown" ? currentScreen(documentRef) : screen,
    detail: operationMetricDetail(
      operation,
      failureClass || classifyOperationFailure(error, {
        offline: globalThis.navigator?.onLine === false
      })
    )
  }, documentRef);
}

export function emitOperationDeferred(
  operation,
  { screen = "unknown", error = null, failureClass = "" } = {},
  documentRef = globalThis.document
) {
  return emitProductMetric("operation_deferred", {
    screen: screen === "unknown" ? currentScreen(documentRef) : screen,
    detail: operationMetricDetail(
      operation,
      failureClass || classifyOperationFailure(error, {
        offline: globalThis.navigator?.onLine === false
      })
    )
  }, documentRef);
}

export function startProductMetricTransport({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  now = Date.now,
  cryptoRef = globalThis.crypto
} = {}) {
  if (!documentRef?.addEventListener || !windowRef?.addEventListener || typeof fetchImpl !== "function") {
    return () => {};
  }

  const pending = [];
  let flushTimer = 0;
  let flushInFlight = false;
  let consecutiveFailures = 0;
  const recentFailureTimes = new Map();
  let stopped = false;
  let runtimeInfoPromise = null;
  const sessionId = createProductMetricId(cryptoRef);

  const runtimeInfo = () => {
    if (runtimeInfoPromise) return runtimeInfoPromise;
    runtimeInfoPromise = Promise.resolve(globalThis.SogrimNative?.app?.getInfo?.())
      .catch(() => null)
      .then((info) => {
        const platform = normalizePlatform(
          info?.platform ?? globalThis.Capacitor?.getPlatform?.()
        );
        const webRelease = normalizeBuild(
          documentRef.documentElement?.dataset?.pwaRelease
        );
        return {
          platform,
          appVersion: normalizeVersion(info?.version) ||
            (platform === "web" && webRelease ? `pwa-${webRelease}` : ""),
          buildNumber: normalizeBuild(info?.build) ||
            (platform === "web" ? webRelease : 0)
        };
      });
    return runtimeInfoPromise;
  };

  const flush = async () => {
    if (stopped || flushInFlight || pending.length === 0) return;
    if (flushTimer) windowRef.clearTimeout(flushTimer);
    flushTimer = 0;
    flushInFlight = true;
    const session = loadStoredAccountSession(storage);
    if (!session?.access_token) {
      pending.splice(0);
      flushInFlight = false;
      return;
    }

    const batch = pending.splice(0, 20);
    let retryDelay = 0;
    try {
      const info = await runtimeInfo();
      const events = batch.map((metric) => ({ ...metric, ...info }));
      const response = await fetchImpl("/api/product-metrics", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ events }),
        credentials: "same-origin",
        keepalive: true
      });
      if (!response?.ok && (response?.status === 429 || Number(response?.status) >= 500)) {
        throw new Error("Retryable product metrics response");
      }
      consecutiveFailures = 0;
    } catch {
      // Metrics must never interrupt or slow the product flow.
      restorePendingBatch(batch);
      consecutiveFailures += 1;
      retryDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        RETRY_DELAY_MS * (2 ** Math.min(consecutiveFailures - 1, 4))
      );
    } finally {
      flushInFlight = false;
      if (pending.length > 0) scheduleFlush(retryDelay || FLUSH_DELAY_MS);
    }
  };

  const scheduleFlush = (delay = FLUSH_DELAY_MS) => {
    if (flushTimer || stopped) return;
    flushTimer = windowRef.setTimeout(() => flush(), delay);
  };

  const restorePendingBatch = (batch) => {
    const restored = [...batch, ...pending].slice(-MAX_PENDING_METRICS);
    pending.splice(0, pending.length, ...restored);
  };

  const enqueue = (detail) => {
    try {
      const metric = normalizeProductMetric({
        id: createProductMetricId(cryptoRef),
        sessionId,
        eventName: detail?.eventName,
        screen: detail?.screen ?? "unknown",
        platform: "web",
        appVersion: "",
        buildNumber: 0,
        detail: detail?.detail ?? "",
        occurredAt: new Date(Number(now()) || Date.now()).toISOString()
      }, { now });
      if (["client_error", "operation_deferred", "operation_failure"].includes(metric.eventName)) {
        const errorKey = `${metric.screen}:${metric.detail}`;
        const occurredAt = Date.parse(metric.occurredAt);
        const lastFailureAt = recentFailureTimes.get(errorKey) ?? 0;
        if (occurredAt - lastFailureAt < CLIENT_ERROR_DEDUPE_MS) return;
        recentFailureTimes.set(errorKey, occurredAt);
        if (recentFailureTimes.size > 50) {
          recentFailureTimes.delete(recentFailureTimes.keys().next().value);
        }
      }
      pending.push(metric);
      if (pending.length > MAX_PENDING_METRICS) pending.shift();
      scheduleFlush();
    } catch {
      // Unsupported fields and values are intentionally discarded client-side.
    }
  };

  const onMetric = (event) => enqueue(event.detail);
  const onError = (event) => enqueue({
    eventName: "client_error",
    screen: currentScreen(documentRef),
    detail: sanitizeClientError({
      error: event.error,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      kind: event.target && event.target !== windowRef ? "ResourceError" : ""
    })
  });
  const onUnhandledRejection = (event) => enqueue({
    eventName: "client_error",
    screen: currentScreen(documentRef),
    detail: sanitizeClientError({
      error: event?.reason,
      kind: "UnhandledRejection"
    })
  });
  const onVisibilityChange = () => {
    if (documentRef.visibilityState === "hidden") flush();
  };

  documentRef.addEventListener(PRODUCT_METRIC_EVENT, onMetric);
  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  windowRef.addEventListener("error", onError, true);
  windowRef.addEventListener("unhandledrejection", onUnhandledRejection);

  enqueue({ eventName: "app_ready", screen: "boot" });

  return () => {
    stopped = true;
    if (flushTimer) windowRef.clearTimeout(flushTimer);
    documentRef.removeEventListener(PRODUCT_METRIC_EVENT, onMetric);
    documentRef.removeEventListener("visibilitychange", onVisibilityChange);
    windowRef.removeEventListener("error", onError, true);
    windowRef.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function currentScreen(documentRef) {
  const app = documentRef?.querySelector?.("#app");
  const screen = String(app?.dataset?.screen ?? "").replaceAll("-", "_");
  return [
    "auth",
    "home",
    "new_event",
    "event",
    "expense",
    "settlement",
    "invite",
    "groups",
    "profile",
    "notifications"
  ].includes(screen) ? screen : "unknown";
}

function normalizePlatform(value) {
  return ["android", "ios"].includes(value) ? value : "web";
}

function normalizeVersion(value) {
  const version = String(value ?? "").trim();
  return /^[0-9A-Za-z._-]{1,24}$/.test(version) ? version : "";
}

function normalizeBuild(value) {
  const build = Number(value ?? 0);
  return Number.isSafeInteger(build) && build >= 0 && build <= 10_000_000 ? build : 0;
}
