import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const teamId = String(process.env.APPLE_TEAM_ID ?? "").trim().toUpperCase();
if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error("Set APPLE_TEAM_ID to the 10-character Apple Developer Team ID.");
}

const outputDir = join(process.cwd(), ".well-known");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "apple-app-site-association"), `${JSON.stringify({
  applinks: {
    apps: [],
    details: [
      {
        appID: `${teamId}.com.sogrimhashbon.app`,
        paths: ["*"]
      }
    ]
  }
}, null, 2)}\n`, "utf8");

console.log("Apple universal-link association is ready for deployment.");
