import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getHealthPayload } from "../src/server/health.mjs";

test("getHealthPayload exposes deployment readiness without secrets", () => {
  const payload = getHealthPayload({
    storage: { mode: "supabase", anonKey: "secret" },
    launch: {
      publicUrlReady: true,
      cloudStorageReady: true,
      googleAuthReady: false,
      shareLinksReady: true
    }
  });

  assert.deepEqual(payload, {
    ok: true,
    storageMode: "supabase",
    publicUrlReady: true,
    cloudStorageReady: true,
    googleAuthReady: false,
    shareLinksReady: true
  });
});

test("server exposes a health endpoint and loads local env files", async () => {
  const server = await readFile("server.mjs", "utf8");

  assert.match(server, /loadEnvFile/);
  assert.match(server, /getHealthPayload/);
  assert.match(server, /"\/api\/health"/);
});
