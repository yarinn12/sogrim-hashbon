import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedPublicHosts,
  isAllowedPublicUrl,
  LEGACY_PUBLIC_ORIGIN,
  normalizePublicOrigin,
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
  assert.equal(runtimePublicOrigin({}), LEGACY_PUBLIC_ORIGIN);
  assert.equal(
    runtimePublicOrigin({ publicUrl: "https://app.sogrim.example" }),
    "https://app.sogrim.example"
  );
});

test("public URL validation accepts the configured and legacy hosts only", () => {
  const publicUrl = "https://app.sogrim.example";
  assert.ok(allowedPublicHosts(publicUrl).has("app.sogrim.example"));
  assert.equal(isAllowedPublicUrl(`${publicUrl}/i/event/t/token`, publicUrl), true);
  assert.equal(isAllowedPublicUrl(`${LEGACY_PUBLIC_ORIGIN}/privacy`, publicUrl), true);
  assert.equal(isAllowedPublicUrl("https://evil.example/i/event/t/token", publicUrl), false);
});
