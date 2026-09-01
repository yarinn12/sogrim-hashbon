import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveAndroidJavaHome } from "./androidJava.mjs";
import { resolveAndroidSigningPaths } from "./androidSigningConfig.mjs";
import { ensurePrivateDirectory } from "./privateMaterial.mjs";

const root = process.cwd();
const { keystorePath, propertiesPath } = resolveAndroidSigningPaths({ workspaceRoot: root });
const legacyKeystorePath = join(root, "android", "app", "sogrim-upload-key.jks");
const legacyPropertiesPath = join(root, "android", "keystore.properties");
const associationDir = join(root, ".well-known");
const assetLinksPath = join(associationDir, "assetlinks.json");
const certificatePath = join(root, "docs", "store-submission", "android-upload-certificate-sha256.txt");
const playCertificatePath = join(root, "docs", "store-submission", "android-play-signing-certificate-sha256.txt");
const alias = "sogrim-upload";
const keytool = resolveKeytool();

let password;
if (existsSync(legacyKeystorePath) || existsSync(legacyPropertiesPath)) {
  throw new Error("Legacy Android signing material is still inside the workspace. Run npm run security:migrate-private before configuring or building a release.");
}
if (existsSync(keystorePath) !== existsSync(propertiesPath)) {
  throw new Error("Android signing material is incomplete. Restore the matching key and credentials; a replacement upload key will not be generated.");
}
if (existsSync(keystorePath) && existsSync(propertiesPath)) {
  const properties = parseProperties(await readFile(propertiesPath, "utf8"));
  password = properties.storePassword;
  if (!password) throw new Error("Android keystore properties are incomplete.");
} else {
  password = randomBytes(32).toString("base64url");
  await Promise.all([
    ensurePrivateDirectory(dirname(keystorePath)),
    ensurePrivateDirectory(dirname(propertiesPath))
  ]);
  const result = spawnSync(keytool, [
    "-genkeypair",
    "-v",
    "-keystore", keystorePath,
    "-storetype", "PKCS12",
    "-alias", alias,
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-validity", "10000",
    "-storepass", password,
    "-keypass", password,
    "-dname", "CN=Sogrim Hashbon, OU=Mobile, O=Sogrim Hashbon, L=Tel Aviv, ST=Israel, C=IL"
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Unable to create Android upload key.");
  }

  await writeFile(propertiesPath, [
    `storeFile=${keystorePath.replaceAll("\\", "/")}`,
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    ""
  ].join("\n"), "utf8");
  await Promise.all([
    chmod(keystorePath, 0o600).catch(() => {}),
    chmod(propertiesPath, 0o600).catch(() => {})
  ]);
}

const certificate = spawnSync(keytool, [
  "-J-Duser.language=en",
  "-list",
  "-v",
  "-keystore", keystorePath,
  "-alias", alias,
  "-storepass", password
], { encoding: "utf8" });
if (certificate.status !== 0) {
  throw new Error(certificate.stderr || certificate.stdout || "Unable to inspect Android upload key.");
}

const fingerprint = certificate.stdout.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1]?.toUpperCase();
if (!fingerprint) throw new Error("Unable to read the Android SHA-256 certificate fingerprint.");
const playFingerprint = existsSync(playCertificatePath)
  ? (await readFile(playCertificatePath, "utf8")).trim().toUpperCase()
  : "";
const associationFingerprints = [...new Set([fingerprint, playFingerprint].filter(Boolean))];

await mkdir(associationDir, { recursive: true });
await writeFile(assetLinksPath, `${JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.sogrimhashbon.app",
      sha256_cert_fingerprints: associationFingerprints
    }
  }
], null, 2)}\n`, "utf8");

await mkdir(join(root, "docs", "store-submission"), { recursive: true });
await writeFile(certificatePath, `${fingerprint}\n`, "utf8");

console.log(
  "Android upload key is configured outside the project workspace with separated key and credential paths."
);
console.log(`Public certificate fingerprint: ${fingerprint}`);

function resolveKeytool() {
  const executable = process.platform === "win32" ? "keytool.exe" : "keytool";
  const javaHome = resolveAndroidJavaHome(process.env);
  const candidates = [
    process.env.KEYTOOL_PATH,
    javaHome ? join(javaHome, "bin", executable) : "",
    executable
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-help"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("keytool was not found. Install Android Studio or set JAVA_HOME.");
}

function parseProperties(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
