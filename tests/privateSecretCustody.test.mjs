import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";

import { resolveAndroidSigningPaths } from "../scripts/androidSigningConfig.mjs";
import {
  assertOutsideWorkspace,
  readStoreReviewCredentials,
  resolvePrivateCredentialPath
} from "../scripts/privateMaterial.mjs";

const root = process.cwd();
const privilegedNames = [
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
  "VERCEL_OIDC_TOKEN",
  "SOGRIM_STORE_REVIEW_EMAIL",
  "SOGRIM_STORE_REVIEW_PASSWORD"
];

test("private credential and Android signing defaults resolve outside the workspace", () => {
  const storeReview = resolvePrivateCredentialPath("storeReview", { workspaceRoot: root });
  const inviteQa = resolvePrivateCredentialPath("inviteQa", { workspaceRoot: root });
  const signing = resolveAndroidSigningPaths({ workspaceRoot: root });
  for (const path of [storeReview, inviteQa, signing.propertiesPath, signing.keystorePath]) {
    const fromRoot = relative(resolve(root), resolve(path));
    assert.ok(fromRoot.startsWith("..") || isAbsolute(fromRoot));
  }
});

test("private-path overrides fail closed when they point into the workspace", () => {
  assert.throws(
    () => assertOutsideWorkspace(resolve(root, "private.json"), root),
    /outside the project workspace/
  );
});

test("private paths fail closed through directory links and Android signing roots stay separated", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "sogrim-private-boundary-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const workspaceLink = join(sandbox, "workspace-link");
  await symlink(root, workspaceLink, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => assertOutsideWorkspace(join(workspaceLink, "credentials.json"), root),
    /outside the project workspace/
  );
  assert.throws(
    () => resolveAndroidSigningPaths({
      workspaceRoot: root,
      env: {
        SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE: join(sandbox, "signing", "keystore.properties"),
        SOGRIM_ANDROID_KEYSTORE_FILE: join(sandbox, "signing", "upload.jks")
      }
    }),
    /separate private directories/
  );
  const physicalSigningDirectory = join(sandbox, "physical-signing");
  const propertiesAlias = join(sandbox, "properties-alias");
  const keystoreAlias = join(sandbox, "keystore-alias");
  await mkdir(physicalSigningDirectory);
  await symlink(
    physicalSigningDirectory,
    propertiesAlias,
    process.platform === "win32" ? "junction" : "dir"
  );
  await symlink(
    physicalSigningDirectory,
    keystoreAlias,
    process.platform === "win32" ? "junction" : "dir"
  );
  assert.throws(
    () => resolveAndroidSigningPaths({
      workspaceRoot: root,
      env: {
        SOGRIM_ANDROID_SIGNING_PROPERTIES_FILE: join(propertiesAlias, "keystore.properties"),
        SOGRIM_ANDROID_KEYSTORE_FILE: join(keystoreAlias, "upload.jks")
      }
    }),
    /separate private directories/
  );
});

test("store review checks trust only the external credential file", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "sogrim-store-review-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const credentialPath = join(sandbox, "review.json");
  await writeFile(credentialPath, JSON.stringify({
    email: "review@example.com",
    password: "stored-password",
    userId: "review-user"
  }), "utf8");
  const credentials = readStoreReviewCredentials({
    workspaceRoot: root,
    env: {
      SOGRIM_STORE_REVIEW_CREDENTIALS_FILE: credentialPath,
      SOGRIM_STORE_REVIEW_EMAIL: "injected@example.com",
      SOGRIM_STORE_REVIEW_PASSWORD: "injected-password"
    }
  });
  assert.equal(credentials.email, "review@example.com");
  assert.equal(credentials.password, "stored-password");
});

test("workspace contains no private credentials, signing key or populated privileged env entries", async () => {
  for (const path of [
    ".store-review-credentials.json",
    ".invite-qa-credentials.json",
    "android/keystore.properties",
    "android/app/sogrim-upload-key.jks"
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, `${path} must remain outside the workspace`);
  }

  for (const path of [".env.local", ".env", ".vercel/.env.preview.local", ".vercel/.env.production.local"]) {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) continue;
    const source = await readFile(absolutePath, "utf8");
    for (const name of privilegedNames) {
      assert.doesNotMatch(source, new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*\\S+`, "m"));
    }
  }
});

test("QA setup and verification use the external private-material boundary", async () => {
  const files = await Promise.all([
    readFile("scripts/setup-store-review-account.mjs", "utf8"),
    readFile("scripts/setup-invite-qa-account.mjs", "utf8"),
    readFile("scripts/verify-android-user-journey.mjs", "utf8"),
    readFile("scripts/verify-ios-review-live.mjs", "utf8")
  ]);
  for (const source of files) {
    assert.doesNotMatch(source, /resolve\("\.(?:store-review|invite-qa)-credentials\.json"\)/);
    assert.doesNotMatch(source, /join\(root, "\.(?:store-review|invite-qa)-credentials\.json"\)/);
  }

  const workConsumers = [
    "work/check-korea-orphan-payment-status.mjs",
    "work/diagnose-korea-profile-write.mjs",
    "work/verify-korea-profile-boundary.mjs",
    "work/verify-korea-invite-stability.mjs",
    "work/repair-korea-orphan-payment-status.mjs",
    "work/probe-korea-invite-api.mjs"
  ];
  for (const path of workConsumers) {
    if (!existsSync(path)) continue;
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /readFile\("\.invite-qa-credentials\.json"/);
  }
});

test("private migration preserves every privileged source before sanitizing it", async () => {
  const source = await readFile("scripts/migrate-local-private-material.mjs", "utf8");
  assert.match(source, /"FIREBASE_SERVICE_ACCOUNT_JSON"/);
  assert.doesNotMatch(source, /isProviderCache\s*\|\||name === "VERCEL_OIDC_TOKEN"/);
  assert.match(source, /verifiedPrivateEnv/);
  assert.match(source, /environment-sources/);
  assert.match(source, /vercel-preview/);
  assert.match(source, /vercel-production/);
  assert.match(source, /operator-env-before-migration/);
  assert.match(source, /const privateEnv = \{ \.\.\.existingPrivateEnv, \.\.\.runtimePrivateEnv \}/);
  assert.match(source, /jsonContains\(destination, source\)/);
  assert.match(source, /credentialEnvNames/);
});
