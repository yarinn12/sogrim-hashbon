import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public expense guest layer loads after the command icon layer", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicExpenseGuestLayer\.mjs/);
  assert.match(
    index,
    /publicCommandIconLayer\.mjs\?pwa_release=473"><\/script>\s+<script type="module" src="\.\/src\/publicExpenseGuestLayer\.mjs\?pwa_release=473"><\/script>/
  );
});

test("public expense guest layer injects add guest controls into the expense dialog", async () => {
  const layer = await readFile("src/publicExpenseGuestLayer.mjs", "utf8");

  assert.match(layer, /expense-guest-box/);
  assert.match(layer, /data-action="event-guest-name"/);
  assert.match(layer, /data-action="event-add-guest"/);
  assert.match(layer, /autoSelectAddedGuest/);
  assert.match(layer, /data-action="expense-shared"/);
});

test("public inline payer layer loads after expense guest controls", async () => {
  const index = await readFile("index.html", "utf8");
  const sw = await readFile("sw.js", "utf8");

  assert.match(index, /publicInlinePayerLayer\.mjs/);
  assert.match(
    index,
    /publicExpenseGuestLayer\.mjs\?pwa_release=473"><\/script>\s+<script type="module" src="\.\/src\/publicInlinePayerLayer\.mjs\?pwa_release=473"><\/script>/
  );
  assert.match(sw, /\/src\/publicInlinePayerLayer\.mjs/);
});

test("public inline payer layer can add a missing payer from the payer selector", async () => {
  const layer = await readFile("src/publicInlinePayerLayer.mjs", "utf8");

  assert.match(layer, /INLINE_ADD_VALUE/);
  assert.match(layer, /data-action="expense-inline-payer-name"/);
  assert.match(layer, /data-action="expense-inline-add-payer"/);
  assert.match(layer, /data-action="event-add-guest"/);
  assert.match(layer, /applyPendingInlinePayer/);
  assert.match(layer, /select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});
