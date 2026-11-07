import { readFile } from "node:fs/promises";

const sdkImport = 'import("@capgo/capacitor-social-login")';
const sdkFixture = "Promise.resolve({ SocialLogin: globalThis.__roundtripSocialLogin })";
const modulePath = new URL("../../src/publicAccountAuthLayer.mjs", import.meta.url);

export function rewriteNativeAuthModule(source) {
  if (source.split(sdkImport).length !== 2) {
    throw new Error("Native auth SDK boundary changed; update the roundtrip fixture");
  }
  return source.replace(sdkImport, sdkFixture);
}

export async function fulfillNativeAuthModule(route) {
  // Read the same checkout file served by the QA server. A second loopback
  // request from route.fetch() can lose its socket during a page reload.
  const source = await readFile(modulePath, "utf8");
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store, max-age=0"
    },
    body: rewriteNativeAuthModule(source)
  });
}
