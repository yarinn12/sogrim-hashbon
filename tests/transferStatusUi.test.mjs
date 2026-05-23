import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("settlement screen lets a paid transfer return to pending", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /data-action="mark-pending"/);
  assert.match(app, /markTransferPending\(target\.dataset\.transferId\)/);
  assert.match(app, /updateTransferStatus/);
});

