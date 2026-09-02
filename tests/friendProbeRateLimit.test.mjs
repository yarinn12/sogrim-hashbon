import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migration] = await Promise.all([
  readFile("supabase/schema.sql", "utf8"),
  readFile("supabase/migrations/20260902094500_commit_failed_friend_probe_limits.sql", "utf8")
]);

for (const [label, source] of [["schema", schema], ["migration", migration]]) {
  test(`${label} commits quota consumption for missing friend identities`, () => {
    const codeStart = source.lastIndexOf("create or replace function public.request_friendship(");
    const usernameStart = source.lastIndexOf("create or replace function public.request_friendship_by_username(");
    const codeFunction = source.slice(codeStart, usernameStart);
    const usernameFunction = source.slice(usernameStart);

    assert.match(codeFunction, /reserve_friend_request_capacity\(actor_id, null\)/);
    assert.match(codeFunction, /return pg_catalog\.jsonb_build_object\([\s\S]*?'FRIEND_NOT_FOUND'/);
    assert.doesNotMatch(codeFunction, /raise exception 'Friend code was not found'/);
    assert.match(usernameFunction, /reserve_friend_request_capacity\(actor_id, null\)/);
    assert.match(usernameFunction, /return pg_catalog\.jsonb_build_object\([\s\S]*?'USERNAME_NOT_FOUND'/);
    assert.doesNotMatch(usernameFunction, /raise exception 'Username was not found'/);
  });
}
