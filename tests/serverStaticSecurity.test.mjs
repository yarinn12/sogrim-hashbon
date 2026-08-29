import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";

test("the static server exposes only client assets and never repository secrets", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const publicAsset = await fetch(`${baseUrl}/src/app.mjs`);
    assert.equal(publicAsset.status, 200);

    for (const path of [
      "/.env.local",
      "/.env",
      "/server.mjs",
      "/package.json",
      "/src/server/runtimeConfig.mjs",
      "/src/Server/runtimeConfig.mjs",
      "/SRC/SERVER/runtimeConfig.mjs",
      "/src",
      "/data/app-state.json"
    ]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 404, `${path} must stay private`);
    }

    const mutation = await fetch(`${baseUrl}/styles.css`, { method: "POST" });
    assert.equal(mutation.status, 405);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local state APIs reject a spoofed LAN host even from the local server", async () => {
  const handler = createAppHandler({ root: process.cwd(), port: 4173 });
  const response = responseRecorder();
  await handler({
    url: "/api/state",
    method: "GET",
    headers: { host: "192.168.1.50:4173" },
    socket: { remoteAddress: "192.168.1.20" }
  }, response);

  assert.equal(response.statusCode, 503);
});

test("local destructive APIs reject cross-site browser requests", async () => {
  const handler = createAppHandler({ root: process.cwd(), port: 4173 });
  const response = responseRecorder();
  await handler({
    url: "/api/reset",
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site"
    },
    socket: { remoteAddress: "127.0.0.1" }
  }, response);

  assert.equal(response.statusCode, 404);
});

test("network diagnostics are local-only", async () => {
  const handler = createAppHandler({ root: process.cwd(), port: 4173 });
  const response = responseRecorder();
  await handler({
    url: "/api/network",
    method: "GET",
    headers: { host: "app.example" },
    socket: { remoteAddress: "203.0.113.10" }
  }, response);

  assert.equal(response.statusCode, 404);
});

test("malformed Host headers fail inside the async request boundary", async () => {
  const handler = createAppHandler({ root: process.cwd(), port: 4173, env: {} });
  const response = responseRecorder();
  await handler({
    url: "/api/config",
    method: "GET",
    headers: { host: "[" },
    socket: { remoteAddress: "127.0.0.1" }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).code, "INVALID_HOST");
});

test("unexpected server failures carry a safe correlation id and structured log", async () => {
  const logs = [];
  const handler = createAppHandler({
    root: process.cwd(),
    port: 4173,
    env: {},
    adminAnalyticsService: async () => {
      throw new Error("admin overview exploded");
    },
    serverErrorLogger: (...entry) => logs.push(entry)
  });
  const response = responseRecorder();
  await handler({
    url: "/api/admin/overview?days=30&token=must-not-be-logged",
    method: "GET",
    headers: {
      host: "127.0.0.1:4173",
      "x-sogrim-request-id": "qa-request-1234"
    },
    socket: { remoteAddress: "127.0.0.1" }
  }, response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.headers["x-sogrim-request-id"], "qa-request-1234");
  assert.equal(JSON.parse(response.body).requestId, "qa-request-1234");
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[server] Unhandled request failure");
  assert.deepEqual(
    {
      requestId: logs[0][1].requestId,
      method: logs[0][1].method,
      path: logs[0][1].path,
      message: logs[0][1].error.message
    },
    {
      requestId: "qa-request-1234",
      method: "GET",
      path: "/api/admin/overview",
      message: "admin overview exploded"
    }
  );
  assert.doesNotMatch(JSON.stringify(logs), /must-not-be-logged/);
});

test("production API requests emit redacted completion diagnostics", async () => {
  const logs = [];
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    env: { NODE_ENV: "production" },
    serverRequestLogger: (...entry) => logs.push(entry)
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await fetch(`http://127.0.0.1:${port}/api/health?token=must-not-be-logged`, {
      headers: { "x-sogrim-request-id": "qa-request-5678" }
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "[server] API request");
    assert.deepEqual(
      {
        requestId: logs[0][1].requestId,
        method: logs[0][1].method,
        path: logs[0][1].path,
        outcome: logs[0][1].outcome
      },
      {
        requestId: "qa-request-5678",
        method: "GET",
        path: "/api/health",
        outcome: "completed"
      }
    );
    assert.ok(Number.isInteger(logs[0][1].status));
    assert.ok(Number.isInteger(logs[0][1].durationMs));
    assert.doesNotMatch(JSON.stringify(logs), /must-not-be-logged/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production public config and invite metadata never derive from Host", async () => {
  const handler = createAppHandler({
    root: process.cwd(),
    port: 4173,
    env: { NODE_ENV: "production" }
  });
  const configResponse = responseRecorder();
  await handler({
    url: "/api/config",
    method: "GET",
    headers: { host: "attacker.example" },
    socket: { remoteAddress: "203.0.113.10" }
  }, configResponse);
  const config = JSON.parse(configResponse.body);
  assert.equal(config.publicUrl, "");
  assert.equal(config.launch.publicUrlReady, false);

  const inviteResponse = responseRecorder();
  await handler({
    url: "/i/event-token/t/abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456",
    method: "GET",
    headers: { host: "attacker.example" },
    socket: { remoteAddress: "203.0.113.10" }
  }, inviteResponse);
  assert.equal(inviteResponse.statusCode, 200);
  assert.doesNotMatch(inviteResponse.body, /attacker\.example/);
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      Object.assign(this.headers, headers);
    },
    end(body = "") {
      this.body = String(body);
    }
  };
}
