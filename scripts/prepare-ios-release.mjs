import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(
  await readFile(join(root, "docs", "store-submission", "app-store-metadata-he.json"), "utf8")
);
const teamId = String(process.env.APPLE_TEAM_ID ?? "").trim().toUpperCase();
const version = String(process.env.IOS_VERSION ?? metadata.version.number).trim();
const build = String(process.env.IOS_BUILD ?? metadata.version.build).trim();
const googleClientId = requiredGoogleClientId("GOOGLE_CLIENT_ID");
const googleIosClientId = requiredGoogleClientId("GOOGLE_IOS_CLIENT_ID");

if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error("Set APPLE_TEAM_ID to the 10-character Apple Developer Team ID.");
}
if (!/^\d+(?:\.\d+){1,2}$/.test(version)) {
  throw new Error("IOS_VERSION must contain two or three numeric components.");
}
if (!/^[1-9]\d*$/.test(build)) {
  throw new Error("IOS_BUILD must be a positive integer.");
}
if (googleClientId === googleIosClientId) {
  throw new Error(
    "GOOGLE_IOS_CLIENT_ID must be a separate Google OAuth client of type iOS for com.sogrimhashbon.app."
  );
}

const infoPath = join(root, "ios", "App", "App", "Info.plist");
let info = await readFile(infoPath, "utf8");
info = upsertPlistString(info, "GIDClientID", googleIosClientId);
info = upsertPlistString(info, "GIDServerClientID", googleClientId);
info = upsertGoogleUrlScheme(
  info,
  googleIosClientId.split(".").reverse().join(".")
);
await writeFile(infoPath, info, "utf8");

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

function requiredGoogleClientId(name) {
  const value = String(process.env[name] ?? "").trim();
  if (
    !/^\d{6,}-[A-Za-z0-9][A-Za-z0-9_-]{18,}[A-Za-z0-9]\.apps\.googleusercontent\.com$/.test(value) ||
    /placeholder|example|replace[-_]?me|your[-_]?client/i.test(value)
  ) {
    throw new Error(
      `${name} must be a complete Google OAuth client ID; GOOGLE_IOS_CLIENT_ID must be the iOS client for com.sogrimhashbon.app.`
    );
  }
  return value;
}

function upsertPlistString(source, key, value) {
  const entry = `<key>${key}</key>\n\t<string>${value}</string>`;
  const existing = new RegExp(
    `<key>${key}<\\/key>\\s*<string>[^<]*<\\/string>`
  );
  if (existing.test(source)) return source.replace(existing, entry);
  return source.replace(/\n<\/dict>\s*<\/plist>\s*$/, `\n\t${entry}\n</dict>\n</plist>\n`);
}

function upsertGoogleUrlScheme(source, reversedClientId) {
  const urlSchemes =
    /(<key>CFBundleURLSchemes<\/key>\s*<array>)([\s\S]*?)(<\/array>)/;
  if (!urlSchemes.test(source)) {
    throw new Error("Info.plist is missing CFBundleURLSchemes.");
  }
  return source.replace(urlSchemes, (_match, open, values, close) => {
    const withoutOldGoogleScheme = values.replace(
      /\s*<string>com\.googleusercontent\.apps\.[^<]+<\/string>/g,
      ""
    );
    return `${open}${withoutOldGoogleScheme}\n\t\t\t\t<string>${reversedClientId}</string>\n\t\t\t${close}`;
  });
}

function replaceExactly(source, pattern, replacement, expectedCount) {
  const matches = source.match(pattern) ?? [];
  if (matches.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} project settings but found ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}
