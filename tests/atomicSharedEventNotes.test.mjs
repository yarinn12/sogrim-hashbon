import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260903193000_atomic_shared_event_note_replication.sql",
  "utf8"
);
const schema = await readFile("supabase/schema.sql", "utf8");
const verification = await readFile(
  "supabase/verification/verify_20260903193000_atomic_shared_event_note_replication.sql",
  "utf8"
);
const deploy = await readFile(
  "scripts/apply-atomic-shared-event-note-replication.mjs",
  "utf8"
);
const liveProbe = await readFile(
  "scripts/verify-atomic-shared-event-notes-live.mjs",
  "utf8"
);
const visibilityAudit = await readFile(
  "scripts/audit-shared-event-visibility-live.mjs",
  "utf8"
);

function latestFunction(source, name) {
  const escaped = name.replaceAll(".", "\\.");
  const matches = [...source.matchAll(
    new RegExp(`create or replace function ${escaped}\\([^]*?\\n\\$\\$;`, "g")
  )];
  assert.ok(matches.length, `${name} was not found`);
  return matches.at(-1)[0];
}

test("canonical note changes replicate to every active personal workspace", () => {
  for (const source of [migration, schema]) {
    const sync = latestFunction(
      source,
      "private.sync_shared_event_notes_to_workspaces"
    );
    assert.match(sync, /member\.status = 'active'/);
    assert.match(sync, /member\.removed_at is null/);
    assert.match(sync, /order by member\.user_id/);
    assert.match(sync, /for update of personal/);
    assert.match(sync, /'notes', canonical_notes/);
    assert.match(sync, /'deletedNotes', canonical_deleted_notes/);
    assert.match(sync, /'\{participants\}'/);
    assert.match(sync, /'\{events\}'/);
    assert.match(sync, /request\.jwt\.claim\.sub/);
    assert.match(sync, /exception[\s\S]*?when others[\s\S]*?raise/);

    const mirror = latestFunction(source, "private.mirror_shared_event_notes");
    assert.match(mirror, /tg_op = 'INSERT'/);
    assert.match(mirror, /old_event -> 'notes'/);
    assert.match(mirror, /old_event -> 'deletedNotes'/);
    assert.match(mirror, /old_event -> 'participantIds'/);
    assert.match(mirror, /old_event -> 'inactiveParticipantIds'/);
    assert.match(
      mirror,
      /private\.sync_shared_event_notes_to_workspaces\([\s\S]*?new\.updated_at/
    );
  }

  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /create trigger zzz_mirror_shared_event_notes/);
  assert.match(
    migration,
    /revoke all on function private\.sync_shared_event_notes_to_workspaces\([\s\S]*?from public, anon, authenticated/
  );
});

test("note replication rollout is explicit and verifies the installed trigger", () => {
  assert.match(deploy, /process\.argv\.includes\("--apply"\)/);
  assert.match(deploy, /if \(apply\) await sql\.unsafe\(migration\)/);
  assert.match(deploy, /await sql\.unsafe\(verification\)/);
  assert.match(verification, /pg_get_triggerdef/);
  assert.match(verification, /zzz_mirror_shared_event_notes/);
  assert.match(verification, /Shared-event notes are not replicated transactionally/);
});

test("live QA proves create, edit and delete before a recipient client refresh", () => {
  assert.match(liveProbe, /recipientClientReadsBeforeCreateAssertion: 0/);
  assert.match(liveProbe, /await assertNoteEverywhere\("נוצר אצל בעל האירוע"/);
  assert.match(liveProbe, /await assertNoteEverywhere\("נערך אצל החבר"/);
  assert.match(liveProbe, /await assertNoteEverywhere\("", true/);
  assert.match(liveProbe, /both_workspaces_indexed/);
  assert.match(liveProbe, /personal_note_state_matches/);
  assert.match(liveProbe, /personal_tombstone_state_matches/);
  assert.match(liveProbe, /Atomic shared-note QA cleanup failed/);
});

test("the production visibility audit detects stale note indexes", () => {
  assert.match(visibilityAudit, /workspaceNotesMatchCanonical/);
  assert.match(visibilityAudit, /workspaceDeletedNotesMatchCanonical/);
  assert.match(
    visibilityAudit,
    /!item\.workspaceNotesMatchCanonical[\s\S]*?!item\.workspaceDeletedNotesMatchCanonical/
  );
});
