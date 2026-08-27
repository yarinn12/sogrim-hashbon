import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile("supabase/schema.sql", "utf8");
const migration = await readFile(
  "supabase/migrations/20260826234500_fix_shared_history_guard_execution.sql",
  "utf8"
);
const verification = await readFile(
  "supabase/verification/verify_20260826234500_shared_history_guard_execution.sql",
  "utf8"
);
const schemaInstaller = await readFile(
  "scripts/apply-supabase-schema.mjs",
  "utf8"
);

test("shared-event history guard can call private account-link helpers without exposing the private schema", () => {
  const guard = lastFunctionSource(
    schema,
    "private.guard_shared_event_history_and_limits"
  );

  assert.match(guard, /language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(guard, /private\.authorized_shared_event_account_link/);
  assert.match(migration, /^begin;/);
  assert.match(migration, /alter function private\.guard_shared_event_history_and_limits\(\)\s+security definer/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /procedure\.prosecdef/);
  assert.match(verification, /has_schema_privilege\('authenticated', 'private', 'usage'\)/);
  assert.match(schemaInstaller, /shared_history_guard_execution_ready/);
});

function lastFunctionSource(sql, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}`;
  const start = sql.lastIndexOf(marker);
  assert.notEqual(start, -1, `${qualifiedName} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${qualifiedName} is incomplete`);
  return sql.slice(start, end + 4);
}
