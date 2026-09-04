import assert from "node:assert/strict";
import test from "node:test";
import { isWebKitReloadDiagnostic } from "../e2e/helpers/reloadDiagnostics.mjs";

const origin = "https://egress-cache-test.supabase.co";
const error = { name: "Fetch API cannot load https", stack: `Fetch API cannot load ${origin}/rest/v1/app_snapshots due to access control checks.\n    at unknown (fetchTimeout.mjs:40:23)` };
const context = { origin, browserName: "webkit", reloading: true };
test("the browser diagnostic classifier accepts only the explicit old-document reload window", () => {
  assert.equal(isWebKitReloadDiagnostic(error, context), true);
  assert.equal(isWebKitReloadDiagnostic(error, { ...context, reloading: false }), false);
});
test("ordinary application exceptions remain failures even during a reload", () => {
  assert.equal(isWebKitReloadDiagnostic(new TypeError("Unable to save"), context), false);
  assert.equal(isWebKitReloadDiagnostic({ ...error, name: "Unhandled Promise Rejection" }, context), false);
});
test("access errors outside the synthetic backend are not exempted", () => {
  assert.equal(isWebKitReloadDiagnostic(error, { ...context, origin: "https://different.supabase.co" }), false);
  assert.equal(isWebKitReloadDiagnostic(error, { ...context, browserName: "chromium" }), false);
});
