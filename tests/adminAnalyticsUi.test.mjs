import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
const brandSource = await readFile(
  new URL("../src/publicBrandLayer.mjs", import.meta.url),
  "utf8"
);
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("admin overview is reachable only after server-confirmed availability", () => {
  assert.match(
    appSource,
    /adminAnalytics\.status === "ready" && adminAnalytics\.available/
  );
  assert.match(appSource, /data-action="open-admin-overview"/);
  assert.match(appSource, /if \(!adminAnalytics\.available\) return;/);
});

test("admin overview supports app and native back navigation", () => {
  assert.match(appSource, /screen\.name === "admin-overview"/);
  assert.match(
    appSource,
    /if \(screen\.name === "admin-overview"\) \{\s*screen = \{ name: "profile" \};\s*renderHistoryFallback\(\);/
  );
});

test("admin overview inherits the product header and bottom navigation", () => {
  assert.match(brandSource, /"admin"/);
  assert.match(brandSource, /kind === "admin"\s*\? "profile"/);
  assert.match(styles, /\.admin-status-hero/);
  assert.match(styles, /\.admin-quick-stats/);
  assert.match(styles, /prefers-reduced-motion/);
});
