import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production monitoring covers the app, API, invites and Supabase boundaries", async () => {
  const [script, workflow, pkg] = await Promise.all([
    readFile("scripts/verify-production-availability.mjs", "utf8"),
    readFile(".github/workflows/production-availability.yml", "utf8"),
    readFile("package.json", "utf8").then(JSON.parse)
  ]);

  for (const boundary of [
    '"/api/health"',
    '"/api/config"',
    '"Supabase Auth"',
    '"Supabase Data API"',
    '"private invite shell"'
  ]) {
    assert.match(script, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(
    pkg.scripts["qa:production"],
    "node scripts/verify-production-availability.mjs"
  );
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /Open one incident issue/);
  assert.match(workflow, /Close recovered incident issue/);
});

test("the backup container is minimal, non-root and health checked", async () => {
  const [dockerfile, dockerignore] = await Promise.all([
    readFile("Dockerfile", "utf8"),
    readFile(".dockerignore", "utf8")
  ]);

  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /COPY --from=dependencies \/app\/node_modules/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^android$/m);
  assert.match(dockerignore, /^ios$/m);
  assert.match(dockerignore, /^!assets\/sogrim-logo-intro\.mp4$/m);
  assert.match(dockerignore, /^!assets\/sogrim-logo-intro-poster\.jpg$/m);
});

test("the recovery runbook preserves data ownership and provider portability", async () => {
  const runbook = await readFile("docs/production-resilience.md", "utf8");

  assert.match(runbook, /Supabase as the source of truth/);
  assert.match(runbook, /second host/);
  assert.match(runbook, /stable custom domain/);
  assert.match(runbook, /pending-sync queue/);
  assert.match(runbook, /Never copy `\.env\.local`/);
});
