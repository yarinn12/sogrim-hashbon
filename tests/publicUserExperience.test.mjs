import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public app asks each visitor for their own saved name", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const localStore = await readFile("src/data/localStore.mjs", "utf8");

  assert.match(app, /renderProfileSetup/);
  assert.match(app, /data-action="profile-name"/);
  assert.match(app, /data-action="save-profile"/);
  assert.match(app, /data-action="edit-profile"/);
  assert.match(localStore, /LOCAL_PROFILE_KEY/);
  assert.match(localStore, /saveLocalProfile/);
});

test("public home screen does not expose local Wi-Fi or beta readiness panels", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.doesNotMatch(app, /renderNetworkPanel/);
  assert.doesNotMatch(app, /loadNetworkInfo/);
  assert.doesNotMatch(app, /copy-network-url/);
  assert.doesNotMatch(app, /renderLaunchReadinessPanel/);
  assert.doesNotMatch(app, /getLaunchReadinessItems/);
  assert.doesNotMatch(app, /data-action="current-participant"/);
});

test("public home screen focuses on actions instead of account counters", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const homeMatch = app.match(/function renderHome\(\) \{[\s\S]*?\nfunction renderNotice/);

  assert.ok(homeMatch);
  assert.doesNotMatch(homeMatch[0], /summary-strip/);
  assert.doesNotMatch(homeMatch[0], /summary-item/);
  assert.doesNotMatch(homeMatch[0], /activeEvents/);
});

test("public first run and expense forms do not invent sample people or amounts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const clarityLayer = await readFile("src/publicClarityLayer.mjs", "utf8");
  const nameCleanup = await readFile("src/publicNameCleanup.mjs", "utf8");
  const brandLayer = await readFile("src/publicBrandLayer.mjs", "utf8");
  const index = await readFile("index.html", "utf8");

  assert.match(app, /placeholder="השם שיופיע לחברים"/);
  assert.match(clarityLayer, /השם שיופיע לחברים/);
  assert.match(nameCleanup, /השם שיופיע לחברים/);
  assert.match(nameCleanup, /clearStarterExpenseDefaults/);
  assert.match(nameCleanup, /product-saved-names-panel/);
  assert.match(index, /publicNameCleanup\.mjs/);
  assert.match(index, /publicBrandLayer\.mjs/);
  assert.match(brandLayer, /APP_NAME = "סוגרים חשבון"/);
  assert.match(brandLayer, /product-brand-lockup/);
  assert.match(brandLayer, /product-brand-mark/);
  assert.doesNotMatch(app, /placeholder="למשל דני"/);
  assert.doesNotMatch(app, /name: "מונית"/);
  assert.doesNotMatch(app, /total: "110"/);
  assert.doesNotMatch(app, /amount: "110"/);
});
