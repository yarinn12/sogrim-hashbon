import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import { createAppHandler } from "../server.mjs";

test("public store readiness pages exist with stable URLs", async () => {
  const [privacy, support, terms, accessibility, deletion, server] = await Promise.all([
    readFile("privacy.html", "utf8"),
    readFile("support.html", "utf8"),
    readFile("terms.html", "utf8"),
    readFile("accessibility.html", "utf8"),
    readFile("account-deletion.html", "utf8"),
    readFile("server.mjs", "utf8")
  ]);

  assert.match(privacy, /מדיניות פרטיות/);
  assert.match(privacy, /Google/);
  assert.match(support, /תמיכה/);
  assert.match(support, /קישור הצטרפות/);
  assert.match(terms, /תנאי שימוש/);
  assert.match(terms, /קישורי הצטרפות/);
  assert.match(accessibility, /הצהרת נגישות/);
  assert.match(accessibility, /TalkBack/);
  assert.match(deletion, /מחיקת חשבון/);
  assert.match(deletion, /Google/);
  assert.match(server, /staticAliases/);
  assert.match(server, /"\/android": "\/downloads\/sogrim-hashbon-android-1\.2\.apk"/);
  assert.match(server, /"\/privacy": "\/privacy\.html"/);
  assert.match(server, /"\/support": "\/support\.html"/);
  assert.match(server, /"\/terms": "\/terms\.html"/);
  assert.match(server, /"\/accessibility": "\/accessibility\.html"/);
  assert.match(server, /"\/account-deletion": "\/account-deletion\.html"/);
  assert.match(server, /"\/delete-account": "\/account-deletion\.html"/);
});

test("legal links and native back navigation resolve inside the static native bundle", async () => {
  const [pages, legalScript] = await Promise.all([
    Promise.all(
      ["privacy.html", "support.html", "terms.html", "accessibility.html", "account-deletion.html"].map(
        (path) => readFile(path, "utf8")
      )
    ),
    readFile("legal.mjs", "utf8")
  ]);

  for (const page of pages) {
    assert.doesNotMatch(
      page,
      /href="\.\/(?:privacy|support|terms|accessibility|account-deletion)"/
    );
    assert.match(page, /<script type="module" src="\.\/legal\.mjs"><\/script>/);
  }

  assert.match(pages[0], /href="\.\/support\.html"/);
  assert.match(pages[1], /href="\.\/privacy\.html"/);
  assert.match(pages[2], /href="\.\/privacy\.html"/);
  assert.match(pages[3], /href="\.\/privacy\.html"/);
  assert.match(pages[4], /href="\.\/privacy\.html"/);
  assert.match(legalScript, /addListener\("backButton", returnToPreviousPage\)/);
  assert.match(legalScript, /window\.history\.back\(\)/);
  assert.match(legalScript, /window\.location\.assign\(APP_URL\)/);
});

test("server serves the optional signed Android trial only when it is bundled", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/android`);
    if (response.status === 404) {
      assert.equal(
        existsSync(join(process.cwd(), "downloads", "sogrim-hashbon-android-1.2.apk")),
        false
      );
      return;
    }
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/vnd.android.package-archive");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    assert.ok((await response.arrayBuffer()).byteLength > 1_000_000);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("server serves clean public policy URLs for app stores", async () => {
  const server = createServer(createAppHandler({ root: process.cwd(), port: 0 }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    for (const path of [
      "/privacy",
      "/support",
      "/terms",
      "/accessibility",
      "/account-deletion",
      "/delete-account"
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(body, /סוגרים חשבון/);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("store submission documents capture remaining Google and store work", async () => {
  const [readiness, listing] = await Promise.all([
    readFile("docs/app-store-readiness-he.md", "utf8"),
    readFile("docs/store-listing-he.md", "utf8")
  ]);

  assert.match(readiness, /GOOGLE_CLIENT_ID/);
  assert.match(readiness, /שמירת ענן/);
  assert.match(readiness, /Apple/);
  assert.match(readiness, /Google Play/);
  assert.match(listing, /התחשבנות חכמה בין חברים/);
  assert.match(listing, /https:\/\/sogrim-hashbon\.vercel\.app\/privacy/);
  assert.match(listing, /https:\/\/sogrim-hashbon\.vercel\.app\/support/);
});

test("verified app links and store submission declarations are prepared", async () => {
  const [vercel, server, packageJson, dataSafety, appPrivacy, releaseBuilder, readinessCheck] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile("server.mjs", "utf8"),
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("docs/store-submission/google-play-data-safety-he.md", "utf8"),
    readFile("docs/store-submission/apple-app-privacy-he.md", "utf8"),
    readFile("scripts/build-android-release.mjs", "utf8"),
    readFile("scripts/verify-store-readiness.mjs", "utf8")
  ]);

  assert.match(vercel, /\.well-known\/\*\*/);
  assert.match(server, /apple-app-site-association/);
  assert.match(packageJson.scripts["native:ios:association"], /setup-apple-association/);
  assert.match(packageJson.scripts["qa:store"], /verify-store-readiness/);
  assert.match(dataSafety, /Other financial info|מידע פיננסי אחר/);
  assert.match(dataSafety, /account-deletion/);
  assert.match(dataSafety, /אסימון התראות של Android/);
  assert.match(appPrivacy, /NSPrivacyCollectedDataTypeOtherFinancialInfo/);
  assert.match(appPrivacy, /לא נעשה שימוש במידע למעקב/);
  assert.match(releaseBuilder, /rmSync\(bundle, \{ force: true \}\)/);
  assert.match(releaseBuilder, /release-manifest\.json/);
  assert.match(releaseBuilder, /android-upload-certificate-sha256\.txt/);
  assert.match(releaseBuilder, /fingerprintAndroidReleaseSource/);
  assert.match(releaseBuilder, /Android merged release manifest/);
  assert.match(releaseBuilder, /Another Android release build is already running/);
  assert.match(releaseBuilder, /"clean", "bundleRelease", "lintRelease", "--no-daemon"/);
  assert.match(readinessCheck, /Android AAB matches current version, hash, signing certificate and source/);
  assert.match(readinessCheck, /localReady, liveReady, submissionReady/);
  assert.match(readinessCheck, /process\.argv\.includes\("--android"\)/);
  assert.match(readinessCheck, /androidReady/);
  assert.match(readinessCheck, /AbortSignal\.timeout\(10_000\)/);
  assert.match(readinessCheck, /async function fetchWithRetry/);
  assert.doesNotMatch(readinessCheck, /Android release is prepared as 3\.44/);
});
