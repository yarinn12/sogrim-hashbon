import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("deployment ignores local secrets and local state files", async () => {
  const gitignore = await readFile(".gitignore", "utf8");

  assert.match(gitignore, /\.env/);
  assert.match(gitignore, /\.vercel\//);
  assert.match(gitignore, /data\/app-state\.json/);
  assert.match(gitignore, /docs\/superpowers\//);
  assert.match(gitignore, /publish\//);
  assert.match(gitignore, /upload-\*\//);
  assert.match(gitignore, /\*\.zip/);
});
