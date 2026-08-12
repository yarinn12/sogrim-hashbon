import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fingerprintPaths } from "../scripts/release-source-fingerprint.mjs";

test("release source fingerprint is stable and changes with file content", async () => {
  const root = await mkdtemp(join(tmpdir(), "sogrim-release-fingerprint-"));
  try {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "a.txt"), "alpha", "utf8");
    await writeFile(join(root, "nested", "b.txt"), "beta", "utf8");

    const first = await fingerprintPaths(root, ["nested", "a.txt"]);
    const reordered = await fingerprintPaths(root, ["a.txt", "nested"]);
    assert.deepEqual(first, reordered);
    assert.equal(first.fileCount, 2);

    await writeFile(join(root, "nested", "b.txt"), "changed", "utf8");
    const changed = await fingerprintPaths(root, ["a.txt", "nested"]);
    assert.notEqual(changed.sha256, first.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
