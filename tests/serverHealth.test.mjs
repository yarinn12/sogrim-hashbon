import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { getHealthPayload } from "../src/server/health.mjs";
import { createAppHandler, resolveServerHost } from "../server.mjs";

test("getHealthPayload exposes deployment readiness without secrets", () => {
  const payload = getHealthPayload({
    storage: { mode: "supabase", anonKey: "secret" },
    launch: {
      publicUrlReady: true,
      cloudStorageReady: true,
      googleAuthReady: false,
      authEmailDeliveryReady: false,
      accountDeletionReady: true,
      googlePlayBillingReady: false,
      shareLinksReady: true
    }
  });

  assert.deepEqual(payload, {
    ok: true,
    storageMode: "supabase",
    publicUrlReady: true,
    cloudStorageReady: true,
    googleAuthReady: false,
    authEmailDeliveryReady: false,
    accountDeletionReady: true,
    googlePlayBillingReady: false,
    pushDeliveryReady: false,
    shareLinksReady: true
  });
});

test("server exposes a health endpoint and loads local env files", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /loadEnvFile/);
  assert.match(server, /getHealthPayload/);
  assert.match(server, /"\/api\/health"/);
  assert.match(server, /"\/api\/account"/);
});

test("production health fails closed when a required launch dependency is missing", () => {
  const payload = getHealthPayload(
    {
      storage: { mode: "local" },
      launch: {
        publicUrlReady: true,
        cloudStorageReady: false,
        googleAuthReady: true,
        authEmailDeliveryReady: false,
        accountDeletionReady: false,
        shareLinksReady: false
      }
    },
    { requireProductionReadiness: true }
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.storageMode, "local");
});

test("the recovery server permits verified files under .well-known", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/.well-known/assetlinks.json`
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

test("server binds containers publicly while keeping local development private", () => {
  assert.equal(resolveServerHost({ env: {} }), "127.0.0.1");
  assert.equal(
    resolveServerHost({ env: { NODE_ENV: "production" } }),
    "0.0.0.0"
  );
  assert.equal(
    resolveServerHost({ env: { RENDER: "true" } }),
    "0.0.0.0"
  );
  assert.equal(
    resolveServerHost({
      env: { NODE_ENV: "production", HOST: "127.0.0.1" }
    }),
    "0.0.0.0"
  );
  assert.equal(
    resolveServerHost({ explicitHost: "10.0.0.4", env: {} }),
    "10.0.0.4"
  );
});

test("public deployments block legacy shared-state mutation endpoints", async () => {
  const previousPublicUrl = process.env.APP_PUBLIC_URL;
  const previousVercel = process.env.VERCEL;
  process.env.APP_PUBLIC_URL = "https://sogrim-hesbon-app.vercel.app";
  process.env.VERCEL = "1";
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { host: "sogrim-hesbon-app.vercel.app", "x-forwarded-proto": "https" }
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=31536000; includeSubDomains"
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), microphone=(), geolocation=()"
    );
    const contentSecurityPolicy = response.headers.get("content-security-policy") ?? "";
    assert.match(contentSecurityPolicy, /default-src 'self'/);
    assert.match(contentSecurityPolicy, /object-src 'none'/);
    assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  } finally {
    if (previousPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previousPublicUrl;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
