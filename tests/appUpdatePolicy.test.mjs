import test from "node:test";
import assert from "node:assert/strict";
import { decideNativeUpdate } from "../src/domain/appUpdatePolicy.mjs";

const play = "https://play.google.com/store/apps/details?id=com.sogrimhashbon.app";
const apple = "https://apps.apple.com/il/app/sogrim-hashbon/id1234567890";

function policy(overrides = {}) {
  return {
    latestAvailableBuild: 188, minimumSupportedBuild: 0,
    releaseAvailableToAll: true, critical: false, storeUrl: play,
    ...overrides
  };
}

test("a verified native release is optional and can be deferred for its build", () => {
  assert.equal(decideNativeUpdate("android", 187, policy()).kind, "optional");
  assert.equal(decideNativeUpdate("android", 187, policy(), { deferredBuild: 188 }).kind, "none");
  assert.equal(decideNativeUpdate("android", 187, policy({ latestAvailableBuild: 189 }), { deferredBuild: 188 }).kind, "optional");
  assert.equal(decideNativeUpdate("android", 188, policy()).kind, "none");
});

test("critical blocking requires an explicit critical decision and verified full availability", () => {
  const critical = policy({ minimumSupportedBuild: 188, critical: true });
  assert.equal(decideNativeUpdate("android", 187, critical).kind, "required");
  assert.equal(decideNativeUpdate("android", 187, critical, { deferredBuild: 188 }).kind, "required");
  assert.equal(decideNativeUpdate("android", 187, { ...critical, critical: false }).kind, "optional");
  assert.equal(decideNativeUpdate("android", 187, { ...critical, releaseAvailableToAll: false }).kind, "none");
  assert.equal(decideNativeUpdate("android", 187, { ...critical, latestAvailableBuild: 187 }).kind, "none");
  assert.equal(decideNativeUpdate("android", 187,
    { ...critical, latestAvailableBuild: 188, minimumSupportedBuild: 189 }).kind, "none");
});

test("iOS needs its own verified store URL and build; web and PWA never go to a store", () => {
  const ios = policy({ storeUrl: apple, latestAvailableBuild: 5, minimumSupportedBuild: 5, critical: true });
  assert.equal(decideNativeUpdate("ios", 4, ios).kind, "required");
  assert.equal(decideNativeUpdate("ios", 0, ios).kind, "none");
  assert.equal(decideNativeUpdate("ios", 4, { ...ios, storeUrl: "" }).kind, "none");
  assert.equal(decideNativeUpdate("android", 187, { ...policy(), storeUrl: apple }).kind, "none");
  assert.equal(decideNativeUpdate("web", 4, ios).kind, "none");
});

test("unsynced work defers both kinds of update without changing their policy", () => {
  assert.equal(decideNativeUpdate("android", 187, policy(), { unsafeWork: true }).kind, "deferred");
  assert.equal(decideNativeUpdate("android", 187,
    policy({ minimumSupportedBuild: 188, critical: true }), { unsafeWork: true }).kind, "deferred");
});
