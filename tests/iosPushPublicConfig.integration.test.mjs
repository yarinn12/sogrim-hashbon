import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateIosPushPublicConfig } from "../scripts/lib/ios-push-public-config.mjs";

const expected = { projectId: "synthetic-trip-project", projectNumber: "1234567890", bundleId: "com.synthetic.trip" };
const validConfig = () => ({
  PROJECT_ID: expected.projectId, GCM_SENDER_ID: expected.projectNumber,
  BUNDLE_ID: expected.bundleId, GOOGLE_APP_ID: "1:1234567890:ios:syntheticapp"
});
async function fixture(t) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, "ios-push-config-"));
  t.after(async () => {
    const ownedName = relative(parent, resolve(root));
    assert.ok(!isAbsolute(ownedName) && /^ios-push-config-[^/\\\\]+$/.test(ownedName));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "android/app"), { recursive: true });
  await writeFile(join(root, "capacitor.config.json"), JSON.stringify({ appId: expected.bundleId }));
  const androidFile = join(root, "android/app/google-services.json");
  const android = { project_info: { project_id: expected.projectId, project_number: expected.projectNumber },
    client: [{ client_info: { android_client_info: { package_name: expected.bundleId } } }] };
  await writeFile(androidFile, JSON.stringify(android));
  const config = join(root, "ios-public.json");
  await writeFile(config, JSON.stringify(validConfig()));
  const invoke = (args = []) => {
    const result = spawnSync(process.execPath, [resolve("scripts/verify-ios-push-public-config.mjs"),
      "--root", root, ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(result.error, undefined);
    return { ...result, report: JSON.parse(result.stdout) };
  };
  return { root, config, androidFile, android, invoke };
}

test("matching public iOS identity is accepted without claiming APNs, native build or delivery", async (t) => {
  const f = await fixture(t), receipt = join(f.root, "receipt.json");
  const result = f.invoke(["--config", f.config, "--out", receipt]);
  assert.equal(result.status, 0);
  assert.equal(result.report.valid, true);
  assert.equal(result.report.publicIdentity.firebaseIosAppId, validConfig().GOOGLE_APP_ID);
  for (const key of ["apnsConfigurationVerified", "nativeBuildVerified", "pushDeliveryVerified"]) {
    assert.equal(result.report[key], false);
  }
  assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), result.report);
});

for (const [field, value, code] of [
  ["PROJECT_ID", "other-project", "FIREBASE_PROJECT_MISMATCH"],
  ["GCM_SENDER_ID", "999999999", "FIREBASE_SENDER_MISMATCH"],
  ["BUNDLE_ID", "com.other.app", "IOS_BUNDLE_MISMATCH"],
  ["GOOGLE_APP_ID", "1:1234567890:android:syntheticapp", "IOS_FIREBASE_APP_ID_INVALID"],
  ["GOOGLE_APP_ID", "1:999999999:ios:syntheticapp", "IOS_FIREBASE_APP_ID_INVALID"]
]) test(`mismatched ${field} is rejected at the CLI boundary (${code})`, async (t) => {
  const f = await fixture(t);
  await writeFile(f.config, JSON.stringify({ ...validConfig(), [field]: value }));
  const result = f.invoke(["--config", f.config]);
  assert.equal(result.status, 1);
  assert.equal(result.report.valid, false);
  assert.ok(result.report.errors.some(error => error.code === code));
  assert.equal(result.report.publicIdentity, null);
});

for (const field of ["PROJECT_ID", "GCM_SENDER_ID", "BUNDLE_ID", "GOOGLE_APP_ID"]) {
  test(`missing or non-string ${field} cannot be accepted as configured`, () => {
    for (const value of [undefined, null, 123, "", [], {}]) {
      const result = validateIosPushPublicConfig({ ...validConfig(), [field]: value }, expected);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(error => error.field === field));
    }
  });
}

test("missing iOS configuration fails closed without inferring an app id from Android", async (t) => {
  const f = await fixture(t), result = f.invoke();
  assert.equal(result.status, 1);
  assert.equal(result.report.errors[0].code, "IOS_CONFIG_MISSING");
  assert.equal(result.report.publicIdentity, null);
});

test("malformed input and unrelated fields never leak their values into console or receipt", async (t) => {
  const f = await fixture(t), secret = "SYNTHETIC_PRIVATE_VALUE_DO_NOT_EMIT", receipt = join(f.root, "out.json");
  await writeFile(f.config, JSON.stringify({ ...validConfig(), API_KEY: secret, private_key: secret }));
  const accepted = f.invoke(["--config", f.config, "--out", receipt]);
  assert.equal(accepted.status, 0);
  assert.equal((accepted.stdout + accepted.stderr + await readFile(receipt, "utf8")).includes(secret), false);
  await writeFile(f.config, '{ "private_key": "' + secret);
  const rejected = f.invoke(["--config", f.config, "--out", receipt]);
  assert.equal(rejected.status, 1);
  assert.equal((rejected.stdout + rejected.stderr + await readFile(receipt, "utf8")).includes(secret), false);
});

test("a missing or different Android package cannot supply a trusted project identity", async (t) => {
  const f = await fixture(t);
  f.android.client[0].client_info.android_client_info.package_name = "com.other.android";
  await writeFile(f.androidFile, JSON.stringify(f.android));
  const result = f.invoke(["--config", f.config]);
  assert.equal(result.status, 1);
  assert.equal(result.report.errors[0].code, "ANDROID_PACKAGE_MISMATCH");
});

test("missing expected configuration and unknown or repeated flags fail closed", async (t) => {
  const f = await fixture(t);
  await rm(f.androidFile);
  const missing = f.invoke(["--config", f.config]);
  assert.equal(missing.status, 1);
  assert.equal(missing.report.errors[0].code, "EXPECTED_CONFIG_UNAVAILABLE");
  for (const args of [["--enable-anyway", "1"], ["--config", f.config, "--config", f.config]]) {
    const result = f.invoke(args);
    assert.equal(result.status, 2);
    assert.equal(result.report.errors[0].code, "INVALID_ARGUMENTS");
  }
});
