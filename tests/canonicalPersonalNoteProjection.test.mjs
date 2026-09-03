import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260903203000_preserve_canonical_notes_in_personal_writes.sql", "utf8"
);
const schema = await readFile("supabase/schema.sql", "utf8");
const verification = await readFile(
  "supabase/verification/verify_20260903203000_preserve_canonical_notes_in_personal_writes.sql", "utf8"
);
const liveProbe = await readFile("scripts/verify-atomic-shared-event-notes-live.mjs", "utf8");
const deploy = await readFile("scripts/apply-canonical-personal-note-projection.mjs", "utf8");

test("personal note projection has identical migration and fresh-schema definitions", () => {
  const definition = (source) => source.match(
    /create or replace function private\.project_canonical_notes_into_workspace\(\)[^]*?\n\$\$;/
  )?.[0];
  assert.ok(definition(migration));
  assert.equal(definition(schema), definition(migration));
  assert.match(migration, /before insert or update of state on public\.app_snapshots/);
  assert.match(migration, /revoke all on function private\.project_canonical_notes_into_workspace\(\)/);
});

test("personal note projection is restricted to the owner's active matching event", () => {
  assert.match(migration, /auth\.uid\(\) is distinct from new\.owner_user_id/);
  assert.match(migration, /member\.user_id = new\.owner_user_id/);
  assert.match(migration, /member\.status = 'active'/);
  assert.match(migration, /member\.removed_at is null/);
  assert.match(migration, /shared\.id = personal_event\.value ->> 'sharedSpaceId'/);
  assert.match(migration, /shared\.state -> 'events' -> 0 ->> 'id' =\s*personal_event\.value ->> 'id'/);
  assert.match(migration, /'inactiveParticipantIds'/);
  assert.doesNotMatch(migration, /for (update|share)/i);
});

test("personal projection replaces only notes and tombstones and preserves event ordering", () => {
  assert.match(migration, /case when canonical\.event is null then personal_event\.value/);
  assert.match(migration, /else personal_event\.value \|\| pg_catalog\.jsonb_build_object/);
  assert.match(migration, /'notes', coalesce\(canonical\.event -> 'notes'/);
  assert.match(migration, /'deletedNotes', coalesce\(canonical\.event -> 'deletedNotes'/);
  assert.match(migration, /order by personal_event\.ordinality/);
  assert.match(migration, /new\.state, '\{events\}', projected_events, true/);
});

test("rollout supports transactional dry-run and verifies enabled trigger and privileges", () => {
  assert.match(deploy, /process\.argv\.includes\("--dry-run"\)/);
  assert.match(deploy, /if \(apply && dryRun\) throw/);
  assert.match(deploy, /\(\) => verification \+ "\\nrollback;"/);
  assert.match(verification, /tgenabled = 'O'/);
  assert.match(verification, /has_function_privilege/);
});

test("live regression covers stale edits, deletes, overlapping saves and offline candidates", () => {
  for (const marker of [
    "staleWorkspaceCannotOverwriteNotes: true",
    "staleWorkspaceCannotResurrectNotes: true",
    "unrelatedPersonalDataPreserved: true",
    "concurrentWorkspaceWritesVerified: 3",
    "offlineCandidatePublished: true"
  ]) assert.ok(liveProbe.includes(marker), marker);
  assert.match(liveProbe, /await Promise\.all\(/);
  assert.match(liveProbe, /assert\.deepEqual\(memberState, pendingCandidate\)/);
});
