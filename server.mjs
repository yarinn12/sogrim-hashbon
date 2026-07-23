import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoState } from "./src/data/demoData.mjs";
import { loadEnvFile } from "./src/server/envFile.mjs";
import { getHealthPayload } from "./src/server/health.mjs";
import { renderInviteDocument } from "./src/server/invitePageMetadata.mjs";
import { parseInviteEventId } from "./src/domain/inviteLinks.mjs";
import { parseCompactInviteUrl } from "./src/domain/compactInvite.mjs";
import { deleteSupabaseAccount } from "./src/server/accountDeletion.mjs";
import { verifyGoogleCredential } from "./src/server/googleAuth.mjs";
import { getLanUrls } from "./src/server/networkInfo.mjs";
import { getRuntimeConfig } from "./src/server/runtimeConfig.mjs";
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
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const staticAliases = {
  "/android": "/downloads/sogrim-hashbon-android-1.1.apk",
  "/privacy": "/privacy.html",
  "/support": "/support.html",
  "/terms": "/terms.html",
  "/account-deletion": "/account-deletion.html",
  "/delete-account": "/account-deletion.html"
};
const MAX_JSON_BODY_BYTES = 1_000_000;

export function createAppHandler({
  root = defaultRoot,
  port = Number(process.argv[2] ?? process.env.PORT ?? 4173),
  googleCredentialVerifier = verifyGoogleCredential,
  accountDeletionService = deleteSupabaseAccount
} = {}) {
  const resolvedRoot = resolve(root);
  const stateStore = createStateStore(join(resolvedRoot, "data", "app-state.json"));

  return async function appHandler(request, response) {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const origin = requestOrigin(request, port);
    const runtimeConfig = getRuntimeConfig(process.env, origin);
    const localStateAllowed = isTrustedLocalOrigin(origin) && !isDeployedRuntime(process.env);
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
      if (!localStateAllowed) {
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
      if (!localStateAllowed) {
        sendJson(response, 404, { ok: false, error: "Not found" });
        return;
      }
      await stateStore.save(demoState);
      sendJson(response, 200, await stateStore.load());
      return;
    }

    if (url.pathname === "/api/network" && request.method === "GET") {
      sendJson(response, 200, {
        localUrl: `http://127.0.0.1:${port}`,
        lanUrls: getLanUrls(port)
      });
      return;
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      sendJson(response, 200, runtimeConfig);
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

    const requestedPath = url.pathname === "/" || parseCompactInviteUrl(url)
      ? "/index.html"
      : staticAliases[url.pathname] ?? url.pathname;
    const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(resolvedRoot, safePath);

    if (!filePath.startsWith(resolvedRoot) || !existsSync(filePath)) {
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

    response.writeHead(200, responseHeadersFor(filePath, requestedPath));
    createReadStream(filePath).pipe(response);
  };
}

export default createAppHandler();

if (isDirectRun()) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  const host = process.argv[3] ?? "0.0.0.0";

  createServer(createAppHandler({ root: defaultRoot, port })).listen(port, host, () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
    for (const url of getLanUrls(port)) {
      console.log(`LAN URL: ${url}`);
    }
  });
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
  response.setHeader("access-control-allow-headers", "authorization, content-type");
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
  }

  if (extension === ".apk") {
    headers["content-disposition"] = 'attachment; filename="sogrim-hashbon-android-1.1.apk"';
    headers["cache-control"] = "no-store, max-age=0";
  }

  return headers;
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
    return (
      ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

function isDeployedRuntime(env) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
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
