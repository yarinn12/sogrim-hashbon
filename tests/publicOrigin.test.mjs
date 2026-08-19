import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedPublicHosts,
  isAllowedPublicUrl,
  PUBLIC_ORIGIN,
  normalizePublicOrigin,
  RECOVERY_PUBLIC_ORIGIN,
  runtimeApiOrigins,
  runtimePublicOrigin
} from "../src/domain/publicOrigin.mjs";

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

test("native API origins keep the public host first and add the recovery host", () => {
  assert.deepEqual(runtimeApiOrigins({ publicUrl: "https://app.sogrim.example" }), [
    "https://app.sogrim.example",
    RECOVERY_PUBLIC_ORIGIN
  ]);
});

test("native API origins keep a verified bootstrap API ahead of the public host", () => {
  assert.deepEqual(runtimeApiOrigins({
    apiBaseUrl: RECOVERY_PUBLIC_ORIGIN,
    publicUrl: PUBLIC_ORIGIN
  }), [
    RECOVERY_PUBLIC_ORIGIN,
    PUBLIC_ORIGIN
  ]);
});

test("public URL validation accepts the configured and legacy hosts only", () => {
  const publicUrl = "https://app.sogrim.example";
  assert.ok(allowedPublicHosts(publicUrl).has("app.sogrim.example"));
  assert.ok(allowedPublicHosts(publicUrl).has(new URL(RECOVERY_PUBLIC_ORIGIN).hostname));
  assert.equal(isAllowedPublicUrl(`${publicUrl}/i/event/t/token`, publicUrl), true);
  assert.equal(isAllowedPublicUrl(`${PUBLIC_ORIGIN}/privacy`, publicUrl), true);
  assert.equal(isAllowedPublicUrl("https://evil.example/i/event/t/token", publicUrl), false);
});
