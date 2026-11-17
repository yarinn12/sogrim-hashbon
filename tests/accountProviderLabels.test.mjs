import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Apple provider renders a scalable visible label independently of its logo", async () => {
  const source = await readFile(new URL("../src/publicAccountAuthLayer.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function appleProviderMarkup() {");
  const end = source.indexOf("\nfunction providerDiscoveryMarkup()", start);
  assert.ok(start >= 0 && end > start, "expected the actual provider renderer");
  const render = new Function(source.slice(start, end) + "\nreturn appleProviderMarkup;")();
  const html = render();
  assert.match(html, /<span\b[^>]*>המשך עם Apple<\/span>/,
    "Apple's visible title must be text that follows the shared font, rather than baked into an image");
  assert.match(html, /data-account-action="apple"/);
  assert.match(html, /aria-label="המשך עם Apple"/);
  assert.match(html, /<img\b[^>]*alt=""/);
  assert.doesNotMatch(html, /sign-in-with-apple-iw\.png/);
});
