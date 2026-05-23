import test from "node:test";
import assert from "node:assert/strict";

import { getRuntimeConfig } from "../src/server/runtimeConfig.mjs";

test("getRuntimeConfig stays in local mode without cloud environment values", () => {
  const config = getRuntimeConfig({});

  assert.deepEqual(config.storage, { mode: "local" });
  assert.equal(config.launch.publicUrlReady, false);
  assert.equal(config.launch.cloudStorageReady, false);
  assert.equal(config.launch.shareLinksReady, false);
});

test("getRuntimeConfig enables Supabase mode when public cloud values exist", () => {
  const config = getRuntimeConfig({
    APP_PUBLIC_URL: "https://settle.example.com",
    APP_SPACE_ID: "friends-beta",
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    GOOGLE_CLIENT_ID: "google-client-id"
  });

  assert.deepEqual(config.storage, {
    mode: "supabase",
    url: "https://demo.supabase.co",
    anonKey: "anon-key",
    table: "app_snapshots",
    spaceId: "friends-beta"
  });
  assert.equal(config.publicUrl, "https://settle.example.com");
  assert.equal(config.launch.publicUrlReady, true);
  assert.equal(config.launch.cloudStorageReady, true);
  assert.equal(config.launch.googleAuthReady, true);
  assert.equal(config.launch.shareLinksReady, true);
});

test("getRuntimeConfig does not treat localhost as a public friend link", () => {
  const config = getRuntimeConfig({
    APP_PUBLIC_URL: "http://127.0.0.1:4173",
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key"
  });

  assert.equal(config.launch.publicUrlReady, false);
  assert.equal(config.launch.shareLinksReady, false);
});
