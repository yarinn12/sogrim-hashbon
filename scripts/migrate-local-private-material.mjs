import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parseEnvFile, resolvePrivateOperatorEnvPath } from "../src/server/envFile.mjs";
import { resolveAndroidSigningPaths } from "./androidSigningConfig.mjs";
import {
  ensurePrivateDirectory,
  readPrivateCredentials,
  resolvePrivateCredentialPath,
  resolvePrivateRoot,
  writePrivateCredentials
} from "./privateMaterial.mjs";

const workspaceRoot = process.cwd();
const privateRoot = resolvePrivateRoot();
const privilegedEnvNames = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "POSTGRES_DATABASE",
  "POSTGRES_HOST",
  "POSTGRES_PASSWORD",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_USER",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64",
  "CRON_SECRET",
  "VERCEL_OIDC_TOKEN"
]);
const credentialEnvNames = new Set([
  "SOGRIM_STORE_REVIEW_EMAIL",
  "SOGRIM_STORE_REVIEW_PASSWORD"
]);
const sanitizedEnvNames = new Set([...privilegedEnvNames, ...credentialEnvNames]);
const envSources = [
  {
    path: join(workspaceRoot, ".env"),
    archiveLabel: "workspace-env",
    operatorPriority: 1
  },
  {
    path: join(workspaceRoot, ".env.local"),
    archiveLabel: "workspace-env-local",
    operatorPriority: 2
  },
  {
    path: join(workspaceRoot, ".vercel", ".env.preview.local"),
    archiveLabel: "vercel-preview",
    operatorPriority: 0
  },
  {
    path: join(workspaceRoot, ".vercel", ".env.production.local"),
    archiveLabel: "vercel-production",
    operatorPriority: 0
  }
].filter(({ path }) => existsSync(path));

if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({
    ok: true,
    mode: "dry-run",
    envFilesToSanitize: envSources.map(({ path }) => path.slice(workspaceRoot.length + 1)),
    legacyAndroidSigningPresent: existsSync(join(workspaceRoot, "android", "keystore.properties")) || existsSync(join(workspaceRoot, "android", "app", "sogrim-upload-key.jks")),
    workspaceQaCredentialsPresent: existsSync(join(workspaceRoot, ".store-review-credentials.json")) || existsSync(join(workspaceRoot, ".invite-qa-credentials.json")),
    applyCommand: "npm run security:migrate-private -- --apply"
  }, null, 2));
  process.exit(0);
}

await ensurePrivateDirectory(privateRoot);
const operatorEnvPath = resolvePrivateOperatorEnvPath();
const existingPrivateEnv = existsSync(operatorEnvPath)
  ? parseEnvFile(readFileSync(operatorEnvPath, "utf8"))
  : {};
const runtimePrivateEnv = {};
const legacyStoreReview = {};
const privateEnvironmentSources = [];

for (const { path: sourcePath, archiveLabel, operatorPriority } of envSources) {
  const parsed = parseEnvFile(readFileSync(sourcePath, "utf8"));
  const archivedValues = Object.fromEntries(
    [...sanitizedEnvNames]
      .map((name) => [name, String(parsed[name] ?? "")])
      .filter(([, value]) => Boolean(value))
  );
  if (Object.keys(archivedValues).length) {
    privateEnvironmentSources.push({ archiveLabel, values: archivedValues });
  }
  if (operatorPriority > 0) {
    for (const name of privilegedEnvNames) {
      const value = String(parsed[name] ?? "");
      if (value) runtimePrivateEnv[name] = value;
    }
    for (const name of credentialEnvNames) {
      const value = String(parsed[name] ?? "");
      if (value) legacyStoreReview[name] = value;
    }
  }
}

const privateEnv = { ...existingPrivateEnv, ...runtimePrivateEnv };

if (Object.keys(existingPrivateEnv).length) {
  privateEnvironmentSources.push({ archiveLabel: "operator-env-before-migration", values: existingPrivateEnv });
}

const environmentArchiveRoot = join(privateRoot, "environment-sources");
for (const { archiveLabel, values } of privateEnvironmentSources) {
  const privateText = serializeEnv(values);
  const archivePath = join(
    environmentArchiveRoot,
    `${archiveLabel}-${createHash("sha256").update(privateText).digest("hex").slice(0, 12)}.env`
  );
  await ensurePrivateDirectory(dirname(archivePath));
  if (existsSync(archivePath) && readFileSync(archivePath, "utf8") !== privateText) {
    throw new Error(`Private environment archive verification failed for ${archiveLabel}.`);
  }
  writeFileSync(archivePath, privateText, { encoding: "utf8", mode: 0o600 });
  await chmod(archivePath, 0o600).catch(() => {});
  if (readFileSync(archivePath, "utf8") !== privateText) {
    throw new Error(`Private environment archive verification failed for ${archiveLabel}.`);
  }
}

if (Object.keys(privateEnv).length) {
  await ensurePrivateDirectory(dirname(operatorEnvPath));
  const privateText = serializeEnv(privateEnv);
  writeFileSync(operatorEnvPath, privateText, { encoding: "utf8", mode: 0o600 });
  await chmod(operatorEnvPath, 0o600).catch(() => {});
  const verifiedPrivateEnv = parseEnvFile(readFileSync(operatorEnvPath, "utf8"));
  for (const [name, value] of Object.entries(privateEnv)) {
    if (verifiedPrivateEnv[name] !== String(value)) {
      throw new Error(`Private environment migration verification failed for ${name}.`);
    }
  }
}

if (legacyStoreReview.SOGRIM_STORE_REVIEW_EMAIL || legacyStoreReview.SOGRIM_STORE_REVIEW_PASSWORD) {
  const existing = readPrivateCredentials("storeReview", { workspaceRoot });
  const incoming = {
    email: legacyStoreReview.SOGRIM_STORE_REVIEW_EMAIL,
    password: legacyStoreReview.SOGRIM_STORE_REVIEW_PASSWORD
  };
  for (const [name, value] of Object.entries(incoming)) {
    if (value && existing[name] && existing[name] !== value) {
      throw new Error(`Private store review migration stopped because ${name} differs.`);
    }
  }
  await writePrivateCredentials("storeReview", {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => Boolean(value)))
  }, { workspaceRoot });
}

const { keystorePath, propertiesPath } = resolveAndroidSigningPaths({ workspaceRoot });
const legacyKeystorePath = join(workspaceRoot, "android", "app", "sogrim-upload-key.jks");
const legacyPropertiesPath = join(workspaceRoot, "android", "keystore.properties");
if (existsSync(legacyKeystorePath) || existsSync(legacyPropertiesPath)) {
  if (!existsSync(legacyKeystorePath) || !existsSync(legacyPropertiesPath)) {
    throw new Error("Android signing migration requires both the legacy JKS and properties file.");
  }
  await Promise.all([
    ensurePrivateDirectory(dirname(keystorePath)),
    ensurePrivateDirectory(dirname(propertiesPath))
  ]);
  copyIfAbsentOrIdentical(legacyKeystorePath, keystorePath);
  const legacyProperties = parseProperties(readFileSync(legacyPropertiesPath, "utf8"));
  for (const required of ["storePassword", "keyAlias", "keyPassword"]) {
    if (!legacyProperties[required]) throw new Error(`Android signing migration is missing ${required}.`);
  }
  const externalProperties = [
    `storeFile=${keystorePath.replaceAll("\\", "/")}`,
    `storePassword=${legacyProperties.storePassword}`,
    `keyAlias=${legacyProperties.keyAlias}`,
    `keyPassword=${legacyProperties.keyPassword}`,
    ""
  ].join("\n");
  if (existsSync(propertiesPath)) {
    const existing = parseProperties(readFileSync(propertiesPath, "utf8"));
    if (
      existing.storePassword !== legacyProperties.storePassword ||
      existing.keyAlias !== legacyProperties.keyAlias ||
      existing.keyPassword !== legacyProperties.keyPassword
    ) {
      throw new Error("Android signing migration stopped because the external credentials differ.");
    }
  }
  writeFileSync(propertiesPath, externalProperties, { encoding: "utf8", mode: 0o600 });
  await chmod(propertiesPath, 0o600).catch(() => {});
}

const privateCredentialMoves = [
  [join(workspaceRoot, ".store-review-credentials.json"), resolvePrivateCredentialPath("storeReview", { workspaceRoot })],
  [join(workspaceRoot, ".invite-qa-credentials.json"), resolvePrivateCredentialPath("inviteQa", { workspaceRoot })]
];
for (const [sourcePath, destinationPath] of privateCredentialMoves) {
  if (!existsSync(sourcePath)) continue;
  await ensurePrivateDirectory(dirname(destinationPath));
  copyIfNewerJson(sourcePath, destinationPath);
  await chmod(destinationPath, 0o600).catch(() => {});
}

restrictWindowsAcl(privateRoot);
restrictWindowsAcl(dirname(keystorePath));
restrictWindowsAcl(dirname(propertiesPath));
restrictWindowsAcl(keystorePath, { directory: false });
restrictWindowsAcl(propertiesPath, { directory: false });

const legacyCoLocatedPropertiesPath = join(
  homedir(),
  ".sogrim-hashbon",
  "android-upload-key",
  "keystore.properties"
);
if (
  existsSync(legacyCoLocatedPropertiesPath) &&
  resolve(legacyCoLocatedPropertiesPath) !== resolve(propertiesPath)
) {
  rmSync(legacyCoLocatedPropertiesPath, { force: true });
}

for (const { path: sourcePath } of envSources) {
  const source = readFileSync(sourcePath, "utf8");
  const sanitized = source
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return !match || !sanitizedEnvNames.has(match[1]);
    })
    .join("\n")
    .replace(/\n*$/, "\n");
  writeFileSync(sourcePath, sanitized, "utf8");
}

for (const path of [legacyKeystorePath, legacyPropertiesPath, ...privateCredentialMoves.map(([source]) => source)]) {
  if (existsSync(path)) rmSync(path, { force: true });
}

console.log(JSON.stringify({
  ok: true,
  migratedEnvironmentNames: [...privilegedEnvNames].filter((name) => Boolean(privateEnv[name])),
  androidSigningMoved: existsSync(keystorePath) && existsSync(propertiesPath),
  storeReviewCredentialsMoved: existsSync(privateCredentialMoves[0][1]),
  inviteQaCredentialsMoved: existsSync(privateCredentialMoves[1][1]),
  workspaceCopiesRemoved: true
}, null, 2));

function copyIfAbsentOrIdentical(sourcePath, destinationPath) {
  if (existsSync(destinationPath)) {
    if (digest(sourcePath) !== digest(destinationPath)) {
      throw new Error("Private material migration stopped because the destination differs.");
    }
    return;
  }
  copyFileSync(sourcePath, destinationPath);
  if (digest(sourcePath) !== digest(destinationPath)) {
    throw new Error("Private material migration verification failed.");
  }
}

function copyIfNewerJson(sourcePath, destinationPath) {
  if (!existsSync(destinationPath)) {
    copyFileSync(sourcePath, destinationPath);
    return;
  }
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const destination = JSON.parse(readFileSync(destinationPath, "utf8"));
  if (!jsonContains(destination, source)) {
    throw new Error("Private credential migration stopped because the destination differs.");
  }
}

function jsonContains(destination, source) {
  if (source === null || typeof source !== "object") return Object.is(destination, source);
  if (Array.isArray(source)) {
    return Array.isArray(destination) &&
      source.length === destination.length &&
      source.every((value, index) => jsonContains(destination[index], value));
  }
  return Boolean(destination && typeof destination === "object") &&
    Object.entries(source).every(([key, value]) => jsonContains(destination[key], value));
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function serializeEnv(values) {
  return `${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(String(value))}`)
    .join("\n")}\n`;
}

function parseProperties(source) {
  return Object.fromEntries(String(source).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function restrictWindowsAcl(path, { directory = true } = {}) {
  if (process.platform !== "win32") return;
  const identity = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join("\\");
  if (!identity) throw new Error("Unable to identify the Windows account for private-directory ACLs.");
  const result = spawnSync("icacls.exe", [
    resolve(path),
    "/inheritance:r",
    "/grant:r",
    directory ? `${identity}:(OI)(CI)F` : `${identity}:F`
  ], { encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error("Unable to restrict the private-directory ACL.");
}
