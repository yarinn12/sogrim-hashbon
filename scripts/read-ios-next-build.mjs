import { mkdir, writeFile } from "node:fs/promises";
import { createReadOnlyAppStoreClient, readIosStoreStatus } from "./lib/app-store-status-readonly.mjs";
try {
  const status = await readIosStoreStatus({ request: createReadOnlyAppStoreClient({
    issuerId: process.env.APPSTORE_ISSUER_ID, keyId: process.env.APPSTORE_API_KEY_ID,
    privateKey: process.env.APPSTORE_API_PRIVATE_KEY
  }) });
  if (status.app?.status !== "read" || status.app.identityVerified !== true ||
      status.builds?.status !== "read" || !/^\d+$/.test(status.builds.highestBuildNumber ?? "")) {
    throw new Error("Build collection unverified");
  }
  const report = {
    checkedAt: new Date().toISOString(), appId: "6809952514", appIdentityVerified: true,
    scope: "GET only; no store changes", highestBuildNumber: status.builds.highestBuildNumber,
    build186Available: BigInt(status.builds.highestBuildNumber) < 186n,
    storeVersion452: status.version452, reviewSubmission: status.submission
  };
  await mkdir("build/ios-next-build", { recursive: true });
  await writeFile("build/ios-next-build/status.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error("Complete scoped Apple build-number collection could not be verified.");
  process.exitCode = 1;
}
