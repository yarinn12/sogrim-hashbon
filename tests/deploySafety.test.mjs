import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("deployment ignores local secrets and local state files", async () => {
  const [gitignore, vercelignore] = await Promise.all([
    readFile(".gitignore", "utf8"),
    readFile(".vercelignore", "utf8")
  ]);

  assert.match(gitignore, /\.env/);
  assert.match(gitignore, /\.vercel\//);
  assert.match(gitignore, /data\/app-state\.json/);
  assert.match(gitignore, /docs\/superpowers\//);
  assert.match(gitignore, /publish\//);
  assert.match(gitignore, /upload-\*\//);
  assert.match(gitignore, /deploy-\*\//);
  assert.match(gitignore, /\.qa-\*\//);
  assert.match(gitignore, /\.ux-\*\//);
  assert.match(gitignore, /\*\.zip/);
  assert.match(gitignore, /audit\/backups\//);
  assert.match(gitignore, /work\/\*backup\*\.json/);
  assert.match(vercelignore, /\.qa-\*/);
  assert.match(vercelignore, /\.ux-\*/);
  assert.match(vercelignore, /^tests$/m);
  assert.match(vercelignore, /^artifacts$/m);
  assert.match(vercelignore, /^audit$/m);
  assert.match(vercelignore, /^work$/m);
  assert.match(vercelignore, /^\.codex$/m);
});
