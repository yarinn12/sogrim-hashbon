import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import test from "node:test";

import {
  androidUploadKeyBackupPaths,
  backupAndroidUploadKey
} from "../scripts/androidUploadKeyBackup.mjs";

test("native bridge imports every referenced public-host constant", async () => {
  const bridge = await readFile("src/publicNativeBridgeLayer.mjs", "utf8");
  const deepLinkImport = bridge.match(
    /import\s*\{([\s\S]*?)\}\s*from "\.\/domain\/nativeDeepLinks\.mjs";/
  );

  assert.ok(deepLinkImport, "native deep-link import must remain present");
  assert.match(deepLinkImport[1], /\bNATIVE_PUBLIC_HOST\b/);
  assert.equal(
    bridge.match(/\bNATIVE_PUBLIC_HOST\b/g)?.length,
    3,
    "the imported host must cover the import and both runtime references"
  );
});

test("upload-key backup separates JKS and properties and migrates the legacy copy", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "android-upload-key-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const projectDir = join(sandbox, "project", "android");
  const keystorePath = join(projectDir, "app", "sogrim-upload-key.jks");
  const propertiesPath = join(projectDir, "keystore.properties");
  const properties = [
    "storeFile=app/sogrim-upload-key.jks",
    "storePassword=store-secret",
    "keyAlias=sogrim-upload",
    "keyPassword=key-secret",
    ""
  ].join("\n");

  await mkdir(dirname(keystorePath), { recursive: true });
  await writeFile(keystorePath, "encrypted-jks", "utf8");
  await writeFile(propertiesPath, properties, "utf8");

  const expected = androidUploadKeyBackupPaths({
    homeDir: sandbox,
    keystoreFilename: "sogrim-upload-key.jks",
    propertiesFilename: "keystore.properties"
  });
  await mkdir(expected.keystoreBackupDir, { recursive: true });
  await writeFile(
    expected.legacyPropertiesBackupPath,
    "storePassword=legacy-secret\n",
    "utf8"
  );

  const paths = await backupAndroidUploadKey({
    keystorePath,
    propertiesPath,
    homeDir: sandbox
  });

  assert.equal(await readFile(paths.keystoreBackupPath, "utf8"), "encrypted-jks");
  assert.equal(await readFile(paths.propertiesBackupPath, "utf8"), properties);
  assert.equal(await readFile(propertiesPath, "utf8"), properties);
  await assert.rejects(access(paths.legacyPropertiesBackupPath), { code: "ENOENT" });
  assert.equal(isWithin(paths.keystoreBackupDir, paths.propertiesBackupPath), false);
  assert.equal(isWithin(paths.propertiesBackupDir, paths.keystoreBackupPath), false);
  assert.notEqual(dirname(paths.keystoreBackupPath), dirname(paths.propertiesBackupPath));
});

test("upload-key setup keeps signing material outside the project workspace", async () => {
  const [setup, gradle, signingConfig] = await Promise.all([
    readFile("scripts/setup-android-upload-key.mjs", "utf8"),
    readFile("android/app/build.gradle", "utf8"),
    readFile("scripts/androidSigningConfig.mjs", "utf8")
  ]);

  assert.match(setup, /resolveAndroidSigningPaths\(\{ workspaceRoot: root \}\)/);
  assert.match(setup, /chmod, mkdir, readFile, writeFile/);
  assert.match(setup, /`storeFile=\$\{keystorePath\.replaceAll/);
  assert.match(setup, /`storePassword=\$\{password\}`/);
  assert.match(setup, /`keyPassword=\$\{password\}`/);
  assert.doesNotMatch(setup, /androidRoot.*keystore\.properties/);
  assert.match(signingConfig, /assertOutsideWorkspace\(propertiesPath, workspaceRoot\)/);
  assert.match(signingConfig, /assertOutsideWorkspace\(keystorePath, workspaceRoot\)/);
  assert.match(signingConfig, /assertSeparatedSigningDirectories\(propertiesPath, keystorePath\)/);
  assert.match(gradle, /SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE/);
  assert.doesNotMatch(gradle, /rootProject\.file\('keystore\.properties'\)/);
  assert.match(gradle, /storeFile releaseStoreFile/);
  assert.match(gradle, /pathIsInsideWorkspace/);
  assert.match(gradle, /must use separate private directories/);
});

function isWithin(parentPath, candidatePath) {
  const pathFromParent = relative(parentPath, candidatePath);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}
