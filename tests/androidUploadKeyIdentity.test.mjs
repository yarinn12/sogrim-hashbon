import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const UPLOAD_CERTIFICATE = Array(32).fill("A1").join(":");
const PLAY_CERTIFICATE = Array(32).fill("B2").join(":");
const OTHER_CERTIFICATE = Array(32).fill("C3").join(":");
const SCRIPT_FILES = [
  "setup-android-upload-key.mjs",
  "androidSigningConfig.mjs",
  "androidJava.mjs",
  "privateMaterial.mjs",
  "build-android-release.mjs",
  "build-android-apk.mjs",
  "release-source-fingerprint.mjs"
];

for (const identity of ["upload", "play"]) {
  test(`missing external material cannot replace an existing documented ${identity} identity`, async (t) => {
    const fixture = await createFixture(t, {
      uploadCertificate: identity === "upload" ? UPLOAD_CERTIFICATE : null,
      playCertificate: identity === "play" ? PLAY_CERTIFICATE : null
    });
    const before = await publicIdentitySnapshot(fixture);

    const result = runScript(fixture, "setup-android-upload-key.mjs");

    assert.equal(existsSync(fixture.keystorePath), false, "an existing app must not bootstrap another upload key");
    assert.equal(existsSync(fixture.propertiesPath), false);
    assert.deepEqual(await toolOperations(fixture), [], "refuse before calling keytool");
    assert.deepEqual(await publicIdentitySnapshot(fixture), before);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /existing Android signing identity/i);
    assert.match(result.stderr, /Restore the original upload key/i);
  });
}

test("a different restored key cannot overwrite the documented upload identity", async (t) => {
  const fixture = await createFixture(t, {
    uploadCertificate: UPLOAD_CERTIFICATE,
    playCertificate: PLAY_CERTIFICATE,
    externalKey: true,
    externalProperties: true,
    toolCertificate: OTHER_CERTIFICATE
  });
  const before = await publicIdentitySnapshot(fixture);

  const result = runScript(fixture, "setup-android-upload-key.mjs");

  assert.deepEqual(await publicIdentitySnapshot(fixture), before);
  assert.equal(await readFile(fixture.keystorePath, "utf8"), "synthetic existing keystore\n");
  assert.equal((await toolOperations(fixture)).includes("-genkeypair"), false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the documented upload certificate/i);
});

test("restoring the matching key preserves an existing app's documented identity", async (t) => {
  const fixture = await createFixture(t, {
    uploadCertificate: UPLOAD_CERTIFICATE,
    playCertificate: PLAY_CERTIFICATE,
    externalKey: true,
    externalProperties: true
  });
  const before = await publicIdentitySnapshot(fixture);
  const propertiesBefore = await readFile(fixture.propertiesPath, "utf8");

  const result = runScript(fixture, "setup-android-upload-key.mjs");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await publicIdentitySnapshot(fixture), before);
  assert.equal(await readFile(fixture.propertiesPath, "utf8"), propertiesBefore);
  assert.equal(await readFile(fixture.keystorePath, "utf8"), "synthetic existing keystore\n");
  assert.equal((await toolOperations(fixture)).includes("-genkeypair"), false);
});

test("an app without a recorded signing identity can still bootstrap its first upload key", async (t) => {
  const fixture = await createFixture(t);

  const result = runScript(fixture, "setup-android-upload-key.mjs");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(fixture.keystorePath, "utf8"), "synthetic generated keystore\n");
  assert.equal(existsSync(fixture.propertiesPath), true);
  assert.equal(await readFile(fixture.uploadCertificatePath, "utf8"), `${UPLOAD_CERTIFICATE}\n`);
  const links = JSON.parse(await readFile(fixture.assetLinksPath, "utf8"));
  assert.equal(links[0].target.package_name, "com.sogrimhashbon.app");
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [UPLOAD_CERTIFICATE]);
  assert.equal((await toolOperations(fixture)).filter((operation) => operation === "-genkeypair").length, 1);
});

for (const missing of ["key", "properties"]) {
  test(`an incomplete external pair with missing ${missing} requires recovery`, async (t) => {
    const fixture = await createFixture(t, {
      uploadCertificate: UPLOAD_CERTIFICATE,
      externalKey: missing !== "key",
      externalProperties: missing !== "properties"
    });
    const before = await publicIdentitySnapshot(fixture);

    const result = runScript(fixture, "setup-android-upload-key.mjs");

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Restore the matching key and credentials/i);
    assert.equal(existsSync(fixture.keystorePath), missing !== "key");
    assert.equal(existsSync(fixture.propertiesPath), missing !== "properties");
    assert.equal((await toolOperations(fixture)).includes("-genkeypair"), false);
    assert.deepEqual(await publicIdentitySnapshot(fixture), before);
  });
}

for (const script of ["build-android-release.mjs", "build-android-apk.mjs"]) {
  test(`${script} directs a missing-key operator to recovery before any build`, async (t) => {
    const fixture = await createFixture(t, { uploadCertificate: UPLOAD_CERTIFICATE });
    const before = await publicIdentitySnapshot(fixture);

    const result = runScript(fixture, script);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Restore the original upload key/i);
    assert.match(result.stderr, /new app without a recorded signing identity/i);
    assert.deepEqual(await toolOperations(fixture), [], "no Gradle or keytool process may run");
    assert.equal(existsSync(join(fixture.projectRoot, "android", "app", "build")), false);
    assert.deepEqual(await publicIdentitySnapshot(fixture), before);
  });
}

async function createFixture(t, options = {}) {
  const sandbox = await mkdtemp(join(tmpdir(), "sogrim-android-key-identity-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const fixture = {
    projectRoot: join(sandbox, "app"),
    keystorePath: join(sandbox, "keys", "upload.jks"),
    propertiesPath: join(sandbox, "credentials", "keystore.properties"),
    toolLog: join(sandbox, "tool-operations.jsonl"),
    preload: join(sandbox, "synthetic-keytool.mjs"),
    toolCertificate: options.toolCertificate ?? UPLOAD_CERTIFICATE
  };
  const scriptsDir = join(fixture.projectRoot, "scripts");
  const submissionDir = join(fixture.projectRoot, "docs", "store-submission");
  fixture.uploadCertificatePath = join(submissionDir, "android-upload-certificate-sha256.txt");
  fixture.playCertificatePath = join(submissionDir, "android-play-signing-certificate-sha256.txt");
  fixture.assetLinksPath = join(fixture.projectRoot, ".well-known", "assetlinks.json");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(submissionDir, { recursive: true });
  await mkdir(dirname(fixture.assetLinksPath), { recursive: true });
  await mkdir(join(fixture.projectRoot, "android", "app"), { recursive: true });
  await Promise.all(SCRIPT_FILES.map((name) => copyFile(resolve("scripts", name), join(scriptsDir, name))));
  await writeFile(join(fixture.projectRoot, "android", "app", "build.gradle"), 'versionCode 1\nversionName "1.0"\n', "utf8");
  if (options.uploadCertificate) {
    await writeFile(fixture.uploadCertificatePath, `${options.uploadCertificate}\n`, "utf8");
  }
  if (options.playCertificate) {
    await writeFile(fixture.playCertificatePath, `${options.playCertificate}\n`, "utf8");
  }
  const certificates = [options.uploadCertificate, options.playCertificate].filter(Boolean);
  if (certificates.length) {
    await writeFile(fixture.assetLinksPath, `${JSON.stringify([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.sogrimhashbon.app",
        sha256_cert_fingerprints: certificates
      }
    }], null, 2)}\n`, "utf8");
  }
  if (options.externalKey) {
    await mkdir(dirname(fixture.keystorePath), { recursive: true });
    await writeFile(fixture.keystorePath, "synthetic existing keystore\n", "utf8");
  }
  if (options.externalProperties) {
    await mkdir(dirname(fixture.propertiesPath), { recursive: true });
    await writeFile(fixture.propertiesPath, [
      `storeFile=${fixture.keystorePath.replaceAll("\\", "/")}`,
      "storePassword=synthetic-fixture-password",
      "keyAlias=sogrim-upload",
      "keyPassword=synthetic-fixture-password",
      ""
    ].join("\n"), "utf8");
  }
  // Replace child-process calls in the subprocess, without running keytool or
  // generating a real key. syncBuiltinESMExports also updates named imports.
  await writeFile(fixture.preload, `
import childProcess from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
childProcess.spawnSync = (_command, args) => {
  const operation = ["-help", "-genkeypair", "-list"].find((name) => args.includes(name));
  if (!operation) throw new Error("Unexpected process in synthetic signing fixture");
  appendFileSync(process.env.SOGRIM_TEST_TOOL_LOG, JSON.stringify(operation) + "\\n");
  if (operation === "-genkeypair") {
    writeFileSync(args[args.indexOf("-keystore") + 1], "synthetic generated keystore\\n");
  }
  return { status: 0, stdout: operation === "-list"
    ? "SHA256: " + process.env.SOGRIM_TEST_PUBLIC_CERTIFICATE + "\\n" : "", stderr: "" };
};
syncBuiltinESMExports();
`, "utf8");
  return fixture;
}

function runScript(fixture, script) {
  const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TMPDIR", "TEMP", "TMP"]
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]));
  return spawnSync(process.execPath, ["--import", pathToFileURL(fixture.preload).href, join(fixture.projectRoot, "scripts", script)], {
    cwd: fixture.projectRoot,
    env: {
      ...env,
      KEYTOOL_PATH: "synthetic-keytool",
      SOGRIM_ANDROID_KEYSTORE_FILE: fixture.keystorePath,
      SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE: fixture.propertiesPath,
      SOGRIM_TEST_TOOL_LOG: fixture.toolLog,
      SOGRIM_TEST_PUBLIC_CERTIFICATE: fixture.toolCertificate
    },
    encoding: "utf8"
  });
}

async function toolOperations(fixture) {
  if (!existsSync(fixture.toolLog)) return [];
  return (await readFile(fixture.toolLog, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function publicIdentitySnapshot(fixture) {
  return Promise.all([fixture.uploadCertificatePath, fixture.playCertificatePath, fixture.assetLinksPath]
    .map((path) => existsSync(path) ? readFile(path, "utf8") : null));
}
