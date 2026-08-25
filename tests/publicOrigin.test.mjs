import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedPublicHosts,
  canonicalizePublicUrl,
  isAllowedPublicUrl,
  PUBLIC_ORIGIN,
  normalizePublicOrigin,
  runtimeApiOrigins,
  runtimePublicOrigin
} from "../src/domain/publicOrigin.mjs";

const LEGACY_ORIGIN = "https://sogrim-hashbon.vercel.app";

test("public origins accept HTTPS hosts without preserving paths or credentials", () => {
  assert.equal(
    normalizePublicOrigin("https://app.sogrim.example/path?private=1"),
    "https://app.sogrim.example"
  );
  assert.equal(normalizePublicOrigin("http://app.sogrim.example"), "");
  assert.equal(normalizePublicOrigin("https://user:secret@app.sogrim.example"), "");
});

test("runtime public origin keeps the live host as a safe migration fallback", () => {
  assert.equal(runtimePublicOrigin({}), PUBLIC_ORIGIN);
  assert.equal(
    runtimePublicOrigin({ publicUrl: "https://app.sogrim.example" }),
    "https://app.sogrim.example"
  );
});

test("legacy production URLs are migrated to the current app without losing their route", () => {
  assert.equal(
    canonicalizePublicUrl(`${LEGACY_ORIGIN}/r/0123456789abcdefabcd?source=gift#share`),
    `${PUBLIC_ORIGIN}/r/0123456789abcdefabcd?source=gift#share`
  );
  assert.equal(runtimePublicOrigin({ publicUrl: LEGACY_ORIGIN }), PUBLIC_ORIGIN);
  assert.equal(allowedPublicHosts(LEGACY_ORIGIN).has("sogrim-hashbon.vercel.app"), false);
});

test("native API origins use only the configured current host", () => {
  assert.deepEqual(runtimeApiOrigins({ publicUrl: "https://app.sogrim.example" }), [
    "https://app.sogrim.example"
  ]);
});

test("native API origins keep a verified bootstrap API ahead of the public host", () => {
  assert.deepEqual(runtimeApiOrigins({
    apiBaseUrl: "https://api.sogrim.example",
    publicUrl: PUBLIC_ORIGIN
  }), [
    "https://api.sogrim.example",
    PUBLIC_ORIGIN
  ]);
});

test("native API origins also migrate the retired host", () => {
  assert.deepEqual(runtimeApiOrigins({
    apiBaseUrl: LEGACY_ORIGIN,
    publicUrl: LEGACY_ORIGIN
  }), [PUBLIC_ORIGIN]);
});

test("public URL validation accepts the configured and current live hosts only", () => {
  const publicUrl = "https://app.sogrim.example";
  assert.ok(allowedPublicHosts(publicUrl).has("app.sogrim.example"));
  assert.equal(isAllowedPublicUrl(`${publicUrl}/i/event/t/token`, publicUrl), true);
  assert.equal(isAllowedPublicUrl(`${PUBLIC_ORIGIN}/privacy`, publicUrl), true);
  assert.equal(
    isAllowedPublicUrl("https://sogrim-hashbon-recovery.onrender.com/i/event/t/token", publicUrl),
    false
  );
  assert.equal(isAllowedPublicUrl("https://evil.example/i/event/t/token", publicUrl), false);
});
