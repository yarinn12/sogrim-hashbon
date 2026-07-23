import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { getHealthPayload } from "../src/server/health.mjs";
import { createAppHandler } from "../server.mjs";

test("getHealthPayload exposes deployment readiness without secrets", () => {
  const payload = getHealthPayload({
    storage: { mode: "supabase", anonKey: "secret" },
    launch: {
      publicUrlReady: true,
      cloudStorageReady: true,
      googleAuthReady: false,
      accountDeletionReady: true,
      shareLinksReady: true
    }
  });

  assert.deepEqual(payload, {
    ok: true,
    storageMode: "supabase",
    publicUrlReady: true,
    cloudStorageReady: true,
    googleAuthReady: false,
    accountDeletionReady: true,
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

test("public deployments block legacy shared-state mutation endpoints", async () => {
  const previousPublicUrl = process.env.APP_PUBLIC_URL;
  const previousVercel = process.env.VERCEL;
  process.env.APP_PUBLIC_URL = "https://sogrim-hashbon.vercel.app";
  process.env.VERCEL = "1";
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { host: "sogrim-hashbon.vercel.app", "x-forwarded-proto": "https" }
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  } finally {
    if (previousPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previousPublicUrl;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
