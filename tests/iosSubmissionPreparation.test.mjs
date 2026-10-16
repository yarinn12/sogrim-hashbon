import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";


function assertManualSigningDisabled(raw) {
  const workflow = raw.replace(/\r\n/g, "\n");
  const triggers = workflow.split("\non:\n")[1]?.split("\npermissions:")[0];
  const jobs = workflow.split("\njobs:\n")[1];
  assert.ok(triggers && jobs, "legacy signing triggers and jobs must be inspectable");
  assert.deepEqual(triggers.match(/^  [a-zA-Z0-9_-]+:$/gm), ["  workflow_dispatch:"]);
  assert.deepEqual(jobs.match(/^  [a-zA-Z0-9_-]+:$/gm), ["  build-export-verify-private:"]);
  assert.match(jobs, /^  build-export-verify-private:\n    if: github\.event_name != 'workflow_dispatch'\n/m);
}

function assertPrivateSigningContract(raw) {
  const workflow = raw.replace(/\r\n/g, "\n");
  const required = token => {
    const index = workflow.indexOf(token);
    assert.ok(index >= 0, "missing private signing boundary: " + token);
    return index;
  };
  const steps = workflow.split(/(?=^      - )/m).filter(step => /^      - /.test(step));
  for (const phase of ["ci-only", "before-build", "after-export"]) {
    const command = new RegExp('^        run: node "[^"\\n]+/source-guard\\.mjs" ' + phase + '$', "m");
    const found = steps.filter(step => command.test(step));
    assert.equal(found.length, 1, "source guard must execute once: " + phase);
    assert.doesNotMatch(found[0], /^        (?:if|continue-on-error):/m,
      "source proof cannot be bypassed by a conditional or ignored failure");
  }
  assert.ok(required('source-guard.mjs" ci-only') < required("secrets.APPSTORE_"),
    "all four source CI lanes must be checked before Apple keys");
  assert.ok(required('source-guard.mjs" before-build') < required("clean archive"));
  assert.ok(required("npm ci") < required("npm run native:prepare"));
  assert.ok(required("npm run native:prepare") < required("clean archive"));
  assert.ok(required("clean archive") < required("-exportArchive"));
  assert.ok(required("-exportArchive") < required("npm run qa:ios:artifact"));
  assert.ok(required("npm run qa:ios:artifact") < required('source-guard.mjs" after-export'));
  assert.ok(required('source-guard.mjs" after-export') < required('verify-web-assets.py" verify'));
  assert.ok(required('verify-web-assets.py" verify') < required('protect-artifact.mjs" encrypt'));
  assert.match(workflow, /IOS_PROVISIONING_PROFILE: "Sogrim Hashbon App Store 2026"/);
  assert.match(workflow, /grep -x export/, "IPA export must not upload");
  assert.match(workflow, /app\/build\/ios\/private-artifact\/release\.tar\.enc/);
  assert.match(workflow, /app\/build\/ios\/private-artifact\/envelope\.json/);
  assert.doesNotMatch(workflow, /upload-testflight-build|complete-ios-testflight|appStoreVersionReleaseRequest/);
  assert.doesNotMatch(workflow, /continue-on-error/);
}

let signingGuardPromise;
async function signingGuard() {
  signingGuardPromise ??= (async () => {
    const url = new URL("../scripts/qa/ios-signing/source-guard.mjs", import.meta.url);
    const text = await readFile(url, "utf8");
    const source = text.match(/export const RELEASE_SOURCE = '([0-9a-f]{40})'/)?.[1];
    assert.match(source ?? "", /^[0-9a-f]{40}$/);
    const prior = process.env.SOURCE_SHA;
    process.env.SOURCE_SHA = source; // Synthetic import context only; no guard CLI or API is invoked.
    try { return await import(url.href); }
    finally {
      if (prior === undefined) delete process.env.SOURCE_SHA;
      else process.env.SOURCE_SHA = prior;
    }
  })();
  return signingGuardPromise;
}

test("private iOS signing remains source-gated, encrypted-artifact-only and separate from intake", async () => {
  const [packageJson, workflow, oneShot, intakeWorkflow, script, workflowEnv, iconScript, submissionCheck, artifactCheck, liveReview, association, appleSecret, csrScript, p12Script, project, info, appDelegate, launchScreen, privacy, metadata, appleSetup, checklist, handoff, accessibility, reviewNotes, exampleEnv] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile(".github/workflows/ios-testflight.yml", "utf8"),
    readFile(".github/workflows/ios194-2cf-reliable-sign-only.yml", "utf8"),
    readFile("scripts/qa/ios-signing/intake-workflow-template.yml", "utf8"),
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
    readFile("ios/App/App/AppDelegate.swift", "utf8"),
    readFile("ios/App/App/Base.lproj/LaunchScreen.storyboard", "utf8"),
    readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8"),
    readFile("docs/store-submission/app-store-metadata-he.json", "utf8").then(JSON.parse),
    readFile("docs/store-submission/apple-sign-in-setup-he.md", "utf8"),
    readFile("docs/store-submission/apple-connect-checklist-he.md", "utf8"),
    readFile("docs/store-submission/apple-handoff-he.md", "utf8"),
    readFile("docs/store-submission/apple-accessibility-he.md", "utf8"),
    readFile("docs/store-submission/apple-review-notes-en.txt", "utf8"),
    readFile(".env.example", "utf8")
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
  assert.match(workflow, /default: "4\.58"/);
  assert.match(workflow, /default: "194"/, "the private candidate overrides historical tooling metadata build193");
  assertManualSigningDisabled(workflow);
  for (const definition of [workflow, oneShot]) assertPrivateSigningContract(definition);
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /Xcode_26\.6\.app/);
  assert.match(workflow, /verify-ios-workflow-env\.mjs/);
  assert.match(workflow, /concurrency:/);
  assert.match(intakeWorkflow, /if: always\(\)/, "intake retains its metadata evidence on failure");
  assert.match(workflow, /build\/ios\/archive\.log/);
  assert.match(workflow, /build\/ios\/export\.log/);
  const jobEnvironment = workflow.slice(
    workflow.indexOf("    env:"),
    workflow.indexOf("    steps:")
  );
  assert.doesNotMatch(jobEnvironment, /secrets\./);
  assert.match(jobEnvironment, /GOOGLE_CLIENT_ID: \$\{\{ vars\.GOOGLE_CLIENT_ID \}\}/);
  assert.match(jobEnvironment, /GOOGLE_IOS_CLIENT_ID: \$\{\{ vars\.GOOGLE_IOS_CLIENT_ID \}\}/);
  assert.match(exampleEnv, /^GOOGLE_IOS_CLIENT_ID=$/m);
  assert.ok(
    workflow.indexOf("Select and verify Xcode 26.6") < workflow.indexOf("Build web assets and prepare the native project from the pinned checkout"),
    "Xcode must be selected before native release checks"
  );
  assert.match(workflow, /import-codesign-certs@v7/);
  assert.match(workflow, /download-provisioning-profiles@v6/);
  assert.match(intakeWorkflow, /upload-testflight-build@v5/);
  assert.match(workflow, /Verify signed iOS artifact/);
  assert.match(workflow, /-C build\/ios/);
  assert.match(workflow, /SogrimHashbon\.ipa release-manifest\.json artifact-verification\.json/);
  assert.match(intakeWorkflow, /app-type: ios/);
  assert.match(intakeWorkflow, /backend: appstore-api/);
  assert.doesNotMatch(intakeWorkflow, /backend: AppStoreAPI/);
  assert.doesNotMatch(intakeWorkflow, /^\s*uses-non-exempt-encryption:/m,
    "Apple rejects a second encryption declaration after reading it from the signed app");
  assert.match(info, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/);
  assert.match(submissionCheck, /check\("Export compliance is declared"/);
  assert.match(intakeWorkflow, /wait-for-processing: ['"]false['"]/,
    "The upload action must not retain its expired token during processing");
  assert.match(intakeWorkflow, /run: node scripts\/complete-ios-testflight\.mjs/,
    "A required completion step must still verify Apple's processing result and notes");
  assert.ok(intakeWorkflow.indexOf("Verify Apple processing and complete TestFlight notes") > intakeWorkflow.indexOf("Upload the same original IPA to TestFlight"));
  assert.doesNotMatch(intakeWorkflow, /continue-on-error/,
    "Failed processing or unsaved notes must fail the release");
  assert.doesNotMatch(workflow, /push:/);
  assert.doesNotMatch(workflow, /^  (?:pull_request|pull_request_target|schedule):/m);
  assert.match(workflowEnv, /APPSTORE_CERTIFICATES_FILE_BASE64/);
  assert.match(workflowEnv, /GOOGLE_IOS_CLIENT_ID/);
  assert.match(workflowEnv, /BEGIN PRIVATE KEY/);
  assert.match(workflowEnv, /certificate\[0\] !== 0x30/);
  assert.match(iconScript, /1024x1024/);
  assert.match(iconScript, /source\[25\] !== 2/);
  assert.match(script, /APPLE_TEAM_ID/);
  assert.match(script, /requiredGoogleClientId\("GOOGLE_IOS_CLIENT_ID"\)/);
  assert.match(script, /GIDClientID/);
  assert.match(script, /GIDServerClientID/);
  assert.match(script, /upsertGoogleUrlScheme/);
  assert.match(script, /app-store-metadata-he\.json/);
  assert.match(submissionCheck, /Sign in with Apple uses accessible approved artwork/);
  assert.match(submissionCheck, /Apple Team ID is configured in both app build configurations/);
  assert.match(submissionCheck, /Apple Universal Links association matches Team ID/);
  assert.match(submissionCheck, /Native Google sign-in plugin is included for iOS/);
  assert.match(submissionCheck, /Google iOS reversed client URL scheme is configured/);
  assert.match(appDelegate, /import GoogleSignIn/);
  const googleCallbackIndex = appDelegate.indexOf(
    "GIDSignIn.sharedInstance.handle(url)"
  );
  const capacitorCallbackIndex = appDelegate.indexOf(
    "ApplicationDelegateProxy.shared.application(app, open: url, options: options)"
  );
  assert.ok(googleCallbackIndex >= 0, "Google must receive its iOS callback URL");
  assert.ok(
    capacitorCallbackIndex > googleCallbackIndex,
    "Google must handle its callback before Capacitor receives unmatched URLs"
  );
  assert.match(submissionCheck, /Native launch screen hands directly to the web intro without a logo flash/);
  assert.doesNotMatch(submissionCheck, /scaleAspectFit/);
  assert.match(submissionCheck, /sign-in-with-apple-iw\.png/);
  assert.match(artifactCheck, /codesign/);
  assert.match(artifactCheck, /embedded\.mobileprovision/);
  assert.match(artifactCheck, /applinks:sogrim-hesbon-app\.vercel\.app/);
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
  assert.match(project, new RegExp(`MARKETING_VERSION = ${metadata.version.number.replaceAll(".", "\\.")}`));
  assert.match(project, new RegExp(`CURRENT_PROJECT_VERSION = ${metadata.version.build}`));
  assert.match(info, /UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  assert.match(launchScreen, /<view key="view" contentMode="scaleToFill"/);
  assert.match(launchScreen, /<color key="backgroundColor" white="1"/);
  assert.doesNotMatch(launchScreen, /image="Splash"|<image name="Splash"/);
  assert.equal(metadata.app.bundleId, "com.sogrimhashbon.app");
  assert.ok(Buffer.byteLength(metadata.version.keywords, "utf8") <= 100);
});


test("private signing contracts reject reenabled legacy dispatch, extra triggers and removed CI guards", async () => {
  const legacy = (await readFile(".github/workflows/ios-testflight.yml", "utf8")).replace(/\r\n/g, "\n");
  for (const mutation of [
    legacy.replace("if: github.event_name != 'workflow_dispatch'", "if: github.event_name == 'workflow_dispatch'"),
    legacy.replace("  workflow_dispatch:\n", "  push:\n  workflow_dispatch:\n"),
    legacy + "\n  bypass:\n    runs-on: macos-26\n    steps: []\n"
  ]) {
    assert.notEqual(mutation, legacy);
    assert.throws(() => assertManualSigningDisabled(mutation));
  }
  const oneShot = await readFile(".github/workflows/ios194-2cf-reliable-sign-only.yml", "utf8");
  for (const mutation of [
    oneShot.replace('source-guard.mjs" ci-only', 'source-guard.mjs" removed'),
    oneShot.replace('        run: node "$GITHUB_WORKSPACE/release-tools/scripts/qa/ios-signing/source-guard.mjs" ci-only', '        # run: node "$GITHUB_WORKSPACE/release-tools/scripts/qa/ios-signing/source-guard.mjs" ci-only'),
    oneShot.replace('source-guard.mjs" after-export', 'source-guard.mjs" removed'),
    oneShot.replace('verify-web-assets.py" verify', 'verify-web-assets.py" removed')
  ]) {
    assert.notEqual(mutation, oneShot);
    assert.throws(() => assertPrivateSigningContract(mutation));
  }
});

test("one-shot source checkout and all source CI lanes fail closed for stale or failed proof", async () => {
  const guard = await signingGuard();
  const workflow = (await readFile(".github/workflows/ios194-2cf-reliable-sign-only.yml", "utf8")).replace(/\r\n/g, "\n");
  assert.match(workflow, /github\.event_name == 'push' && github\.run_attempt == 1 && github\.run_number == 1/);
  assert.doesNotMatch(workflow.split("\npermissions:")[0], /workflow_dispatch|pull_request|schedule/);
  assert.equal(workflow.match(/^      SOURCE_SHA: "([0-9a-f]{40})"$/m)?.[1], guard.RELEASE_SOURCE);
  assert.equal(workflow.match(/^      IOS_VERSION: "([^"]+)"$/m)?.[1], "4.58");
  assert.equal(workflow.match(/^      IOS_BUILD: "([^"]+)"$/m)?.[1], "194");
  assert.match(workflow, new RegExp('ref: "' + guard.RELEASE_SOURCE + '"'));
  const ref = workflow.match(/github\.ref == '([^']+)'/)?.[1];
  const env = {
    GITHUB_REPOSITORY: "yarinn12/sogrim-hashbon", GITHUB_EVENT_NAME: "push",
    GITHUB_REF: ref, GITHUB_WORKFLOW_REF: "yarinn12/sogrim-hashbon/.github/workflows/ios194-2cf-reliable-sign-only.yml@" + ref,
    GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_NUMBER: "1", APPLE_TEAM_ID: "MA9S4L7WKS",
    SOURCE_SHA: guard.RELEASE_SOURCE, IOS_VERSION: "4.58", IOS_BUILD: "194",
    ...Object.fromEntries([...workflow.matchAll(/^      (SOURCE_(?:QA|WINDOWS_QA|FONT_QA|AUTH_QA)_RUN): "([1-9][0-9]*)"$/gm)].map(m => [m[1], m[2]]))
  };
  const runGit = args => args[1] === "HEAD" ? guard.RELEASE_SOURCE : guard.RELEASE_TREE;
  const readText = path => path === "src/pwaBootstrap.mjs" ? 'const PWA_RELEASE = "516";'
    : JSON.stringify({ version: { number: "4.58", build: "194" } });
  assert.equal(guard.verifyCheckout(runGit, readText, env).sourceCommit, guard.RELEASE_SOURCE);
  for (const patch of [{ SOURCE_SHA: "a".repeat(40) }, { IOS_BUILD: "193" }, { GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_RUN_NUMBER: "2" }, { GITHUB_REF: "refs/heads/main" }])
    assert.throws(() => guard.verifyCheckout(runGit, readText, { ...env, ...patch }));
  assert.throws(() => guard.verifyCheckout(() => "a".repeat(40), readText, env));
  assert.throws(() => guard.verifyCheckout(args => args[1] === "HEAD" ? guard.RELEASE_SOURCE : "a".repeat(40), readText, env));
  assert.throws(() => guard.requiredRuns({ ...env, SOURCE_AUTH_QA_RUN: env.SOURCE_QA_RUN }));
  const names = ["unit", "cross-platform", "cross-platform-shard-1", "cross-platform-shard-2",
    "two-client-sync", "unit-and-mobile", "backup-runtime",
    ...["android-mobile", "iphone-webkit", "ipad-webkit", "iphone-large-text", "reflow-200"].map(p => "mobile (" + p + ")"),
    "ios-native / native-parity", "android-native / native-parity",
    "mobile-iphone-large-text-shard-1", "mobile-iphone-large-text-shard-2",
    "mobile-iphone-webkit-shard-1", "mobile-iphone-webkit-shard-2"];
  const fixture = (edit = () => {}) => async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(new URL(url).origin, "https://api.github.com"); // In-memory stub; never calls fetch.
    const match = url.match(/\/actions\/runs\/(\d+)(.*)/);
    const [id, path] = guard.requiredRuns(env).find(([id]) => id === match?.[1]) ?? [];
    assert.ok(id);
    const jobNames = path.endsWith("/qa.yml") ? names
      : [path.endsWith("/qa-windows.yml") ? "windows-unit" : path.endsWith("/ios-auth-return-qa.yml") ? "native" : "linux-font-provenance"];
    const jobs = Boolean(match[2]);
    const value = jobs ? { total_count: jobNames.length, jobs: jobNames.map((name, i) => ({
      id: i + 1, run_id: Number(id), head_sha: guard.RELEASE_SOURCE, name, status: "completed", conclusion: "success"
    })) } : { id: Number(id), head_sha: guard.RELEASE_SOURCE, repository: { full_name: env.GITHUB_REPOSITORY },
      head_repository: { full_name: env.GITHUB_REPOSITORY }, head_branch: guard.SOURCE_BRANCH,
      event: "pull_request", path, status: "completed", conclusion: "success", run_attempt: 1 };
    edit(value, path, jobs);
    return { ok: true, json: async () => value };
  };
  assert.equal((await guard.verifyRuns(fixture(), "synthetic-token", env)).length, 4);
  for (const edit of [
    (v, p, jobs) => { if (!jobs) v.head_sha = "a".repeat(40); },
    (v, p, jobs) => { if (!jobs) v.run_attempt = 2; },
    (v, p, jobs) => { if (!jobs) v.head_branch = "main"; },
    (v, p, jobs) => { if (jobs) v.jobs[0].conclusion = "failure"; },
    (v, p, jobs) => { if (jobs) v.jobs[0].conclusion = "skipped"; },
    (v, p, jobs) => { if (jobs && p.endsWith("/qa.yml")) { v.jobs.splice(v.jobs.findIndex(j => j.name === "ios-native / native-parity"), 1); v.total_count--; } }
  ]) await assert.rejects(guard.verifyRuns(fixture(edit), "synthetic-token", env));
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
    GOOGLE_CLIENT_ID:
      "123456789012-webclientvalue1234567890.apps.googleusercontent.com",
    GOOGLE_IOS_CLIENT_ID:
      "123456789012-iosclientvalue1234567890.apps.googleusercontent.com",
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

  const missingGoogleIos = spawnSync(
    process.execPath,
    [resolve("scripts/verify-ios-workflow-env.mjs")],
    {
      encoding: "utf8",
      env: { ...validEnvironment, GOOGLE_IOS_CLIENT_ID: "" }
    }
  );
  assert.notEqual(missingGoogleIos.status, 0);
  assert.match(
    missingGoogleIos.stderr,
    /GOOGLE_IOS_CLIENT_ID is missing or invalid/
  );
  assert.doesNotMatch(
    missingGoogleIos.stderr,
    /PRIVATE-MARKER|PASSWORD-MARKER/
  );

  const placeholderGoogleIos = spawnSync(
    process.execPath,
    [resolve("scripts/verify-ios-workflow-env.mjs")],
    {
      encoding: "utf8",
      env: {
        ...validEnvironment,
        GOOGLE_IOS_CLIENT_ID:
          "123456789012-placeholder_value_123.apps.googleusercontent.com"
      }
    }
  );
  assert.notEqual(placeholderGoogleIos.status, 0);
  assert.match(
    placeholderGoogleIos.stderr,
    /GOOGLE_IOS_CLIENT_ID is missing or invalid/
  );
  assert.doesNotMatch(
    placeholderGoogleIos.stderr,
    /PRIVATE-MARKER|PASSWORD-MARKER/
  );
});

test("iOS release preparation writes Google plist settings idempotently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sogrim-ios-release-"));
  const metadataDirectory = join(directory, "docs", "store-submission");
  const appDirectory = join(directory, "ios", "App", "App");
  const projectDirectory = join(directory, "ios", "App", "App.xcodeproj");
  await Promise.all([
    mkdir(metadataDirectory, { recursive: true }),
    mkdir(appDirectory, { recursive: true }),
    mkdir(projectDirectory, { recursive: true })
  ]);
  await writeFile(
    join(metadataDirectory, "app-store-metadata-he.json"),
    JSON.stringify({ version: { number: "4.26", build: "154" } }),
    "utf8"
  );
  await writeFile(
    join(appDirectory, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>com.sogrimhashbon.app</string>
\t\t\t\t<string>com.googleusercontent.apps.stale-client</string>
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
`,
    "utf8"
  );
  await writeFile(
    join(projectDirectory, "project.pbxproj"),
    `CODE_SIGN_STYLE = Automatic;
CURRENT_PROJECT_VERSION = 1;
MARKETING_VERSION = 1.0;
CODE_SIGN_STYLE = Automatic;
CURRENT_PROJECT_VERSION = 1;
MARKETING_VERSION = 1.0;
`,
    "utf8"
  );

  const googleClientId =
    "123456789012-a1b2c3d4e5f6g7h8i9j0k1l2.apps.googleusercontent.com";
  const googleIosClientId =
    "123456789012-z9y8x7w6v5u4t3s2r1q0p9o8.apps.googleusercontent.com";
  const scriptPath = resolve("scripts/prepare-ios-release.mjs");
  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        APPLE_TEAM_ID: "TEAMID1234",
        GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_IOS_CLIENT_ID: googleIosClientId,
        // This fixture exercises the optional/default signing mode, independent of the CI profile.
        IOS_PROVISIONING_PROFILE: "",
        IOS_VERSION: "4.26",
        IOS_BUILD: "154"
      }
    });
    assert.equal(result.status, 0, result.stderr);
  }

  const info = await readFile(join(appDirectory, "Info.plist"), "utf8");
  const reversedIosClientId = googleIosClientId.split(".").reverse().join(".");
  assert.equal(info.match(/<key>GIDClientID<\/key>/g)?.length, 1);
  assert.equal(info.match(/<key>GIDServerClientID<\/key>/g)?.length, 1);
  assert.equal(info.match(new RegExp(`<string>${reversedIosClientId}<\\/string>`, "g"))?.length, 1);
  assert.match(info, new RegExp(`<key>GIDClientID<\\/key>\\s*<string>${googleIosClientId}<\\/string>`));
  assert.match(info, new RegExp(`<key>GIDServerClientID<\\/key>\\s*<string>${googleClientId}<\\/string>`));
  assert.match(info, /<string>com\.sogrimhashbon\.app<\/string>/);
  assert.doesNotMatch(info, /stale-client/);
});

test("TestFlight archive selects the installed distribution profile without altering Debug signing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sogrim-ios-distribution-"));
  const appDirectory = join(directory, "ios", "App", "App");
  const projectDirectory = join(directory, "ios", "App", "App.xcodeproj");
  await Promise.all([
    mkdir(join(directory, "docs", "store-submission"), { recursive: true }),
    mkdir(appDirectory, { recursive: true }),
    mkdir(projectDirectory, { recursive: true })
  ]);
  await writeFile(join(directory, "docs", "store-submission", "app-store-metadata-he.json"),
    JSON.stringify({ version: { number: "4.43", build: "171" } }));
  await writeFile(join(appDirectory, "Info.plist"),
    '<plist><dict>\n<key>CFBundleURLSchemes</key><array><string>com.sogrimhashbon.app</string></array>\n</dict></plist>\n');
  const fixtureProject = ["Debug", "Release"].map((name, index) => `
\t\tAAAAAAAAAAAAAAAAAAAAAAA${index} /* ${name} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.sogrimhashbon.app;
\t\t\t};
\t\t\tname = ${name};
\t\t};`).join("\n");
  await writeFile(join(projectDirectory, "project.pbxproj"), fixtureProject);
  const env = {
    ...process.env,
    APPLE_TEAM_ID: "TEAMID1234",
    GOOGLE_CLIENT_ID: "123456789012-webclientvalue1234567890.apps.googleusercontent.com",
    GOOGLE_IOS_CLIENT_ID: "123456789012-iosclientvalue1234567890.apps.googleusercontent.com",
    IOS_VERSION: "4.43", IOS_BUILD: "171",
    IOS_PROVISIONING_PROFILE: "Synthetic App Store 2026"
  };
  for (let run = 0; run < 2; run++) {
    const result = spawnSync(process.execPath, [resolve("scripts/prepare-ios-release.mjs")],
      { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const project = await readFile(join(projectDirectory, "project.pbxproj"), "utf8");
    const debug = project.split("/* Debug */")[1].split("/* Release */")[0];
    const release = project.split("/* Release */")[1];
    assert.match(release, /CODE_SIGN_STYLE = Manual;/, "App Store-only CI must not request a development profile");
    assert.match(release, /CODE_SIGN_IDENTITY = "Apple Distribution";/);
    assert.match(release, /PROVISIONING_PROFILE_SPECIFIER = "Synthetic App Store 2026";/);
    assert.match(debug, /CODE_SIGN_STYLE = Automatic;/);
    assert.doesNotMatch(debug, /PROVISIONING_PROFILE_SPECIFIER|Apple Distribution/);
    assert.equal(project.match(/DEVELOPMENT_TEAM = TEAMID1234;/g)?.length, 2);
    assert.equal(project.match(/PROVISIONING_PROFILE_SPECIFIER/g)?.length, 1);
    const options = await readFile(join(directory, "ios", "ExportOptions.generated.plist"), "utf8");
    assert.match(options, /<key>signingStyle<\/key>\s*<string>manual<\/string>/);
    assert.match(options, /<key>signingCertificate<\/key>\s*<string>Apple Distribution<\/string>/);
    assert.match(options, /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>com\.sogrimhashbon\.app<\/key>\s*<string>Synthetic App Store 2026<\/string>\s*<\/dict>/);
    assert.match(options, /<key>method<\/key>\s*<string>app-store-connect<\/string>/);
  }
  const projectBeforeInvalidInput = await readFile(join(projectDirectory, "project.pbxproj"), "utf8");
  const invalid = spawnSync(process.execPath, [resolve("scripts/prepare-ios-release.mjs")],
    { cwd: directory, env: { ...env, IOS_PROVISIONING_PROFILE: 'Bad"; INJECT = YES;' }, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /IOS_PROVISIONING_PROFILE/);
  assert.equal(await readFile(join(projectDirectory, "project.pbxproj"), "utf8"), projectBeforeInvalidInput);
});

test("both signing definitions retain the prepared manual distribution configuration", async () => {
  for (const path of ["ios-testflight.yml", "ios194-2cf-reliable-sign-only.yml"]) {
    const workflow = await readFile(".github/workflows/" + path, "utf8");
    assert.match(workflow, /IOS_PROVISIONING_PROFILE: "Sogrim Hashbon App Store 2026"/);
    const archiveStep = workflow.split("- name: Archive signed iOS app")[1].split("- name: Export IPA")[0];
    assert.doesNotMatch(archiveStep, /CODE_SIGN_STYLE=Automatic/);
    assert.doesNotMatch(archiveStep, /-allowProvisioningUpdates/);
    assert.match(workflow, /profile-type: IOS_APP_STORE/);
  }
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
