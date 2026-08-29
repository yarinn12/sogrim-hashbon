import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829123000_ensure_account_workspace.sql",
    import.meta.url
  ),
  "utf8"
);
const verification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260829123000_ensure_account_workspace.sql",
    import.meta.url
  ),
  "utf8"
);

for (const source of [schema, migration]) {
  test("authenticated sign-in atomically recreates a missing account workspace", () => {
    assert.match(source, /public\.ensure_account_workspace\(p_space_id text\)/);
    assert.match(source, /pg_advisory_xact_lock/);
    assert.match(source, /from auth\.users as account[\s\S]*for update/);
    assert.match(source, /account_space_id/);
    assert.match(source, /account_space_key/);
    assert.match(source, /snapshot\.owner_user_id = actor_id/);
    assert.match(source, /'currentParticipantId', participant_id/);
    assert.match(source, /insert into public\.app_snapshots/);
    assert.match(source, /grant execute[\s\S]*to authenticated/);
    assert.match(source, /revoke all[\s\S]*from public, anon/);
  });
}

test("account workspace ensure migration is bounded and independently verified", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '90s'/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /Account workspace ensure RPC is missing/);
  assert.match(verification, /Anonymous users can execute/);
  assert.match(verification, /Authenticated users cannot execute/);
});
