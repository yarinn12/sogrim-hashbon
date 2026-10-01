import { mkdir, writeFile } from "node:fs/promises";
import { createReadOnlyAppStoreClient, readIosStoreStatus } from "./lib/app-store-status-readonly.mjs";

try {
  const report = await readIosStoreStatus({
    request: createReadOnlyAppStoreClient({
      issuerId: process.env.APPSTORE_ISSUER_ID,
      keyId: process.env.APPSTORE_API_KEY_ID,
      privateKey: process.env.APPSTORE_API_PRIVATE_KEY
    }),
    testerEmail: process.env.APPSTORE_STATUS_TESTER_EMAIL || ""
  });
  const result = {
    checkedAt: new Date().toISOString(),
    candidateSourceSha: "6be4d9f29186d3a4923e76a0bbb6e26259a030fa",
    workflowSourceSha: /^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : null,
    ...report
  };
  await mkdir("build/ios-status", { recursive: true });
  await writeFile("build/ios-status/status.json", `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error("Read-only iOS status report could not be written.");
  process.exitCode = 1;
}
