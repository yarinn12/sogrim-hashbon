import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production monitoring covers the app, API, invites and Supabase boundaries", async () => {
  const [script, failoverScript, workflow, pkg] = await Promise.all([
    readFile("scripts/verify-production-availability.mjs", "utf8"),
    readFile("scripts/verify-production-failover.mjs", "utf8"),
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
  assert.equal(
    pkg.scripts["qa:recovery:strict"],
    "node scripts/verify-production-availability.mjs --strict --allow-origin-backed-shell"
  );
  assert.match(script, /ALLOW_ORIGIN_BACKED_SHELL/);
  assert.match(script, /requireNoStore: !ALLOW_ORIGIN_BACKED_SHELL/);
  assert.match(script, /installed app shell can be reused from stale browser cache/);
  assert.match(script, /payload\?\.external\?\.email === true/);
  assert.match(script, /payload\?\.mailer_autoconfirm === false/);
  assert.match(script, /"authEmailDeliveryReady"/);
  assert.match(failoverScript, /REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(failoverScript, /origin request failed/);
  assert.match(failoverScript, /reachable/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /set -o pipefail/);
  assert.match(workflow, /verify-production-availability\.mjs \| tee production-availability\.log/);
  assert.match(workflow, /verify-production-availability\.mjs --strict \| tee production-cdn\.log/);
  assert.match(workflow, /verify-production-failover\.mjs \| tee production-failover\.log/);
  assert.match(
    workflow,
    /RECOVERY_PRODUCTION_ORIGIN: https:\/\/sogrim-hashbon-recovery\.onrender\.com/
  );
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
  assert.match(dockerfile, /COPY .*app-ads\.txt/);
  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^android$/m);
  assert.match(dockerignore, /^ios$/m);
  assert.match(dockerignore, /^!assets\/sogrim-logo-intro\.mp4$/m);
  assert.match(dockerignore, /^!assets\/sogrim-heshbon-loading-loop-v2\.mp4$/m);
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

test("the recovery host keeps the Android ad rollout in test-only mode", async () => {
  const blueprint = await readFile("render.yaml", "utf8");

  assert.match(blueprint, /key: ADMOB_ENABLED\s+value: "false"/);
  assert.match(blueprint, /key: ADMOB_TEST_MODE\s+value: "true"/);
  assert.match(blueprint, /key: ADMOB_MIN_ANDROID_BUILD\s+value: "70"/);
  assert.match(blueprint, /key: ADMOB_ROLLOUT_PERCENT\s+value: "0"/);
  assert.match(blueprint, /key: PUSH_DELIVERY_ENABLED\s+value: "false"/);
});

test("the backup image is published from main without embedding secrets", async () => {
  const workflow = await readFile(".github/workflows/backup-image.yml", "utf8");

  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /sogrim-hashbon-server:latest/);
  assert.match(workflow, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("the non-Apple release gate blocks continuity and delivery regressions", async () => {
  const [script, pkg, runbook] = await Promise.all([
    readFile("scripts/verify-operational-readiness-live.mjs", "utf8"),
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("docs/production-resilience.md", "utf8")
  ]);

  assert.match(script, /admin_operational_health/);
  assert.match(script, /accountsWithoutWorkspace/);
  assert.match(script, /eventsWithoutActiveMembers/);
  assert.match(script, /connectedEventPublicationContinuity/);
  assert.match(script, /activeUnsharedMultiAccountCreatorEvents/);
  assert.match(script, /activeMembershipsMissingPersonalIndex/);
  assert.match(script, /stalePushReservations/);
  assert.match(script, /rls_forced/);
  assert.doesNotMatch(script, /select\s+.*\bstate\b/is);
  assert.match(pkg.scripts["qa:release:core"], /qa:operations -- --strict/);
  assert.match(pkg.scripts["qa:release:core"], /qa:production:strict/);
  assert.match(pkg.scripts["qa:release:core"], /qa:store -- --android/);
  assert.match(runbook, /Operational release gate/);
});

test("operational workspace continuity ignores incomplete email signups", async () => {
  const [schema, migration, verification, applyScript] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile(
      "supabase/migrations/20260830110000_scope_operational_health_to_confirmed_accounts.sql",
      "utf8"
    ),
    readFile(
      "supabase/verification/verify_20260830110000_operational_health_confirmed_accounts.sql",
      "utf8"
    ),
    readFile("scripts/apply-operational-health-account-scope.mjs", "utf8")
  ]);
  const confirmedAccountContinuity =
    /from auth\.users as account\s+where account\.confirmed_at is not null\s+and not exists/;

  assert.match(schema, confirmedAccountContinuity);
  assert.match(migration, confirmedAccountContinuity);
  assert.match(verification, /expected_missing/);
  assert.match(verification, /accountsWithoutWorkspace/);
  assert.match(
    applyScript,
    /20260830110000_scope_operational_health_to_confirmed_accounts\.sql/
  );
  assert.match(
    applyScript,
    /verify_20260830110000_operational_health_confirmed_accounts\.sql/
  );
});
