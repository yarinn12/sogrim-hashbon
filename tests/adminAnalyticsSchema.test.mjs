import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin analytics SQL exposes aggregates only to the server role", async () => {
  const [schema, migration, expandedMigration, verification] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile("supabase/migrations/20260814143000_admin_analytics_overview.sql", "utf8"),
    readFile("supabase/migrations/20260827102500_expand_admin_analytics_overview.sql", "utf8"),
    readFile("supabase/verification/verify_20260814143000_admin_analytics_overview.sql", "utf8")
  ]);

  for (const source of [schema, migration]) {
    const start = source.indexOf("create or replace function public.admin_analytics_overview");
    const nextFunction = source.indexOf("create or replace function", start + 1);
    const adminFunction = source.slice(start, nextFunction < 0 ? undefined : nextFunction);
    assert.ok(start >= 0);
    assert.match(adminFunction, /security definer/);
    assert.match(adminFunction, /set search_path = ''/);
    assert.match(adminFunction, /from auth\.users/);
    assert.match(adminFunction, /pg_database_size/);
    assert.match(adminFunction, /revoke all on function public\.admin_analytics_overview\(integer\)/);
    assert.match(adminFunction, /grant execute on function public\.admin_analytics_overview\(integer\)\s+to service_role/);
    assert.doesNotMatch(adminFunction, /jsonb_build_object\([^)]*email/i);
  }
  assert.match(expandedMigration, /'reachableUsers'/);
  assert.match(expandedMigration, /from public\.push_devices/);
  assert.match(expandedMigration, /'createdDuringWindow'/);
  assert.match(expandedMigration, /from public\.notification_inbox/);
  assert.match(expandedMigration, /from public\.event_invite_tokens/);
  assert.doesNotMatch(expandedMigration, /jsonb_build_object\([^)]*email/i);
  assert.match(verification, /has_function_privilege/);
});

test("the server route delegates authorization to the protected analytics service", async () => {
  const server = await readFile("server.mjs", "utf8");
  assert.match(server, /"\/api\/admin\/overview"/);
  assert.match(server, /authorization: request\.headers\.authorization/);
  assert.match(server, /adminAnalyticsService/);
});
