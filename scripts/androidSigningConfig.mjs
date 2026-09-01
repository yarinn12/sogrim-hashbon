import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { assertOutsideWorkspace } from "./privateMaterial.mjs";

export function resolveAndroidSigningPaths({
  env = process.env,
  workspaceRoot = process.cwd()
} = {}) {
  const propertiesPath = resolve(
    String(env.SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE ?? "").trim() ||
      join(homedir(), ".sogrim-hashbon-secrets", "android-upload-key", "keystore.properties")
  );
  const keystorePath = resolve(
    String(env.SOGRIM_ANDROID_KEYSTORE_FILE ?? "").trim() ||
      join(homedir(), ".sogrim-hashbon", "android-upload-key", "sogrim-upload-key.jks")
  );
  assertOutsideWorkspace(propertiesPath, workspaceRoot);
  assertOutsideWorkspace(keystorePath, workspaceRoot);
  assertSeparatedSigningDirectories(propertiesPath, keystorePath);
  return { propertiesPath, keystorePath };
}

export function readAndroidSigningConfiguration(options = {}) {
  const paths = resolveAndroidSigningPaths(options);
  if (!existsSync(paths.propertiesPath)) return { ...paths, ready: false };
  const properties = parseProperties(readFileSync(paths.propertiesPath, "utf8"));
  const storeFile = String(properties.storeFile ?? "").trim();
  const keystorePath = storeFile
    ? (isAbsolute(storeFile) ? resolve(storeFile) : resolve(dirname(paths.propertiesPath), storeFile))
    : paths.keystorePath;
  assertOutsideWorkspace(keystorePath, options.workspaceRoot ?? process.cwd());
  assertSeparatedSigningDirectories(paths.propertiesPath, keystorePath);
  const ready = Boolean(
    existsSync(keystorePath) &&
    properties.storePassword &&
    properties.keyAlias &&
    properties.keyPassword
  );
  return { ...paths, keystorePath, properties, ready };
}

export function assertSeparatedSigningDirectories(propertiesPath, keystorePath) {
  const propertiesDirectory = canonicalizePath(dirname(propertiesPath));
  const keystoreDirectory = canonicalizePath(dirname(keystorePath));
  const keystoreFromProperties = relative(propertiesDirectory, keystoreDirectory);
  const propertiesFromKeystore = relative(keystoreDirectory, propertiesDirectory);
  const directoriesOverlap = propertiesDirectory === keystoreDirectory ||
    (!keystoreFromProperties.startsWith("..") && !isAbsolute(keystoreFromProperties)) ||
    (!propertiesFromKeystore.startsWith("..") && !isAbsolute(propertiesFromKeystore));
  if (directoriesOverlap) {
    throw new Error("Android keystore and signing credentials must use separate private directories.");
  }
}

function canonicalizePath(path) {
  let current = resolve(path);
  const missingSegments = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missingSegments.unshift(basename(current));
    current = parent;
  }
  const canonicalBase = existsSync(current)
    ? realpathSync.native(current)
    : current;
  return resolve(canonicalBase, ...missingSegments);
}

export function parseProperties(source) {
  return Object.fromEntries(
    String(source)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}
