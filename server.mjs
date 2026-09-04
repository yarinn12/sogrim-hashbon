import { createReadStream, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { extname, join, posix, resolve } from "node:path";
import { sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { demoState } from "./src/data/demoData.mjs";
import { loadEnvFile } from "./src/server/envFile.mjs";
import { getHealthPayload } from "./src/server/health.mjs";
import { renderInviteDocument } from "./src/server/invitePageMetadata.mjs";
import { parseInviteEventId } from "./src/domain/inviteLinks.mjs";
import { deleteSupabaseAccount } from "./src/server/accountDeletion.mjs";
import { verifyGoogleCredential } from "./src/server/googleAuth.mjs";
import { verifyGooglePlaySubscription } from "./src/server/googlePlayBilling.mjs";
import { sendPaymentReminder } from "./src/server/paymentReminders.mjs";
import { sendEventActivityNotification } from "./src/server/eventActivityNotifications.mjs";
import { sendBroadcastNotification } from "./src/server/broadcastNotifications.mjs";
import {
  purgeExpiredProductMetrics,
  storeProductMetrics
} from "./src/server/productMetrics.mjs";
import { getAdminAnalyticsOverview } from "./src/server/adminAnalytics.mjs";
import {
  manageOpenEventInvite,
  redeemEventInvite
} from "./src/server/eventInvites.mjs";
import { getLanUrls } from "./src/server/networkInfo.mjs";
import {
  getClientRuntimeConfig,
  getRuntimeConfig
} from "./src/server/runtimeConfig.mjs";
import { createStateStore } from "./src/server/stateStore.mjs";

const defaultRoot = process.cwd();
loadEnvFile(join(defaultRoot, ".env"));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".apk": "application/vnd.android.package-archive",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const staticAliases = {
  "/android": "/downloads/sogrim-hashbon-android-1.2.apk",
  "/privacy": "/privacy.html",
  "/support": "/support.html",
  "/terms": "/terms.html",
  "/accessibility": "/accessibility.html",
  "/account-deletion": "/account-deletion.html",
  "/delete-account": "/account-deletion.html"
};
const publicRootFiles = new Set([
  "/index.html",
  "/privacy.html",
  "/support.html",
  "/terms.html",
  "/accessibility.html",
  "/account-deletion.html",
  "/styles.css",
  "/legal.css",
  "/legal.mjs",
  "/manifest.webmanifest",
  "/sw.js",
  "/app-ads.txt",
  "/apple-touch-icon.png",
  "/brand-mark.png",
  "/brand-mark-v2.png",
  "/brand-mark-v3.png",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/app-icon-exterior-192.png",
  "/app-icon-exterior-512.png",
  "/app-icon-exterior-maskable-512.png",
  "/sogrim-logo-lockup.png",
  "/sogrim-share-logo.png",
  "/sogrim-home-hero.png"
]);
const publicStaticPrefixes = ["/.well-known/", "/assets/", "/icons/", "/src/"];
const publicStaticExtensions = new Set([
  ".apk", ".css", ".ico", ".jpeg", ".jpg", ".js", ".json", ".mjs",
  ".mp4", ".png", ".svg", ".ttf", ".txt", ".webmanifest", ".webp"
]);
const MAX_JSON_BODY_BYTES = 1_000_000;
const GOOGLE_AUTH_RATE_LIMIT = {
  limit: 10,
  globalLimit: 300,
  windowMs: 60_000
};
const GOOGLE_PLAY_RATE_LIMIT = {
  limit: 10,
  globalLimit: 300,
  windowMs: 60_000
};
const SENSITIVE_API_RATE_LIMIT = {
  limit: 60,
  globalLimit: 2_000,
  windowMs: 60_000
};
const DURABLE_RATE_LIMIT_TIMEOUT_MS = 5_000;

export function createAppHandler({
  root = defaultRoot,
  env = process.env,
  port = Number(process.argv[2] ?? env.PORT ?? 4173),
  stateFile = env.APP_LOCAL_STATE_FILE,
  googleCredentialVerifier = verifyGoogleCredential,
  accountDeletionService = deleteSupabaseAccount,
  googlePlaySubscriptionVerifier = verifyGooglePlaySubscription,
  paymentReminderService = sendPaymentReminder,
  eventActivityNotificationService = sendEventActivityNotification,
  broadcastNotificationService = sendBroadcastNotification,
  productMetricsService = storeProductMetrics,
  productMetricsRetentionService = purgeExpiredProductMetrics,
  adminAnalyticsService = getAdminAnalyticsOverview,
  openEventInviteService = manageOpenEventInvite,
  eventInviteRedemptionService = redeemEventInvite,
  serverErrorLogger = console.error,
  serverRequestLogger = isDeployedRuntime(env) ? console.info : null,
  requestRateLimiter = createRequestRateLimiter(),
  durableApiRateLimitService = reserveDurableApiRateLimit,
  durableRateLimitTimeoutMs = DURABLE_RATE_LIMIT_TIMEOUT_MS,
  durableRateLimitRequired = isDeployedRuntime(env),
  cdnCacheAppShell = isDeployedRuntime(env)
} = {}) {
  const resolvedRoot = resolve(root);
  const resolvedStateFile = stateFile
    ? resolve(resolvedRoot, stateFile)
    : join(resolvedRoot, "data", "app-state.json");
  const stateStore = createStateStore(resolvedStateFile);

  async function handleRequest(request, response) {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const origin = requestOrigin(request, port);
    const runtimeConfig = getRuntimeConfig(env);
    const localStateAllowed = isTrustedLocalRequest(request, origin, env);
    const localMutationAllowed = isTrustedLocalMutation(
      request,
      origin,
      env
    );
    applyNativeCors(request, response);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response.writeHead(204);
      response.end();
      return;
    }

    const sensitiveNamespace = sensitiveApiRateLimitNamespace(
      url.pathname,
      request.method
    );
    if (sensitiveNamespace && !consumeVerificationCapacity({
      request,
      response,
      env,
      limiter: requestRateLimiter,
      namespace: sensitiveNamespace,
      policy: SENSITIVE_API_RATE_LIMIT,
      errorMessage: "Too many requests"
    })) return;

    if (sensitiveNamespace && durableRateLimitRequired) {
      const durableResult = await promiseWithTimeout(
        (signal) => durableApiRateLimitService({
          env,
          namespace: sensitiveNamespace,
          subjectHashes: durableRateLimitSubjectHashes(request, env),
          policy: SENSITIVE_API_RATE_LIMIT,
          signal
        }),
        durableRateLimitTimeoutMs
      ).catch(() => ({
        available: false,
        allowed: false,
        retryAfterSeconds: 1
      }));
      if (!durableResult?.available) {
        sendJson(response, 503, {
          ok: false,
          error: "Request protection is temporarily unavailable",
          code: "RATE_LIMIT_UNAVAILABLE",
          retryable: true
        });
        return;
      }
      if (!durableResult.allowed) {
        response.setHeader(
          "retry-after",
          String(Math.max(1, durableResult.retryAfterSeconds || 1))
        );
        sendJson(response, 429, {
          ok: false,
          error: "Too many requests",
          code: "RATE_LIMITED",
          retryable: true
        });
        return;
      }
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      if (!localStateAllowed) {
        sendJson(response, 503, {
          ok: false,
          error: "Cloud storage is required for shared state"
        });
        return;
      }
      sendJson(response, 200, await stateStore.load());
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      if (!localMutationAllowed) {
        sendJson(response, 503, {
          ok: false,
          error: "Cloud storage is required for shared state"
        });
        return;
      }
      try {
        const state = await readJsonBody(request, MAX_JSON_BODY_BYTES);
        await stateStore.save(state);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        const tooLarge = error?.code === "BODY_TOO_LARGE";
        sendJson(response, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? "State payload is too large" : "Invalid state payload"
        });
      }
      return;
    }

    if (url.pathname === "/api/reset" && request.method === "POST") {
      if (!localMutationAllowed) {
        sendJson(response, 404, { ok: false, error: "Not found" });
        return;
      }
      await stateStore.save(demoState);
      sendJson(response, 200, await stateStore.load());
      return;
    }

    if (url.pathname === "/api/network" && request.method === "GET") {
      if (!localStateAllowed) {
        sendJson(response, 404, { ok: false, error: "Not found" });
        return;
      }
      sendJson(response, 200, {
        localUrl: `http://127.0.0.1:${port}`,
        lanUrls: getLanUrls(port)
      });
      return;
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      sendJson(
        response,
        200,
        getClientRuntimeConfig(runtimeConfig, {
          platform: request.headers["x-sogrim-platform"],
          build: request.headers["x-sogrim-app-build"]
        })
      );
      return;
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const health = getHealthPayload(runtimeConfig, {
        requireProductionReadiness: url.searchParams.get("strict") === "1",
        deploymentRevision: env.VERCEL_GIT_COMMIT_SHA
      });
      sendJson(response, health.ok ? 200 : 503, health);
      return;
    }

    if (url.pathname === "/api/auth/google" && request.method === "POST") {
      if (!runtimeConfig.auth?.googleClientId) {
        sendJson(response, 503, { ok: false, error: "Google sign-in is not configured" });
        return;
      }
      if (!consumeVerificationCapacity({
        request,
        response,
        env,
        limiter: requestRateLimiter,
        namespace: "google-auth",
        policy: GOOGLE_AUTH_RATE_LIMIT
      })) return;

      try {
        const body = await readJsonBody(request, 20_000);
        const profile = await googleCredentialVerifier(
          body?.credential,
          runtimeConfig.auth.googleClientId
        );
        if (!profile) {
          sendJson(response, 401, { ok: false, error: "Invalid Google credential" });
          return;
        }
        sendJson(response, 200, { ok: true, profile });
      } catch (error) {
        const tooLarge = error?.code === "BODY_TOO_LARGE";
        sendJson(response, tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? "Google credential is too large" : "Invalid request"
        });
      }
      return;
    }

    if (url.pathname === "/api/account" && request.method === "DELETE") {
      let body = {};
      try {
        body = await readJsonBody(request, 2_000);
      } catch {
        sendJson(response, 400, { ok: false, error: "Invalid request" });
        return;
      }

      const result = await accountDeletionService({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        confirmation: body?.confirmation
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (url.pathname === "/api/product-metrics" && request.method === "POST") {
      let body = {};
      try {
        body = await readJsonBody(request, 12_000);
      } catch (error) {
        sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 400, {
          ok: false,
          error: error?.code === "BODY_TOO_LARGE"
            ? "Metrics payload is too large"
            : "Invalid metrics request"
        });
        return;
      }

      const result = await productMetricsService({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        payload: body
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (url.pathname === "/api/maintenance/retention" && request.method === "GET") {
      const cronSecret = String(env.CRON_SECRET ?? "").trim();
      if (!cronSecret) {
        sendJson(response, 503, { ok: false, error: "Retention job is not configured" });
        return;
      }
      if (request.headers.authorization !== `Bearer ${cronSecret}`) {
        sendJson(response, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const result = await productMetricsRetentionService({
        runtimeConfig,
        env
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (url.pathname === "/api/admin/overview" && request.method === "GET") {
      const result = await adminAnalyticsService({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        windowDays: url.searchParams.get("days")
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (
      url.pathname === "/api/billing/google/verify" &&
      request.method === "POST"
    ) {
      if (!consumeVerificationCapacity({
        request,
        response,
        env,
        limiter: requestRateLimiter,
        namespace: "google-play",
        policy: GOOGLE_PLAY_RATE_LIMIT
      })) return;

      let body = {};
      try {
        body = await readJsonBody(request, 16_000);
      } catch (error) {
        sendJson(
          response,
          error?.code === "BODY_TOO_LARGE" ? 413 : 400,
          {
            ok: false,
            error: error?.code === "BODY_TOO_LARGE"
              ? "Purchase payload is too large"
              : "Invalid purchase request"
          }
        );
        return;
      }

      const result = await googlePlaySubscriptionVerifier({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        productId: body?.productId,
        purchaseToken: body?.purchaseToken
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (
      url.pathname === "/api/notifications/payment-reminder" &&
      request.method === "POST"
    ) {
      let body = {};
      try {
        body = await readJsonBody(request, 4_000);
      } catch (error) {
        sendJson(
          response,
          error?.code === "BODY_TOO_LARGE" ? 413 : 400,
          {
            ok: false,
            error: error?.code === "BODY_TOO_LARGE"
              ? "Reminder payload is too large"
              : "Invalid reminder request"
          }
        );
        return;
      }

      const result = await paymentReminderService({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        eventId: body?.eventId,
        transferId: body?.transferId
      });
      if (result.status >= 400) {
        // Diagnostic enums only: no account IDs, balances, tokens or request body.
        response.reminderFailure = {
          failureCode: String(result.payload?.code ?? "REMINDER_FAILED").slice(0, 80),
          failureReason: String(result.payload?.reason ?? "").slice(0, 80)
        };
      }
      sendJson(response, result.status, result.payload);
      return;
    }

    if (
      url.pathname === "/api/notifications/event-activity" &&
      request.method === "POST"
    ) {
      let body = {};
      try {
        body = await readJsonBody(request, 4_000);
      } catch (error) {
        sendJson(
          response,
          error?.code === "BODY_TOO_LARGE" ? 413 : 400,
          {
            ok: false,
            error: error?.code === "BODY_TOO_LARGE"
              ? "Event notification payload is too large"
              : "Invalid event notification request"
          }
        );
        return;
      }

      const result = await eventActivityNotificationService({
        runtimeConfig,
        env,
        authorization: request.headers.authorization,
        eventId: body?.eventId,
        activityId: body?.activityId,
        kind: body?.kind
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (
      url.pathname === "/api/event-invites/open-link" &&
      request.method === "POST"
    ) {
      let body = {};
      try {
        body = await readJsonBody(request, 4_000);
      } catch (error) {
        sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 400, {
          ok: false,
          error: error?.code === "BODY_TOO_LARGE"
            ? "Invitation payload is too large"
            : "Invalid invitation request"
        });
        return;
      }

      try {
        const result = await openEventInviteService({
          runtimeConfig,
          env,
          authorization: request.headers.authorization,
          eventId: body?.eventId,
          candidateToken: body?.candidateToken,
          operation: body?.operation
        });
        sendJson(response, result.status, result.payload);
      } catch {
        sendJson(response, 503, {
          ok: false,
          error: "Event invitations are temporarily unavailable",
          code: "EVENT_INVITES_UNAVAILABLE",
          retryable: true
        });
      }
      return;
    }

    if (
      url.pathname === "/api/event-invites/redeem" &&
      request.method === "POST"
    ) {
      let body = {};
      try {
        body = await readJsonBody(request, 4_000);
      } catch (error) {
        sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 400, {
          ok: false,
          error: error?.code === "BODY_TOO_LARGE"
            ? "Invitation payload is too large"
            : "Invalid invitation request"
        });
        return;
      }

      try {
        const result = await eventInviteRedemptionService({
          runtimeConfig,
          env,
          authorization: request.headers.authorization,
          eventId: body?.eventId,
          token: body?.token
        });
        sendJson(response, result.status, result.payload);
      } catch {
        sendJson(response, 503, {
          ok: false,
          error: "Event invitations are temporarily unavailable",
          code: "EVENT_INVITES_UNAVAILABLE",
          retryable: true
        });
      }
      return;
    }

    if (
      url.pathname === "/api/admin/notifications/broadcast" &&
      request.method === "POST"
    ) {
      let body = {};
      try {
        body = await readJsonBody(request, 4_000);
      } catch (error) {
        sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 400, {
          ok: false,
          error: error?.code === "BODY_TOO_LARGE"
            ? "Notification payload is too large"
            : "Invalid notification request"
        });
        return;
      }

      const result = await broadcastNotificationService({
        env,
        authorization: request.headers.authorization,
        title: body?.title,
        body: body?.body,
        campaignId: body?.campaignId
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    const requestedPath = url.pathname === "/" ||
      url.pathname === "/auth/callback" ||
      (url.pathname.startsWith("/i/") && parseInviteEventId(url.toString())) ||
      /^\/r\/[a-f0-9]{20}\/?$/i.test(url.pathname)
      ? "/index.html"
      : staticAliases[url.pathname] ?? url.pathname;
    if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
      response.writeHead(405, {
        "content-type": "text/plain; charset=utf-8",
        "allow": "GET, HEAD",
        ...securityHeaders()
      });
      response.end("Method not allowed");
      return;
    }

    // Validate the same canonical URL path that will reach the filesystem.
    // Without this second check, repeated separators such as /src//server/
    // bypassed the raw /src/server/ deny-list and exposed server-only modules.
    const safePath = posix
      .normalize(requestedPath.replaceAll("\\", "/"))
      .replace(/^(\.\.\/)+/, "");
    if (
      !isAllowedStaticPath(requestedPath) ||
      !isAllowedStaticPath(safePath)
    ) {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        ...securityHeaders()
      });
      response.end("Not found");
      return;
    }
    const filePath = join(resolvedRoot, safePath);

    if (
      !filePath.startsWith(`${resolvedRoot}${sep}`) ||
      !existsSync(filePath)
    ) {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        ...securityHeaders()
      });
      response.end("Not found");
      return;
    }

    if (requestedPath === "/index.html" && parseInviteEventId(url.toString())) {
      const template = await readFile(filePath, "utf8");
      const metadataBaseUrl = runtimeConfig.publicUrl || (
        localStateAllowed ? origin : ""
      );
      const metadataUrl = canonicalRequestUrl(metadataBaseUrl, url);
      response.writeHead(200, responseHeadersFor(filePath, requestedPath));
      response.end(metadataUrl
        ? renderInviteDocument(template, metadataUrl)
        : template);
      return;
    }

    try {
      await serveStaticFile(request, response, filePath, requestedPath, {
        cacheAppShell:
          cdnCacheAppShell &&
          url.pathname === "/" &&
          !url.search
      });
    } catch {
      if (!response.headersSent) {
        response.writeHead(404, {
          "content-type": "text/plain; charset=utf-8",
          ...securityHeaders()
        });
        response.end("Not found");
      } else {
        response.destroy();
      }
    }
  }

  return function appHandler(request, response) {
    const requestId = requestCorrelationId(request);
    const requestStartedAt = Date.now();
    let requestCompletionLogged = false;
    const logCompletion = (outcome = "completed") => {
      if (requestCompletionLogged) return;
      requestCompletionLogged = true;
      logApiRequestCompletion(serverRequestLogger, request, response, {
        requestId,
        requestStartedAt,
        outcome
      });
    };
    response.once?.("finish", () => logCompletion("completed"));
    response.once?.("close", () => logCompletion(
      response.writableEnded ? "completed" : "aborted"
    ));
    response.setHeader?.("x-sogrim-request-id", requestId);
    return handleRequest(request, response).catch((error) => {
      try {
        if (error?.code !== "INVALID_HOST") {
          logUnhandledRequestFailure(serverErrorLogger, request, requestId, error);
        }
        handleRequestFailure(response, error, requestId);
      } catch {
        try {
          response.destroy?.();
        } catch {}
      }
    });
  };
}

async function promiseWithTimeout(factory, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Server dependency timed out");
      error.code = "NETWORK_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, Math.max(1, Number(timeoutMs) || DURABLE_RATE_LIMIT_TIMEOUT_MS));
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => factory(controller.signal)),
      timeout
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export default createAppHandler();

if (isDirectRun()) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  const host = resolveServerHost();

  createServer(createAppHandler({ root: defaultRoot, port })).listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
    for (const url of getLanUrls(port)) {
      console.log(`LAN URL: ${url}`);
    }
  });
}

export function resolveServerHost({
  explicitHost = process.argv[3],
  env = process.env
} = {}) {
  const configuredHost = String(explicitHost ?? env.HOST ?? "").trim();
  const deployedRuntime = isDeployedRuntime(env);
  if (configuredHost && (!deployedRuntime || !isLocalHost(configuredHost))) {
    return configuredHost;
  }
  return deployedRuntime ? "0.0.0.0" : "127.0.0.1";
}

function requestOrigin(request, port) {
  const host = String(request.headers.host ?? "").trim();
  if (
    !host ||
    host.length > 255 ||
    /[\s,/@\\?#]/.test(host)
  ) {
    throw invalidHostError();
  }

  let parsed;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    throw invalidHostError();
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw invalidHostError();
  }

  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = ["http", "https"].includes(forwardedProto)
    ? forwardedProto
    : isLocalHost(parsed.hostname) ? "http" : "https";

  parsed.protocol = `${protocol}:`;
  return parsed.origin;
}

function invalidHostError() {
  const error = new Error("Invalid Host header");
  error.code = "INVALID_HOST";
  return error;
}

function applyNativeCors(request, response) {
  const origin = String(request.headers.origin ?? "");
  if (![
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost"
  ].includes(origin)) return;

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, x-sogrim-platform, x-sogrim-app-build, x-sogrim-app-version"
  );
  response.setHeader("vary", "Origin");
}

function isLocalHost(host) {
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    ...securityHeaders()
  });
  response.end(JSON.stringify(payload));
}

function responseHeadersFor(
  filePath,
  requestedPath,
  { cacheAppShell = false } = {}
) {
  const extension = extname(filePath);
  const headers = {
    "content-type": requestedPath.endsWith("apple-app-site-association")
      ? "application/json; charset=utf-8"
      : contentTypes[extension] ?? "application/octet-stream",
    ...securityHeaders()
  };

  if (cacheAppShell && requestedPath === "/index.html") {
    headers["cache-control"] =
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
  } else if (shouldBypassBrowserCache(requestedPath, extension)) {
    headers["cache-control"] = "no-store, max-age=0";
  } else if (requestedPath.startsWith("/assets/")) {
    headers["cache-control"] = "public, max-age=86400, stale-while-revalidate=604800";
  }

  if (extension === ".apk") {
    headers["content-disposition"] = 'attachment; filename="sogrim-hashbon-android-1.2.apk"';
    headers["cache-control"] = "no-store, max-age=0";
  }

  return headers;
}

function isAllowedStaticPath(requestedPath) {
  const value = String(requestedPath ?? "");
  const lowerValue = value.toLowerCase();
  if (
    !value.startsWith("/") ||
    value.includes("\0") ||
    value.split("/").some(
      (segment) =>
        segment === ".." ||
        (segment.startsWith(".") && segment !== ".well-known")
    ) ||
    lowerValue.startsWith("/src/server/")
  ) {
    return false;
  }
  if (publicRootFiles.has(value)) return true;
  if (value === "/downloads/sogrim-hashbon-android-1.2.apk") return true;
  return publicStaticPrefixes.some((prefix) => value.startsWith(prefix)) &&
    publicStaticExtensions.has(extname(value).toLowerCase());
}

function canonicalRequestUrl(baseUrl, requestUrl) {
  if (!baseUrl) return null;
  try {
    const canonical = new URL(baseUrl);
    canonical.pathname = requestUrl.pathname;
    canonical.search = requestUrl.search;
    canonical.hash = "";
    return canonical;
  } catch {
    return null;
  }
}

function handleRequestFailure(response, error, requestId = "") {
  if (response.headersSent) {
    response.destroy?.();
    return;
  }
  const invalidHost = error?.code === "INVALID_HOST";
  sendJson(response, invalidHost ? 400 : 500, {
    ok: false,
    error: invalidHost ? "Invalid Host header" : "Internal server error",
    code: invalidHost ? "INVALID_HOST" : "INTERNAL_SERVER_ERROR",
    ...(requestId ? { requestId } : {})
  });
}

function requestCorrelationId(request) {
  const supplied = String(request?.headers?.["x-sogrim-request-id"] ?? "").trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : randomUUID();
}

function logUnhandledRequestFailure(logger, request, requestId, error) {
  if (typeof logger !== "function") return;
  const requestPath = String(request?.url ?? "/").split("?", 1)[0].slice(0, 512);
  logger("[server] Unhandled request failure", {
    requestId,
    method: String(request?.method ?? "GET").toUpperCase().slice(0, 16),
    path: requestPath || "/",
    error: {
      name: String(error?.name ?? "Error").slice(0, 120),
      code: String(error?.code ?? "").slice(0, 120),
      status: Number(error?.status ?? 0) || 0,
      message: String(error?.message ?? "Unknown server error").slice(0, 500),
      stack: String(error?.stack ?? "").slice(0, 2_000)
    }
  });
}

function logApiRequestCompletion(logger, request, response, {
  requestId,
  requestStartedAt,
  outcome
}) {
  if (typeof logger !== "function") return;
  const requestPath = String(request?.url ?? "/").split("?", 1)[0].slice(0, 512);
  if (!requestPath.startsWith("/api/")) return;
  logger("[server] API request", {
    requestId,
    method: String(request?.method ?? "GET").toUpperCase().slice(0, 16),
    path: requestPath,
    status: Number(response?.statusCode ?? 0) || 0,
    durationMs: Math.max(0, Date.now() - Number(requestStartedAt || Date.now())),
    outcome: outcome === "aborted" ? "aborted" : "completed",
    ...(response.reminderFailure ?? {})
  });
}

export function createRequestRateLimiter(
  now = Date.now,
  { maxClientBuckets = 10_000 } = {}
) {
  const clientBuckets = new Map();
  const globalBuckets = new Map();
  let nextSweepAt = 0;

  function consumeBucket(buckets, key, { limit, windowMs }, maxBuckets) {
    const currentTime = Number(now());
    if (currentTime >= nextSweepAt) {
      for (const bucketMap of [clientBuckets, globalBuckets]) {
        for (const [bucketKey, bucket] of bucketMap) {
          if (bucket.resetAt <= currentTime) bucketMap.delete(bucketKey);
        }
      }
      nextSweepAt = currentTime + windowMs;
    }

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= currentTime) {
      if (!existing && maxBuckets !== null && buckets.size >= maxBuckets) {
        buckets.delete(buckets.keys().next().value);
      }
      buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - currentTime) / 1000)
        )
      };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    consume(key, policy) {
      return consumeBucket(clientBuckets, key, policy, maxClientBuckets);
    },
    consumeGlobal(key, policy) {
      return consumeBucket(globalBuckets, key, policy, null);
    }
  };
}

function consumeVerificationCapacity({
  request,
  response,
  env,
  limiter,
  namespace,
  policy,
  errorMessage = "Too many verification requests"
}) {
  const clientResults = requestRateLimitKeys(request, env).map((key) => limiter.consume(
    `${namespace}:client:${key}`,
    { limit: policy.limit, windowMs: policy.windowMs }
  ));
  const blockedClient = clientResults.find((result) => !result.allowed);
  const globalResult = blockedClient ?? limiter.consumeGlobal(`${namespace}:global`, {
    limit: policy.globalLimit,
    windowMs: policy.windowMs
  });
  const result = blockedClient ?? globalResult;
  if (result.allowed) return true;

  response.setHeader("retry-after", String(result.retryAfterSeconds));
  sendJson(response, 429, {
    ok: false,
    error: errorMessage,
    code: "RATE_LIMITED",
    retryable: true
  });
  return false;
}

function sensitiveApiRateLimitNamespace(pathname, method) {
  const route = `${String(method ?? "GET").toUpperCase()} ${pathname}`;
  const sensitiveRoutes = new Set([
    "DELETE /api/account",
    "POST /api/product-metrics",
    "GET /api/maintenance/retention",
    "GET /api/admin/overview",
    "POST /api/notifications/payment-reminder",
    "POST /api/notifications/event-activity",
    "POST /api/admin/notifications/broadcast",
    "POST /api/event-invites/open-link",
    "POST /api/event-invites/redeem"
  ]);
  if (!sensitiveRoutes.has(route)) return "";
  return `sensitive-api:${route.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
}

function requestRateLimitKeys(request, env) {
  return [`ip:${requestClientAddress(request, env)}`];
}

function durableRateLimitSubjectHashes(request, env) {
  const subjects = [`ip:${requestClientAddress(request, env)}`];
  const authorization = String(request.headers.authorization ?? "").trim();
  if (authorization) subjects.push(`session:${authorization.slice(0, 8192)}`);
  return [...new Set(subjects)].map((subject) =>
    createHash("sha256").update(subject).digest("hex")
  );
}

async function reserveDurableApiRateLimit({
  env,
  namespace,
  subjectHashes,
  policy,
  signal,
  fetchImpl = fetch
}) {
  const supabaseUrl = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ""
  ).trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { available: false, allowed: false, retryAfterSeconds: 1 };
  }

  try {
    const response = await fetchImpl(
      `${supabaseUrl}/rest/v1/rpc/reserve_sensitive_api_capacity`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          p_namespace: namespace,
          p_subject_hashes: subjectHashes,
          p_client_limit: policy.limit,
          p_global_limit: policy.globalLimit,
          p_window_seconds: Math.ceil(policy.windowMs / 1000)
        }),
        signal
      }
    );
    if (!response.ok) {
      return { available: false, allowed: false, retryAfterSeconds: 1 };
    }
    const payload = await response.json().catch(() => null);
    return {
      available: true,
      allowed: payload?.allowed === true,
      retryAfterSeconds: Number(payload?.retryAfterSeconds ?? 0) || 0
    };
  } catch {
    return { available: false, allowed: false, retryAfterSeconds: 1 };
  }
}

function requestClientAddress(request, env) {
  const remoteAddress = normalizedIp(request.socket?.remoteAddress);
  const forwardedAddress = isDeployedRuntime(env)
    ? forwardedClientAddress(request.headers["x-forwarded-for"])
    : "";
  return forwardedAddress || remoteAddress || "unknown";
}

function forwardedClientAddress(value) {
  const addresses = String(value ?? "")
    .split(",")
    .map(normalizedIp)
    .filter(Boolean);
  return addresses[0] ?? "";
}

function normalizedIp(value) {
  const address = String(value ?? "").trim().replace(/^::ffff:/i, "");
  return isIP(address) ? address : "";
}

async function serveStaticFile(
  request,
  response,
  filePath,
  requestedPath,
  responseOptions = {}
) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error("Static path is not a file");
  const extension = extname(filePath);
  const headers = responseHeadersFor(filePath, requestedPath, responseOptions);
  const rangeHeader = request.headers.range;
  const supportsRanges = extension === ".mp4";

  if (supportsRanges) {
    headers["accept-ranges"] = "bytes";
  }

  if (supportsRanges && rangeHeader) {
    const range = parseByteRange(rangeHeader, fileStats.size);
    if (!range) {
      response.writeHead(416, {
        ...headers,
        "content-range": `bytes */${fileStats.size}`,
        "content-length": "0"
      });
      response.end();
      return;
    }

    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      "content-range": `bytes ${range.start}-${range.end}/${fileStats.size}`,
      "content-length": String(contentLength)
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    await pipeline(createReadStream(filePath, range), response);
    return;
  }

  response.writeHead(200, {
    ...headers,
    "content-length": String(fileStats.size)
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  await pipeline(createReadStream(filePath), response);
}

function parseByteRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!match || fileSize <= 0 || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1)
  };
}

function shouldBypassBrowserCache(requestedPath, extension) {
  return (
    requestedPath === "/index.html" ||
    requestedPath === "/sw.js" ||
    extension === ".mjs" ||
    extension === ".js" ||
    extension === ".css"
  );
}

async function readJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  let body = "";
  let bodyBytes = 0;
  for await (const chunk of request) {
    bodyBytes += Buffer.byteLength(chunk);
    if (bodyBytes > maxBytes) {
      const error = new Error("Request body too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    body += chunk;
  }
  return JSON.parse(body);
}

function isTrustedLocalOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function isTrustedLocalRequest(request, origin, env) {
  if (isDeployedRuntime(env) || !isTrustedLocalOrigin(origin)) return false;
  const address = String(request.socket?.remoteAddress ?? "");
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

function isTrustedLocalMutation(request, origin, env) {
  if (!isTrustedLocalRequest(request, origin, env)) return false;
  const browserOrigin = String(request.headers.origin ?? "").trim();
  if (browserOrigin) return browserOrigin === origin;
  const fetchSite = String(request.headers["sec-fetch-site"] ?? "").trim();
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function isDeployedRuntime(env) {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    Boolean(env.VERCEL_ENV) ||
    Boolean(env.RENDER) ||
    Boolean(env.RENDER_SERVICE_ID)
  );
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      "connect-src 'self' https://*.supabase.co https://accounts.google.com",
      "frame-src https://accounts.google.com https://*.supabase.co",
      "manifest-src 'self'",
      "worker-src 'self'"
    ].join("; "),
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin-allow-popups"
  };
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
