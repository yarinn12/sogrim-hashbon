import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260829154500_atomic_shared_event_member_indexes.sql",
    import.meta.url
  ),
  "utf8"
);

test("shared event publication reconciles every active member workspace atomically", () => {
  assert.match(
    migration,
    /create or replace function public\.reconcile_shared_event_indexes_for_member\(/
  );
  assert.match(
    migration,
    /canonical_events \|\| retained_events/
  );
  assert.match(
    migration,
    /personal_event\.value ->> 'sharedSpaceKey'[\s\S]*?member_access_recovery_v1_key_0001/
  );
  assert.match(
    migration,
    /zz_reconcile_shared_snapshot_member_workspaces/
  );
  assert.match(
    migration,
    /after insert or update of state on public\.app_snapshots/
  );
  assert.match(
    migration,
    /revoke all on function public\.reconcile_shared_event_indexes_for_member\(uuid\)[\s\S]*?from public, anon, authenticated/
  );
});

test("reconciliation rebuilds all active indexes in one guarded workspace write", () => {
  assert.match(
    migration,
    /member\.user_id = p_user_id[\s\S]*?member\.status = 'active'/
  );
  assert.match(
    migration,
    /not exists \([\s\S]*?workspace\.state -> 'events'[\s\S]*?personal_event\.value ->> 'id' = shared_event\.value ->> 'id'/
  );
  assert.match(
    migration,
    /original_actor_id is null[\s\S]*?member\.user_id <> original_actor_id/
  );
  assert.match(
    migration,
    /where not \([\s\S]*?personal_event\.value ->> 'id' = any\(canonical_event_ids\)/
  );
  assert.equal(
    (migration.match(/update public\.app_snapshots\s+set state = next_state/g) ?? [])
      .length,
    1
  );
});
