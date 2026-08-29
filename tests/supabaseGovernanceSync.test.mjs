import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829110000_sync_shared_event_governance.sql",
    import.meta.url
  ),
  "utf8"
);
const verification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260829110000_shared_event_governance_sync.sql",
    import.meta.url
  ),
  "utf8"
);

for (const source of [schema, migration]) {
  test("collaborative members may add only one accepted connected friend", () => {
    assert.match(source, /pg_catalog\.cardinality\(added_ids\) <> 1/);
    assert.match(source, /old_event ->> 'adminsCanEditOnly'/);
    assert.match(source, /old_event ->> 'locked'/);
    assert.match(source, /friendship\.status = 'accepted'/);
    assert.match(source, /participant\.value ->> 'kind' = 'user'/);
    assert.match(source, /participant\.value -> 'accountLinked'/);
    assert.match(source, /private\.event_admin_ids\(p_old_state\).*private\.event_admin_ids\(p_new_state\)/s);
  });

  test("shared manager changes are mirrored to active personal workspaces", () => {
    assert.match(source, /private\.sync_shared_event_governance_to_workspaces/);
    assert.match(source, /private\.mirror_shared_event_governance/);
    assert.match(source, /zz_mirror_shared_event_governance/);
    assert.match(source, /adminIdsScopedToEvent', true/);
    assert.match(source, /settingsFieldUpdatedAt/);
    assert.match(source, /member\.status = 'active'/);
    assert.match(source, /request\.jwt\.claim\.sub/);
  });
}

test("governance migration is transactional, bounded and verified", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '90s'/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /Found % stale personal governance indexes/);
  assert.match(verification, /private\.event_text_ids\(personal_event\.value, 'adminIds'\)/);
});
