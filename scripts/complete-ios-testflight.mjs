import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createAppStoreClient, completeTestFlightRelease } from "./lib/app-store-release.mjs";

const metadata = JSON.parse(await readFile("docs/store-submission/app-store-metadata-he.json", "utf8"));
const version = process.env.IOS_VERSION;
const build = process.env.IOS_BUILD;
// Older uploads must supply their own notes rather than silently using a later release.
const releaseNotes = process.env.IOS_RELEASE_NOTES || (
  version === metadata.version.number && build === String(metadata.version.build) ? metadata.version.releaseNotes : ""
);
try {
  const result = await completeTestFlightRelease({
    request: createAppStoreClient({
      issuerId: process.env.APPSTORE_ISSUER_ID,
      keyId: process.env.APPSTORE_API_KEY_ID,
      privateKey: process.env.APPSTORE_API_PRIVATE_KEY
    }), version, build, releaseNotes, log: console.log
  });
  await mkdir("build/ios", { recursive: true });
  await writeFile("build/ios/testflight-completion.json", `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`TestFlight ${version} (${build}) is VALID; Hebrew release notes verified.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
