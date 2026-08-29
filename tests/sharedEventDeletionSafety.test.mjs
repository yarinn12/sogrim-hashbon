import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migration, verification, removalScript] = await Promise.all([
  readFile("supabase/schema.sql", "utf8"),
  readFile(
    "supabase/migrations/20260827143000_allow_admin_shared_event_deletion.sql",
    "utf8"
  ),
  readFile(
    "supabase/verification/verify_20260827143000_allow_admin_shared_event_deletion.sql",
    "utf8"
  ),
  readFile("scripts/remove-korea-2026-08-16.mjs", "utf8")
]);

test("paid-history protection permits only a complete administrator deletion", () => {
  for (const source of [schema, migration]) {
    assert.match(
      source,
      /create or replace function private\.is_safe_shared_event_deletion\(/
    );
    assert.match(source, /p_actor_participant_id = any\(private\.event_admin_ids/);
    assert.match(source, /p_new_state -> 'events' is distinct from '\[\]'::jsonb/);
    assert.match(source, /p_new_state -> 'participants' is distinct from '\[\]'::jsonb/);
    assert.match(source, /target_tombstone - array\['id', 'deletedAt'\]/);
    assert.match(
      source,
      /and not private\.is_safe_shared_event_deletion\([\s\S]*?and not private\.has_preserved_paid_transfer_history/
    );
    assert.match(
      source,
      /revoke all on function private\.is_safe_shared_event_deletion\(jsonb, jsonb, text\)/
    );
  }
});

test("deletion migration verifies admin, tombstone, and live-event boundaries", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /A valid administrator deletion was rejected/);
  assert.match(verification, /A non-administrator can delete a shared event/);
  assert.match(verification, /A mismatched deletion tombstone was accepted/);
  assert.match(verification, /A deletion that retains the live event was accepted/);
  assert.match(verification, /'ready' as verification_status/);
});

test("the targeted Korea cleanup is dry-run by default and preserves a recovery copy", () => {
  assert.match(removalScript, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(removalScript, /EXPECTED_CREATED_DAY = "2026-08-16"/);
  assert.match(removalScript, /EXPECTED_OWNER_USERNAME = "yarinn12"/);
  assert.match(removalScript, /if \(!apply\)/);
  assert.match(removalScript, /writeRecoveryBackup/);
  assert.match(removalScript, /assertDeletionState/);
});
