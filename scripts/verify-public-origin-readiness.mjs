import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  LEGACY_PUBLIC_ORIGIN,
  normalizePublicOrigin
} from "../src/domain/publicOrigin.mjs";

const origin = normalizePublicOrigin(
  process.env.APP_PUBLIC_URL || process.env.PUBLIC_APP_ORIGIN,
  LEGACY_PUBLIC_ORIGIN
);
const host = new URL(origin).hostname;
const includeIos = process.argv.includes("--ios");
const checks = [];

const [
  androidManifest,
  nativeBuild,
  localStore,
  indexHtml,
  storeMetadata,
  iosEntitlements
] = await Promise.all([
  readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
  readFile("scripts/build-native-web.mjs", "utf8"),
  readFile("src/data/localStore.mjs", "utf8"),
  readFile("index.html", "utf8"),
  readFile("docs/store-submission/app-store-metadata-he.json", "utf8").then(JSON.parse),
  readFile("ios/App/App/App.entitlements", "utf8")
]);

check("Public origin uses HTTPS", origin.startsWith("https://"));
check(
  "Native build reads APP_PUBLIC_URL",
  nativeBuild.includes("buildEnv.APP_PUBLIC_URL")
);
check(
  "Native runtime reads the configured public origin",
  localStore.includes("runtimePublicOrigin")
);

for (const path of ["/i/", "/r/", "/auth/callback"]) {
  check(
    `Android App Link ${path}`,
    manifestHandles(androidManifest, host, path)
  );
}

check(
  "Open Graph page URL",
  indexHtml.includes(`property="og:url" content="${origin}/"`)
);
check(
  "Open Graph image URL",
  indexHtml.includes(`content="${origin}/sogrim-share-logo.png"`)
);
check(
  "Store support URL",
  storeMetadata.version?.supportUrl === `${origin}/support`
);
check(
  "Store marketing URL",
  storeMetadata.version?.marketingUrl === `${origin}/`
);
check(
  "Store privacy URL",
  storeMetadata.version?.privacyPolicyUrl === `${origin}/privacy`
);

if (includeIos) {
  check(
    "iOS associated domain",
    iosEntitlements.includes(`<string>applinks:${host}</string>`)
  );
  check(
    "Apple association file",
    existsSync(".well-known/apple-app-site-association")
  );
}

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
}
console.log(`\nPublic origin: ${origin}`);
console.log(`${checks.filter((item) => item.ok).length}/${checks.length} checks passed.`);

if (checks.some((item) => !item.ok)) process.exitCode = 1;

function manifestHandles(manifest, expectedHost, pathPrefix) {
  const filters = manifest.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) ?? [];
  return filters.some((filter) =>
    filter.includes('android:autoVerify="true"') &&
    filter.includes(`android:host="${expectedHost}"`) &&
    filter.includes(`android:pathPrefix="${pathPrefix}"`)
  );
}

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}
