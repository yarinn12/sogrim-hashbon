import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const operatingSystemDoc = readFileSync(
  "docs/product-operating-system-he.md",
  "utf8",
);
const testRunner = readFileSync("scripts/run-tests.mjs", "utf8");

test("project exposes a single QA command for the team", () => {
  assert.equal(packageJson.scripts.test, "node scripts/run-tests.mjs");
  assert.equal(packageJson.scripts.qa, "node scripts/run-tests.mjs");
});

test("test runner discovers every test file instead of relying on shell globs", () => {
  assert.match(testRunner, /collectTestFiles/);
  assert.match(testRunner, /--test/);
  assert.match(testRunner, /\.test\.mjs/);
});

test("product operating system keeps the whole team aligned", () => {
  assert.match(operatingSystemDoc, /תזה/);
  assert.match(operatingSystemDoc, /צוות עבודה/);
  assert.match(operatingSystemDoc, /שער QA/);
  assert.match(operatingSystemDoc, /Google login/);
  assert.match(operatingSystemDoc, /QR/);
});
