import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const root = process.cwd();
const androidRoot = join(root, "android");
const keystorePath = join(androidRoot, "app", "sogrim-upload-key.jks");
const propertiesPath = join(androidRoot, "keystore.properties");
const associationDir = join(root, ".well-known");
const assetLinksPath = join(associationDir, "assetlinks.json");
const certificatePath = join(root, "docs", "store-submission", "android-upload-certificate-sha256.txt");
const backupDir = join(homedir(), ".sogrim-hashbon", "android-upload-key");
const alias = "sogrim-upload";
const keytool = resolveKeytool();

let password;
if (existsSync(keystorePath) && existsSync(propertiesPath)) {
  const properties = parseProperties(await readFile(propertiesPath, "utf8"));
  password = properties.storePassword;
  if (!password) throw new Error("Android keystore properties are incomplete.");
} else {
  password = randomBytes(32).toString("base64url");
  await mkdir(join(androidRoot, "app"), { recursive: true });
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
    `storeFile=app/${basename(keystorePath)}`,
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    ""
  ].join("\n"), "utf8");
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

await mkdir(associationDir, { recursive: true });
await writeFile(assetLinksPath, `${JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.sogrimhashbon.app",
      sha256_cert_fingerprints: [fingerprint]
    }
  }
], null, 2)}\n`, "utf8");

await mkdir(join(root, "docs", "store-submission"), { recursive: true });
await writeFile(certificatePath, `${fingerprint}\n`, "utf8");

await mkdir(backupDir, { recursive: true });
await copyFile(keystorePath, join(backupDir, basename(keystorePath)));
await copyFile(propertiesPath, join(backupDir, basename(propertiesPath)));

console.log("Android upload key is configured and backed up outside the project.");
console.log(`Public certificate fingerprint: ${fingerprint}`);

function resolveKeytool() {
  const executable = process.platform === "win32" ? "keytool.exe" : "keytool";
  const candidates = [
    process.env.KEYTOOL_PATH,
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", executable) : "",
    process.platform === "win32"
      ? join("C:\\Program Files\\Android\\Android Studio\\jbr\\bin", executable)
      : "",
    executable
  ].filter(Boolean);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-help"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("keytool was not found. Install Android Studio or set JAVA_HOME.");
}

function parseProperties(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
