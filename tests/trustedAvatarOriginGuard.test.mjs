import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260902101500_guard_trusted_avatar_origins.sql";

test("database accepts only first-party, Google, or bounded inline avatars", async () => {
  const [schema, migration] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile(migrationPath, "utf8")
  ]);

  for (const source of [schema, migration]) {
    assert.match(source, /googleusercontent\\\.com/);
    assert.match(source, /sogrim-hesbon-app\\\.vercel\\\.app/);
    assert.match(source, /data:image\/\(jpeg\|png\|webp\);base64/);
    assert.match(source, /guard_shared_avatar_origins/);
    assert.match(source, /Shared profile avatar origin is not trusted/);
  }
  assert.doesNotMatch(migration, /avatar_image ~ '\^https:\/\/'/);
});

test("avatar origin rollout is backward compatible and independently verified", async () => {
  const [migration, verification, rollback] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("supabase/verification/verify_20260902101500_trusted_avatar_origins.sql", "utf8"),
    readFile("supabase/rollbacks/20260902101500_guard_trusted_avatar_origins_safe.sql", "utf8")
  ]);

  assert.match(migration, /not valid/i);
  assert.match(verification, /guard_shared_avatar_origins/);
  assert.match(verification, /has_function_privilege/);
  assert.match(rollback, /drop trigger if exists guard_shared_avatar_origins/);
});
