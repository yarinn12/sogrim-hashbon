import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoState } from "./src/data/demoData.mjs";
import { loadEnvFile } from "./src/server/envFile.mjs";
import { getHealthPayload } from "./src/server/health.mjs";
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
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const staticAliases = {
  "/privacy": "/privacy.html",
  "/support": "/support.html",
  "/terms": "/terms.html"
};

export function createAppHandler({
  root = defaultRoot,
  port = Number(process.argv[2] ?? process.env.PORT ?? 4173)
} = {}) {
  const resolvedRoot = resolve(root);
  const stateStore = createStateStore(join(resolvedRoot, "data", "app-state.json"));

  return async function appHandler(request, response) {
    const url = new URL(request.url ?? "/", `http://localhost:${port}`);
    const origin = requestOrigin(request, port);

    if (url.pathname === "/api/state" && request.method === "GET") {
      sendJson(response, 200, await stateStore.load());
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      try {
        const state = await readJsonBody(request);
        await stateStore.save(state);
        sendJson(response, 200, { ok: true });
      } catch {
        sendJson(response, 400, { ok: false, error: "Invalid state payload" });
      }
      return;
    }

    if (url.pathname === "/api/reset" && request.method === "POST") {
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
      sendJson(response, 200, getRuntimeConfig(process.env, origin));
      return;
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, getHealthPayload(getRuntimeConfig(process.env, origin)));
      return;
    }

    const requestedPath = url.pathname === "/"
      ? "/index.html"
      : staticAliases[url.pathname] ?? url.pathname;
    const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(resolvedRoot, safePath);

    if (!filePath.startsWith(resolvedRoot) || !existsSync(filePath)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream"
    });
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

function isLocalHost(host) {
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return JSON.parse(body);
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
