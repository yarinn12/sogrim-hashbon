import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
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

export function createAppHandler({
  root = defaultRoot,
  port = Number(process.argv[2] ?? process.env.PORT ?? 4173),
  stateFile = process.env.APP_LOCAL_STATE_FILE,
  googleCredentialVerifier = verifyGoogleCredential,
  accountDeletionService = deleteSupabaseAccount,
  googlePlaySubscriptionVerifier = verifyGooglePlaySubscription,
  paymentReminderService = sendPaymentReminder,
  eventActivityNotificationService = sendEventActivityNotification,
  productMetricsService = storeProductMetrics,
  productMetricsRetentionService = purgeExpiredProductMetrics,
  adminAnalyticsService = getAdminAnalyticsOverview,
  openEventInviteService = manageOpenEventInvite,
  eventInviteRedemptionService = redeemEventInvite
} = {}) {
  const resolvedRoot = resolve(root);
  const resolvedStateFile = stateFile
    ? resolve(resolvedRoot, stateFile)
    : join(resolvedRoot, "data", "app-state.json");
  const stateStore = createStateStore(resolvedStateFile);

  return async function appHandler(request, response) {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const origin = requestOrigin(request, port);
    const runtimeConfig = getRuntimeConfig(process.env, origin);
    const localStateAllowed = isTrustedLocalRequest(request, origin, process.env);
    const localMutationAllowed = isTrustedLocalMutation(
      request,
      origin,
      process.env
    );
    applyNativeCors(request, response);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response.writeHead(204);
      response.end();
      return;
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
      sendJson(response, 200, getHealthPayload(runtimeConfig));
      return;
    }

    if (url.pathname === "/api/auth/google" && request.method === "POST") {
      if (!runtimeConfig.auth?.googleClientId) {
        sendJson(response, 503, { ok: false, error: "Google sign-in is not configured" });
        return;
      }

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
        env: process.env,
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
        env: process.env,
        authorization: request.headers.authorization,
        payload: body
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (url.pathname === "/api/maintenance/retention" && request.method === "GET") {
      const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
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
        env: process.env
      });
      sendJson(response, result.status, result.payload);
      return;
    }

    if (url.pathname === "/api/admin/overview" && request.method === "GET") {
      const result = await adminAnalyticsService({
        runtimeConfig,
        env: process.env,
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
        env: process.env,
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
        env: process.env,
        authorization: request.headers.authorization,
        eventId: body?.eventId,
        transferId: body?.transferId
      });
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
        env: process.env,
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
          env: process.env,
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
          env: process.env,
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
    if (!isAllowedStaticPath(requestedPath)) {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        ...securityHeaders()
      });
      response.end("Not found");
      return;
    }
    const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(resolvedRoot, safePath);

    if (
      !filePath.startsWith(`${resolvedRoot}${sep}`) ||
      !existsSync(filePath)
    ) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    if (requestedPath === "/index.html" && parseInviteEventId(url.toString())) {
      const template = await readFile(filePath, "utf8");
      response.writeHead(200, responseHeadersFor(filePath, requestedPath));
      response.end(renderInviteDocument(
        template,
        new URL(request.url ?? "/", origin)
      ));
      return;
    }

    try {
      await serveStaticFile(request, response, filePath, requestedPath);
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
  };
}

export default createAppHandler();

if (isDirectRun()) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  const host = resolveServerHost();

  createServer(createAppHandler({ root: defaultRoot, port })).listen(port, host, () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
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
  if (configuredHost) return configuredHost;
  return isDeployedRuntime(env) ? "0.0.0.0" : "127.0.0.1";
}

function requestOrigin(request, port) {
  const host = request.headers.host;
  if (!host) return `http://localhost:${port}`;

  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || (isLocalHost(host) ? "http" : "https");

  return `${protocol}://${host}`;
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

function responseHeadersFor(filePath, requestedPath) {
  const extension = extname(filePath);
  const headers = {
    "content-type": requestedPath.endsWith("apple-app-site-association")
      ? "application/json; charset=utf-8"
      : contentTypes[extension] ?? "application/octet-stream",
    ...securityHeaders()
  };

  if (shouldBypassBrowserCache(requestedPath, extension)) {
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
  if (
    !value.startsWith("/") ||
    value.includes("\0") ||
    value.split("/").some((segment) => segment === ".." || segment.startsWith(".")) ||
    value.startsWith("/src/server/")
  ) {
    return false;
  }
  if (publicRootFiles.has(value)) return true;
  if (value === "/downloads/sogrim-hashbon-android-1.2.apk") return true;
  return publicStaticPrefixes.some((prefix) => value.startsWith(prefix)) &&
    publicStaticExtensions.has(extname(value).toLowerCase());
}

async function serveStaticFile(request, response, filePath, requestedPath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error("Static path is not a file");
  const extension = extname(filePath);
  const headers = responseHeadersFor(filePath, requestedPath);
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
