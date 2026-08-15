import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260815013553_allow_members_add_offline_guests.sql",
    import.meta.url
  ),
  "utf8"
);
const verification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260815013553_allow_members_add_offline_guests.sql",
    import.meta.url
  ),
  "utf8"
);
const resurrectionMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260815020025_reject_merged_guest_readdition.sql",
    import.meta.url
  ),
  "utf8"
);
const resurrectionVerification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260815020025_reject_merged_guest_readdition.sql",
    import.meta.url
  ),
  "utf8"
);

for (const source of [schema, migration]) {
  test("shared event guard permits only safe offline guest additions", () => {
    assert.match(source, /private\.is_safe_offline_guest_addition/);
    assert.match(source, /actor_is_adding_offline_guests/);
    assert.match(source, /\^guest-\[A-Za-z0-9_-\]/);
    assert.match(source, /participant\.value ->> 'kind' = 'guest'/);
    assert.match(source, /authSubject/);
    assert.match(source, /old_inactive_ids is distinct from new_inactive_ids/);
  });
}

test("offline guest migration is bounded and independently verifiable", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '60s'/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /safe offline guest addition was rejected/);
  assert.match(verification, /connected user addition was incorrectly accepted/);
  assert.match(verification, /'ready' as verification_status/);
});

test("a merged offline guest cannot be resurrected by a stale device", () => {
  for (const source of [schema, resurrectionMigration]) {
    assert.match(source, /p_old_state -> 'deletedParticipants'/);
    assert.match(source, /deletion\.value ->> 'id' = added_id/);
  }
  assert.match(
    resurrectionVerification,
    /merged offline guest was allowed to return/
  );
  assert.match(resurrectionVerification, /new offline guest was incorrectly rejected/);
});
