import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateIosPushPublicConfig } from "./lib/ios-push-public-config.mjs";

const options = {};
const allowed = new Set(["--root", "--config", "--android-config", "--out"]);
let argumentsValid = true;
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i];
  const value = process.argv[i + 1];
  if (!allowed.has(flag) || !value || value.startsWith("--") || flag in options) {
    argumentsValid = false;
    break;
  }
  options[flag] = value;
}
const empty = (code) => ({
  schemaVersion: 1, valid: false, errors: [{ code }], publicIdentity: null,
  scope: "Public project and app identity only",
  apnsConfigurationVerified: false, nativeBuildVerified: false, pushDeliveryVerified: false
});
async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}
let report;
let exitCode = 1;
if (!argumentsValid) {
  report = empty("INVALID_ARGUMENTS");
  exitCode = 2;
} else if (!options["--config"]) {
  report = empty("IOS_CONFIG_MISSING");
} else {
  const root = resolve(options["--root"] || process.cwd());
  let capacitor, android;
  try {
    [capacitor, android] = await Promise.all([
      readJson(resolve(root, "capacitor.config.json")),
      readJson(resolve(options["--android-config"] || resolve(root, "android/app/google-services.json")))
    ]);
  } catch {
    report = empty("EXPECTED_CONFIG_UNAVAILABLE");
  }
  if (!report) {
    const expected = {
      bundleId: capacitor?.appId,
      projectId: android?.project_info?.project_id,
      projectNumber: android?.project_info?.project_number
    };
    const packageMatches = Array.isArray(android?.client) && android.client.some(
      (client) => client?.client_info?.android_client_info?.package_name === expected.bundleId
    );
    if (!packageMatches) {
      report = empty("ANDROID_PACKAGE_MISMATCH");
    } else {
      try {
        const config = await readJson(resolve(options["--config"]));
        report = validateIosPushPublicConfig(config, expected);
      } catch {
        report = empty("IOS_CONFIG_UNAVAILABLE");
      }
    }
  }
  if (report.valid) exitCode = 0;
}
const serialized = JSON.stringify(report, null, 2) + "\n";
if (options["--out"] && argumentsValid) {
  try { await writeFile(resolve(options["--out"]), serialized, "utf8"); }
  catch { console.error("Public configuration receipt could not be written"); process.exitCode = 1; }
}
console.log(serialized.trimEnd());
process.exitCode = process.exitCode || exitCode;
