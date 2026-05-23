import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settlement screen exposes a copy summary action", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /formatSettlementSummary/);
  assert.match(app, /data-action="copy-settlement"/);
  assert.match(app, /copySettlementSummary\(target\.dataset\.eventId\)/);
});

