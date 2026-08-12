import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("core app owns the single browser back implementation", async () => {
  const [index, app] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("src/app.mjs", "utf8")
  ]);

  assert.doesNotMatch(index, /publicBackNavigationLayer\.mjs/);
  assert.match(app, /window\.addEventListener\("popstate", handleBrowserHistoryBack\)/);
  assert.match(app, /function goBackInApp/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /restoreHistoryView/);
});

test("core back history preserves focused windows and drafts", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const goBack = app.slice(
    app.indexOf("function goBackInApp()"),
    app.indexOf("function renderHistoryFallback(rewindSteps = 1)")
  );
  const fallback = app.slice(
    app.indexOf("function renderHistoryFallback(rewindSteps = 1)"),
    app.indexOf("function handleInput(event)")
  );

  assert.match(app, /expenseDraft: cloneNavigationValue\(expenseDraft\)/);
  assert.match(app, /eventDialog: cloneNavigationValue\(eventDialog\)/);
  assert.match(app, /if \(action === "go-back"\) \{\s*goBackInApp\(\);/);
  assert.doesNotMatch(goBack, /history\.back\(\)/);
  assert.match(fallback, /window\.history\.back\(\)/);
  assert.match(fallback, /window\.history\.go\(-historyDistance\)/);
});
