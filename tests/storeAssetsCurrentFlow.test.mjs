import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("store artwork and reviewer guidance follow the current product flow", async () => {
  const [sourceHtml, sourceModule, reviewNotes, assetReadme, androidBuild] = await Promise.all([
    readFile("docs/store-assets/store-screenshot-source.html", "utf8"),
    readFile("docs/store-assets/store-screenshot-source.mjs", "utf8"),
    readFile("docs/store-submission/review-notes-he.md", "utf8"),
    readFile("docs/store-assets/README-he.md", "utf8"),
    readFile("android/app/build.gradle", "utf8")
  ]);

  assert.equal((sourceHtml.match(/<script/g) ?? []).length, 1);
  assert.match(sourceHtml, /store-screenshot-source\.mjs/);
  assert.match(sourceModule, /ui-event-type-current\.png/);
  assert.match(sourceModule, /ui-expense-amount-current\.png/);
  assert.match(sourceModule, /ui-invite-current\.png/);
  assert.doesNotMatch(sourceModule, /restaurant/i);
  assert.ok(!reviewNotes.includes("\u05de\u05e1\u05e2\u05d3\u05d4"));
  assert.match(assetReadme, /google-screenshot-02-expense\.png/);
  assert.match(assetReadme, /apple-screenshot-02-expense-1320x2868\.png/);

  const versionCode = androidBuild.match(/versionCode\s+(\d+)/)?.[1];
  const versionName = androidBuild.match(/versionName\s+"([^"]+)"/)?.[1];
  assert.ok(versionCode, "Android versionCode must be configured");
  assert.ok(versionName, "Android versionName must be configured");

  const releaseNotes = await readFile(`docs/releases/${versionName}-he.md`, "utf8");
  assert.match(releaseNotes, new RegExp(`\\(${versionCode}\\)`));
});
