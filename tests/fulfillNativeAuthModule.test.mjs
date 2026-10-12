import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fulfillNativeAuthModule, rewriteNativeAuthModule } from "../e2e/helpers/fulfillNativeAuthModule.mjs";

test("native auth fixture fulfills the checkout module when a second loopback fetch would reset", async () => {
  let fulfilled;
  const route = {
    async fetch() { throw new Error("read ECONNRESET"); },
    async fulfill(options) { fulfilled = options; }
  };
  await fulfillNativeAuthModule(route);
  assert.equal(fulfilled.status, 200);
  assert.equal(fulfilled.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(fulfilled.headers["x-content-type-options"], "nosniff");
  assert.equal(fulfilled.headers["cache-control"], "no-store, max-age=0");
  const source = await readFile(new URL("../src/publicAccountAuthLayer.mjs", import.meta.url), "utf8");
  const sdkImport = 'import("@capgo/capacitor-social-login")';
  assert.equal(source.split(sdkImport).length, 2);
  assert.equal(fulfilled.body, source.replace(sdkImport, "Promise.resolve({ SocialLogin: globalThis.__roundtripSocialLogin })"));
});

test("native auth fixture rejects a changed SDK boundary", async () => {
  assert.throws(() => rewriteNativeAuthModule("export const changed = true;"), /SDK boundary/);
  assert.throws(() => rewriteNativeAuthModule('import("@capgo/capacitor-social-login"); import("@capgo/capacitor-social-login")'), /SDK boundary/);
});

test("native auth fixture reports route fulfillment errors", async () => {
  const source = await readFile(new URL("../src/publicAccountAuthLayer.mjs", import.meta.url), "utf8");
  await assert.rejects(fulfillNativeAuthModule({
    async fetch() { return { text: async () => source }; },
    async fulfill() { throw new Error("browser route closed"); }
  }), /browser route closed/);
});
