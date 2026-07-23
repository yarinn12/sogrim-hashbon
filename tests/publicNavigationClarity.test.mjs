import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("public overlay explains where the visitor is and exposes primary actions", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.match(overlay, /enhanceNavigationClarity/);
  assert.match(overlay, /product-context-bar/);
  assert.match(overlay, /איפה אני/);
  assert.match(overlay, /מה עושים עכשיו/);
  assert.match(overlay, /data-public-click/);
});

test("public home screen does not render the large context bar", async () => {
  const clarity = await readFile("src/publicClarityLayer.mjs", "utf8");
  const profile = await readFile("src/publicProfileOverlay.mjs", "utf8");

  for (const source of [clarity, profile]) {
    const homeContext = sourceBetween(
      source,
      "function getScreenContext",
      'if (screen.querySelector(\'[data-action="create-event"]\'))'
    );

    assert.doesNotMatch(homeContext, /data-action="new-event"/);
    assert.doesNotMatch(homeContext, /׳‘׳™׳×/);
  }
});

test("public event screen preserves the focused native event navigation", async () => {
  const [overlay, app] = await Promise.all([
    readFile("src/publicClarityLayer.mjs", "utf8"),
    readFile("src/app.mjs", "utf8")
  ]);
  const enhancement = sourceBetween(
    overlay,
    "function enhanceEventScreen",
    "function enhanceExpenseFormHint"
  );

  assert.match(enhancement, /product-event-screen/);
  assert.doesNotMatch(enhancement, /product-event-command|product-sticky-actions/);
  assert.match(app, /event-header-actions/);
  assert.match(app, /data-action="show-expense-form"/);
  assert.match(app, /renderEventWorkspaceNav\(event\)/);
});

test("public overlay leaves event actions to the native event workspace", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");
  const enhancement = sourceBetween(
    overlay,
    "function enhanceEventScreen",
    "function enhanceExpenseFormHint"
  );

  assert.match(overlay, /goToNativeAction/);
  assert.doesNotMatch(enhancement, /product-sticky-actions|data-public-click/);
});

test("public event chrome avoids repeating the share link action", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const clarity = await readFile("src/publicClarityLayer.mjs", "utf8");
  const profile = await readFile("src/publicProfileOverlay.mjs", "utf8");

  assert.match(app, /data-action="open-event-share"/);

  for (const source of [clarity, profile]) {
    const context = sourceBetween(source, "function getScreenContext", "function enhanceEventScreen");
    const eventOverlay = sourceBetween(source, "function enhanceEventScreen", "function enhanceExpenseFormHint");

    assert.doesNotMatch(context, /data-action="show-expense-form"|open-event-share/);
    assert.doesNotMatch(eventOverlay, /open-event-share/);
  }
});

test("public new event chrome frames creation and joining without repeating the title", async () => {
  const clarity = await readFile("src/publicClarityLayer.mjs", "utf8");
  const profile = await readFile("src/publicProfileOverlay.mjs", "utf8");

  for (const source of [clarity, profile]) {
    const newEventContext = sourceBetween(
      source,
      'if (screen.querySelector(\'[data-action="create-event"]\'))',
      'if (screen.querySelector(\'[data-action="copy-settlement"]\'))'
    );

    assert.match(newEventContext, /title: "אירוע חדש"/);
    assert.doesNotMatch(newEventContext, /יצירה או הצטרפות|join-existing-event/);
  }
});

test("public event overlay does not add a second event action surface", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");
  const enhancement = sourceBetween(
    overlay,
    "function enhanceEventScreen",
    "function enhanceExpenseFormHint"
  );

  assert.doesNotMatch(enhancement, /event-command-grid|product-event-command|product-sticky-actions/);
});

test("public clarity layer exposes saved name removal without rewriting expense drafts", async () => {
  const overlay = await readFile("src/publicClarityLayer.mjs", "utf8");

  assert.doesNotMatch(overlay, /clearStarterExpenseDefaults/);
  assert.doesNotMatch(overlay, /nameCleanupCleared/);
  assert.doesNotMatch(overlay, /publicDefaultCleared/);
  assert.match(overlay, /product-saved-names-panel/);
  assert.match(overlay, /data-public-remove-participant/);
});

test("public clarity layer is loaded after the profile overlay", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicProfileOverlay\.mjs/);
  assert.match(index, /publicClarityLayer\.mjs/);
});
