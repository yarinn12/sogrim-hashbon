import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Supabase schema includes a beta snapshot table for early shared testing", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  assert.match(schema, /create table public\.app_snapshots/);
  assert.match(schema, /id text primary key/);
  assert.match(schema, /state jsonb not null/);
});
