import test from "node:test";
import assert from "node:assert/strict";
import { nativeRuntimeCompatibility } from "../src/domain/nativeRuntimeCompatibility.mjs";

function runtimeConfig(overrides = {}) {
  return {
    storage: {
      mode: "supabase",
      url: "https://project.supabase.co",
      anonKey: "public-key"
    },
    updates: {
      android: {
        minimumSupportedBuild: 80,
        currentBuild: 83,
        required: false,
        storeUrl: "https://play.google.com/store/apps/details?id=com.sogrimhashbon.app"
      }
    },
    ...overrides
  };
}

test("native bootstrap accepts a release-aware cloud runtime", () => {
  assert.deepEqual(
    nativeRuntimeCompatibility(runtimeConfig(), { expectedAndroidBuild: 83 }),
    { ok: true, reason: "" }
  );
});

test("native bootstrap rejects a stale server without an update policy", () => {
  const config = runtimeConfig({ updates: undefined });
  assert.match(
    nativeRuntimeCompatibility(config, { expectedAndroidBuild: 83 }).reason,
    /update policy is missing/
  );
});

test("native bootstrap rejects a server that scoped a different build", () => {
  const config = runtimeConfig();
  config.updates.android.currentBuild = 82;
  assert.match(
    nativeRuntimeCompatibility(config, { expectedAndroidBuild: 83 }).reason,
    /does not match the current build/
  );
});

test("web bootstrap validation remains compatible without a native build", () => {
  assert.equal(nativeRuntimeCompatibility(runtimeConfig()).ok, true);
});
