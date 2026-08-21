import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260821162802_close_launch_security_gaps.sql";
const verificationPath =
  "supabase/verification/verify_20260821162802_close_launch_security_gaps.sql";
const migration = await readFile(migrationPath, "utf8");
const verification = await readFile(verificationPath, "utf8");
const schema = await readFile("supabase/schema.sql", "utf8");

test("completed payment history is immutable at the shared snapshot boundary", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.match(migration, /private\.has_preserved_paid_transfer_history/);
  assert.match(migration, /old_paid_transfers/);
  assert.match(migration, /old_paid_statuses/);
  assert.match(migration, /Completed payment history cannot be removed or rewritten/);
  assert.match(migration, /transfer history is too large/);
  assert.match(migration, /> 500/);
  assert.match(schema, /create trigger guard_shared_event_history_and_limits/);
  assert.match(verification, /Completed transfer history can still be removed/);
  assert.match(verification, /Pending settlement recomputation was blocked/);
});

test("friendship and block writes serialize on the same pair lock", () => {
  assert.match(migration, /private\.guard_friendship_pair_write/);
  assert.match(migration, /private\.lock_user_block_pair/);
  assert.match(
    migration,
    /'friendship:' \|\| low_user::text \|\| ':' \|\| high_user::text/
  );
  assert.match(migration, /Friendship is unavailable for blocked accounts/);
  assert.match(schema, /create trigger guard_friendship_pair_write/);
  assert.match(schema, /create trigger lock_user_block_pair/);
});

test("legacy workspace, deleted-member and invite-retention boundaries are hardened", () => {
  const finalInsertPolicy = migration.slice(
    migration.indexOf("create policy app_snapshots_insert"),
    migration.indexOf("create or replace function private.prune_revoked_event_invites")
  );
  assert.match(finalInsertPolicy, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(finalInsertPolicy, /owner_user_id is null/);
  assert.match(
    schema,
    /can_read_deleted_shared_snapshot[\s\S]*?member\.status = 'active'/
  );
  assert.match(migration, /offset 12/);
  assert.match(migration, /create trigger prune_revoked_event_invites/);
  assert.match(verification, /Ownerless workspace insertion is still client-accessible/);
  assert.match(verification, /Removed members can still read deleted event snapshots/);
});

test("notification recipients are checked against canonical active membership", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /verify_shared_event_notification_parties/);
    assert.match(source, /snapshot\.snapshot_kind = 'shared_event'/);
    assert.match(source, /sender\.status = 'active'/);
    assert.match(source, /recipient\.status = 'active'/);
    assert.match(source, /to service_role/);
  }
  assert.match(
    verification,
    /Canonical notification membership verification is missing/
  );
  assert.match(
    verification,
    /Authenticated clients can call notification membership verification/
  );
});
