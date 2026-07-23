import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Supabase schema secures shared snapshots with explicit grants and RLS", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table if not exists public\.app_snapshots/);
  assert.match(schema, /id text primary key/);
  assert.match(schema, /access_key_hash text not null/);
  assert.match(schema, /state jsonb not null/);
  assert.match(schema, /owner_user_id uuid references auth\.users\(id\) on delete cascade/);
  assert.match(schema, /enable row level security/);
  assert.match(schema, /force row level security/);
  assert.match(schema, /grant select on table public\.app_snapshots to anon, authenticated/);
  assert.match(schema, /grant insert, update on table public\.app_snapshots to authenticated/);
  assert.match(schema, /for insert\s+to authenticated/);
  assert.match(schema, /for update\s+to authenticated/);
  assert.match(schema, /to anon, authenticated[\s\S]+using \(access_key_hash/);
  assert.match(schema, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /create or replace function public\.delete_account_data/);
  assert.match(schema, /create or replace function public\.delete_account_data\(\s*p_user_id uuid\s*\)/);
  assert.doesNotMatch(schema, /account_snapshot\.access_key_hash = p_space_key_hash/);
  assert.match(schema, /owner_user_id is distinct from p_user_id/);
  assert.match(schema, /shared_records_anonymized/);
});
