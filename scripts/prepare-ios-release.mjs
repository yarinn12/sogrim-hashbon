import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(
  await readFile(join(root, "docs", "store-submission", "app-store-metadata-he.json"), "utf8")
);
const teamId = String(process.env.APPLE_TEAM_ID ?? "").trim().toUpperCase();
const version = String(process.env.IOS_VERSION ?? metadata.version.number).trim();
const build = String(process.env.IOS_BUILD ?? metadata.version.build).trim();

if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error("Set APPLE_TEAM_ID to the 10-character Apple Developer Team ID.");
}
if (!/^\d+(?:\.\d+){1,2}$/.test(version)) {
  throw new Error("IOS_VERSION must contain two or three numeric components.");
}
if (!/^[1-9]\d*$/.test(build)) {
  throw new Error("IOS_BUILD must be a positive integer.");
}

const projectPath = join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
let project = await readFile(projectPath, "utf8");
project = replaceExactly(project, /CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`, 2);
project = replaceExactly(project, /MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`, 2);
project = project.replace(
  /(CODE_SIGN_STYLE = Automatic;\r?\n)(\s*DEVELOPMENT_TEAM = [A-Z0-9]+;\r?\n)?/g,
  `$1\t\t\t\tDEVELOPMENT_TEAM = ${teamId};\n`
);
if ((project.match(new RegExp(`DEVELOPMENT_TEAM = ${teamId};`, "g")) ?? []).length !== 2) {
  throw new Error("Expected to configure the Apple Team ID in two app build configurations.");
}
await writeFile(projectPath, project, "utf8");

const associationDir = join(root, ".well-known");
await mkdir(associationDir, { recursive: true });
await writeFile(
  join(associationDir, "apple-app-site-association"),
  `${JSON.stringify({
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.com.sogrimhashbon.app`,
          paths: ["/i/*", "/r/*", "/auth/callback"]
        }
      ]
    }
  }, null, 2)}\n`,
  "utf8"
);

const exportOptions = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;
await writeFile(join(root, "ios", "ExportOptions.generated.plist"), exportOptions, "utf8");

console.log(`iOS release ${version} (${build}) is prepared for Apple Team ${teamId}.`);

function replaceExactly(source, pattern, replacement, expectedCount) {
  const matches = source.match(pattern) ?? [];
  if (matches.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} project settings but found ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}
