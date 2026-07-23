import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("clarity and product layers do not recreate and remove the same UI forever", async () => {
  const clarity = await readFile("src/publicClarityLayer.mjs", "utf8");
  const profile = await readFile("src/publicProfileOverlay.mjs", "utf8");
  const product = await readFile("src/publicProductV1Layer.mjs", "utf8");

  const clarityEventEnhancement = clarity.slice(
    clarity.indexOf("function enhanceEventScreen"),
    clarity.indexOf("function enhanceExpenseFormHint")
  );
  const profileEventEnhancement = profile.slice(
    profile.indexOf("function enhanceEventScreen"),
    profile.indexOf("function enhanceExpenseFormHint")
  );

  assert.doesNotMatch(clarityEventEnhancement, /product-event-command|product-sticky-actions/);
  assert.doesNotMatch(profileEventEnhancement, /product-event-command|product-sticky-actions/);
  assert.match(profile, /if \(!productV1Active\) enhanceNavigationClarity\(profile\)/);
  assert.match(profile, /!productV1Active && actions/);
  assert.doesNotMatch(product, /CLUTTER_SELECTORS[\s\S]*?\.product-hero-note/);
  assert.match(product, /CLUTTER_SELECTORS/);
});
