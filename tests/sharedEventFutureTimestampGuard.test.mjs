import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260902114500_reject_new_future_shared_merge_timestamps.sql";
const strictMapMigrationPath =
  "supabase/migrations/20260903093000_strict_shared_merge_timestamp_maps.sql";

test("new critical shared-event merge clocks are bounded by database time", async () => {
  const [schema, migration] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile(migrationPath, "utf8")
  ]);

  for (const source of [schema, migration]) {
    assert.match(source, /statement_timestamp\(\) \+ interval '5 minutes'/);
    assert.match(source, /membershipUpdatedAt/);
    assert.match(source, /membershipUpdatedAtByParticipant/);
    assert.match(source, /statusUpdatedAt/);
    assert.match(source, /adminIdsUpdatedAt/);
    assert.match(source, /settingsUpdatedAt/);
    assert.match(source, /settingsFieldUpdatedAt/);
    assert.match(source, /new_value is not distinct from old_value/);
    assert.match(source, /errcode = '22023'/);
  }
});

test("new merge timestamp map entries use safe keys and ISO values", async () => {
  const [schema, migration] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile(strictMapMigrationPath, "utf8")
  ]);

  for (const source of [schema, migration]) {
    assert.match(source, /map_entry\.key !~ '\^\[A-Za-z0-9_-\]\{1,128\}\$'/);
    assert.match(source, /Shared merge timestamp must use ISO 8601 format/);
    assert.match(source, /new_value is not distinct from old_value/);
  }
});

test("future timestamp rollout guards inserts and changed fields without rewriting legacy state", async () => {
  const [migration, verification, rollback] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(
      "supabase/verification/verify_20260902114500_future_timestamp_guard.sql",
      "utf8"
    ),
    readFile(
      "supabase/rollbacks/20260902114500_reject_new_future_shared_merge_timestamps_safe.sql",
      "utf8"
    )
  ]);

  assert.match(migration, /before insert or update of state/);
  assert.match(migration, /if tg_op = 'UPDATE'/);
  assert.match(verification, /guard_shared_event_future_merge_timestamps/);
  assert.match(rollback, /Unsafe rollback refused/);
});

test("strict timestamp-map rollout has verification and refuses an unsafe rollback", async () => {
  const [verification, rollback] = await Promise.all([
    readFile(
      "supabase/verification/verify_20260903093000_strict_shared_merge_timestamp_maps.sql",
      "utf8"
    ),
    readFile(
      "supabase/rollbacks/20260903093000_strict_shared_merge_timestamp_maps_safe.sql",
      "utf8"
    )
  ]);

  assert.match(verification, /strict shared merge timestamp maps verified/);
  assert.match(verification, /map_entry\.key !~/);
  assert.match(rollback, /Unsafe rollback refused/);
});
