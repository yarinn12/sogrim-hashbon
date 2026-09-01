import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveAndroidJavaHome } from "./androidJava.mjs";
import { readAndroidSigningConfiguration } from "./androidSigningConfig.mjs";

const root = process.cwd();
const androidRoot = join(root, "android");
const gradle = process.platform === "win32"
  ? join(androidRoot, "gradlew.bat")
  : join(androidRoot, "gradlew");
const apk = join(androidRoot, "app", "build", "outputs", "apk", "release", "app-release.apk");

const signing = readAndroidSigningConfiguration({ workspaceRoot: root });
if (!signing.ready) throw new Error("Android upload key is not configured outside the project workspace. Run npm run native:android:key first.");

const env = { ...process.env };
env.SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE = signing.propertiesPath;
const javaHome = resolveAndroidJavaHome(env);
if (javaHome) env.JAVA_HOME = javaHome;
if (!env.ANDROID_HOME && process.platform === "win32") {
  const bundledSdk = join(homedir(), "AppData", "Local", "Android", "Sdk");
  if (existsSync(bundledSdk)) env.ANDROID_HOME = bundledSdk;
}

const command = process.platform === "win32" ? "cmd.exe" : gradle;
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", gradle, "assembleRelease", "lintRelease"]
  : ["assembleRelease", "lintRelease"];
const result = spawnSync(command, args, {
  cwd: androidRoot,
  env,
  stdio: "inherit",
  shell: false
});

if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(apk)) throw new Error("Android release APK was not created.");

console.log(`Signed Android APK is ready: ${apk}`);
