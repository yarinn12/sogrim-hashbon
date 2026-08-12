import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("iOS release automation is safe, manual and TestFlight-ready", async () => {
  const [packageJson, workflow, script, workflowEnv, iconScript, submissionCheck, artifactCheck, liveReview, association, appleSecret, csrScript, p12Script, project, info, launchScreen, privacy, metadata, appleSetup, checklist, handoff, accessibility, reviewNotes] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile(".github/workflows/ios-testflight.yml", "utf8"),
    readFile("scripts/prepare-ios-release.mjs", "utf8"),
    readFile("scripts/verify-ios-workflow-env.mjs", "utf8"),
    readFile("scripts/prepare-ios-icon.mjs", "utf8"),
    readFile("scripts/verify-ios-submission.mjs", "utf8"),
    readFile("scripts/verify-ios-artifact.mjs", "utf8"),
    readFile("scripts/verify-ios-review-live.mjs", "utf8"),
    readFile("scripts/setup-apple-association.mjs", "utf8"),
    readFile("scripts/generate-apple-client-secret.mjs", "utf8"),
    readFile("scripts/new-apple-distribution-csr.ps1", "utf8"),
    readFile("scripts/export-apple-distribution-p12.ps1", "utf8"),
    readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8"),
    readFile("ios/App/App/Info.plist", "utf8"),
    readFile("ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8"),
    readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8"),
    readFile("docs/store-submission/app-store-metadata-he.json", "utf8").then(JSON.parse),
    readFile("docs/store-submission/apple-sign-in-setup-he.md", "utf8"),
    readFile("docs/store-submission/apple-connect-checklist-he.md", "utf8"),
    readFile("docs/store-submission/apple-handoff-he.md", "utf8"),
    readFile("docs/store-submission/apple-accessibility-he.md", "utf8"),
    readFile("docs/store-submission/apple-review-notes-en.txt", "utf8")
  ]);

  assert.match(packageJson.scripts["native:ios:prepare-release"], /prepare-ios-release/);
  assert.match(packageJson.scripts["native:ios:flatten-icon"], /prepare-ios-icon\.mjs/);
  assert.doesNotMatch(packageJson.scripts["native:ios:flatten-icon"], /powershell/i);
  assert.match(packageJson.scripts["qa:ios"], /verify-ios-submission/);
  assert.match(packageJson.scripts["qa:ios:artifact"], /verify-ios-artifact/);
  assert.match(packageJson.scripts["qa:ios:review"], /verify-ios-review-live/);
  assert.match(packageJson.scripts["native:ios:apple-secret"], /generate-apple-client-secret/);
  assert.match(packageJson.scripts["native:ios:csr"], /new-apple-distribution-csr/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /Xcode_26\.6\.app/);
  assert.match(workflow, /verify-ios-workflow-env\.mjs/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /build\/ios\/archive\.log/);
  assert.match(workflow, /build\/ios\/export\.log/);
  const jobEnvironment = workflow.slice(
    workflow.indexOf("    env:"),
    workflow.indexOf("    steps:")
  );
  assert.doesNotMatch(jobEnvironment, /secrets\./);
  assert.ok(
    workflow.indexOf("Select and verify Xcode 26.6") < workflow.indexOf("Run release checks"),
    "Xcode must be selected before native release checks"
  );
  assert.match(workflow, /import-codesign-certs@v7/);
  assert.match(workflow, /download-provisioning-profiles@v6/);
  assert.match(workflow, /upload-testflight-build@v5/);
  assert.match(workflow, /Verify signed iOS artifact/);
  assert.match(workflow, /build\/ios\/release-manifest\.json/);
  assert.match(workflow, /app-type: ios/);
  assert.match(workflow, /backend: appstore-api/);
  assert.doesNotMatch(workflow, /backend: AppStoreAPI/);
  assert.match(workflow, /uses-non-exempt-encryption: "false"/);
  assert.doesNotMatch(workflow, /push:/);
  assert.match(workflowEnv, /APPSTORE_CERTIFICATES_FILE_BASE64/);
  assert.match(workflowEnv, /BEGIN PRIVATE KEY/);
  assert.match(workflowEnv, /certificate\[0\] !== 0x30/);
  assert.match(iconScript, /1024x1024/);
  assert.match(iconScript, /source\[25\] !== 2/);
  assert.match(script, /APPLE_TEAM_ID/);
  assert.match(script, /app-store-metadata-he\.json/);
  assert.match(submissionCheck, /Sign in with Apple uses accessible approved artwork/);
  assert.match(submissionCheck, /Apple Team ID is configured in both app build configurations/);
  assert.match(submissionCheck, /Apple Universal Links association matches Team ID/);
  assert.match(submissionCheck, /sign-in-with-apple-iw\.png/);
  assert.match(artifactCheck, /codesign/);
  assert.match(artifactCheck, /embedded\.mobileprovision/);
  assert.match(artifactCheck, /applinks:sogrim-hashbon\.vercel\.app/);
  assert.match(artifactCheck, /release-manifest\.json/);
  assert.match(liveReview, /external\?\.apple === true/);
  assert.match(liveReview, /apple-app-site-association/);
  assert.match(liveReview, /Private App Review account signs in successfully/);
  assert.match(script, /ExportOptions\.generated\.plist/);
  assert.match(script, /"\/i\/\*", "\/r\/\*", "\/auth\/callback"/);
  assert.match(association, /"\/i\/\*", "\/r\/\*", "\/auth\/callback"/);
  assert.match(appleSecret, /dsaEncoding: "ieee-p1363"/);
  assert.match(appleSecret, /180 \* 24 \* 60 \* 60/);
  assert.match(csrScript, /KeyLength = 2048/);
  assert.match(csrScript, /Exportable = TRUE/);
  assert.match(p12Script, /Export-PfxCertificate/);
  assert.match(p12Script, /APPLE_P12_PASSWORD/);
  assert.match(appleSetup, /isdaozthehplneapkfwd\.supabase\.co\/auth\/v1\/callback/);
  assert.match(privacy, /NSPrivacyCollectedDataTypeOtherDiagnosticData/);
  assert.match(checklist, /SOGRIM-HASHBON-IOS-001/);
  assert.match(handoff, /npm\.cmd run qa:ios:review/);
  assert.match(handoff, /ready.*true/s);
  assert.match(accessibility, /Larger Text/);
  assert.match(reviewNotes, /does not hold funds/);
  assert.doesNotMatch(project, /com\.apple\.Push/);
  assert.match(project, /MARKETING_VERSION = 3\.38/);
  assert.match(project, /CURRENT_PROJECT_VERSION = 61/);
  assert.match(info, /UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  assert.match(launchScreen, /contentMode="scaleAspectFit"/);
  assert.doesNotMatch(launchScreen, /contentMode="scaleAspectFill"/);
  assert.equal(metadata.app.bundleId, "com.sogrimhashbon.app");
  assert.ok(Buffer.byteLength(metadata.version.keywords, "utf8") <= 100);
});

test("Apple workflow configuration fails fast without exposing credentials", () => {
  const certificate = Buffer.alloc(600);
  certificate[0] = 0x30;
  const validEnvironment = {
    ...process.env,
    APPLE_TEAM_ID: "TEAMID1234",
    APPSTORE_ISSUER_ID: "12345678-1234-1234-1234-1234567890ab",
    APPSTORE_API_KEY_ID: "APIKEY1234",
    APPSTORE_API_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\nPRIVATE-MARKER\n-----END PRIVATE KEY-----",
    APPSTORE_CERTIFICATES_FILE_BASE64: certificate.toString("base64"),
    APPSTORE_CERTIFICATES_PASSWORD: "PASSWORD-MARKER",
    IOS_VERSION: "3.33",
    IOS_BUILD: "56",
    IOS_RELEASE_NOTES: "TestFlight release"
  };

  const accepted = spawnSync(
    process.execPath,
    [resolve("scripts/verify-ios-workflow-env.mjs")],
    { encoding: "utf8", env: validEnvironment }
  );
  assert.equal(accepted.status, 0, accepted.stderr);

  const rejected = spawnSync(
    process.execPath,
    [resolve("scripts/verify-ios-workflow-env.mjs")],
    {
      encoding: "utf8",
      env: { ...validEnvironment, APPLE_TEAM_ID: "" }
    }
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /APPLE_TEAM_ID is missing or invalid/);
  assert.doesNotMatch(rejected.stderr, /PRIVATE-MARKER|PASSWORD-MARKER/);
});

test("Apple client secret generator creates a valid six-month ES256 token", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sogrim-apple-secret-"));
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256"
  });
  const keyPath = join(directory, "AuthKey_TESTKEY123.p8");
  await writeFile(
    keyPath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [resolve("scripts/generate-apple-client-secret.mjs")],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        APPLE_TEAM_ID: "TEAMID1234",
        APPLE_KEY_ID: "TESTKEY123",
        APPLE_SERVICES_ID: "com.sogrimhashbon.app.web",
        APPLE_PRIVATE_KEY_PATH: keyPath
      }
    }
  );
  assert.equal(result.status, 0, result.stderr);

  const token = (await readFile(join(directory, ".apple-client-secret.txt"), "utf8")).trim();
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(claims.iss, "TEAMID1234");
  assert.equal(claims.sub, "com.sogrimhashbon.app.web");
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.ok(claims.exp - claims.iat <= 180 * 24 * 60 * 60);
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url")
    ),
    true
  );
});
