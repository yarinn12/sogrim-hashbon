import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260902113000_isolate_shared_event_index_reconciliation.sql";

test("canonical membership survives one member workspace reconciliation failure", async () => {
  const [schema, migration] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile(migrationPath, "utf8")
  ]);

  for (const source of [schema, migration]) {
    assert.match(source, /old_active_ids text\[\]/);
    assert.match(source, /not \(member\.participant_id = any\(old_active_ids\)\)/);
    assert.match(source, /set_config\('lock_timeout', '1s', true\)/);
    assert.match(source, /exception when others then[\s\S]*?raise warning/);
    assert.match(source, /Shared-event index reconciliation deferred for member/);
    assert.match(source, /request\.jwt\.claim\.sub/);
  }
});

test("profile-only shared-event changes no longer fan out across all workspaces", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const fastPath = migration.slice(
    migration.indexOf("if tg_op = 'UPDATE'"),
    migration.indexOf("for active_member in")
  );

  assert.match(fastPath, /participantIds/);
  assert.match(fastPath, /inactiveParticipantIds/);
  assert.doesNotMatch(fastPath, /old\.state -> 'participants'/);
  assert.doesNotMatch(fastPath, /participantAccountLinks/);
});

test("reconciliation isolation has a fail-closed verification and rollback", async () => {
  const [verification, rollback] = await Promise.all([
    readFile(
      "supabase/verification/verify_20260902113000_shared_event_index_reconciliation.sql",
      "utf8"
    ),
    readFile(
      "supabase/rollbacks/20260902113000_isolate_shared_event_index_reconciliation_safe.sql",
      "utf8"
    )
  ]);

  assert.match(verification, /pg_get_functiondef/);
  assert.match(verification, /has_function_privilege/);
  assert.match(rollback, /Unsafe rollback refused/);
});
