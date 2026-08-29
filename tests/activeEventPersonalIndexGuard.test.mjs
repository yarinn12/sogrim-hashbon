import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../supabase/schema.sql", import.meta.url);
const migrationUrl = new URL(
  "../supabase/migrations/20260828203000_guard_active_event_personal_index.sql",
  import.meta.url
);
const verificationUrl = new URL(
  "../supabase/verification/verify_20260828203000_guard_active_event_personal_index.sql",
  import.meta.url
);
const memberMigrationUrl = new URL(
  "../supabase/migrations/20260828214500_guard_active_member_personal_event_identity.sql",
  import.meta.url
);
const memberVerificationUrl = new URL(
  "../supabase/verification/verify_20260828214500_guard_active_member_personal_event_identity.sql",
  import.meta.url
);

test("personal workspaces cannot drop an event with an active server membership", async () => {
  const [schema, migration, verification] = await Promise.all([
    fs.readFile(schemaUrl, "utf8"),
    fs.readFile(migrationUrl, "utf8"),
    fs.readFile(verificationUrl, "utf8")
  ]);

  for (const sql of [schema, migration]) {
    assert.match(sql, /member\.status = 'active'/);
    assert.match(sql, /member\.removed_at is null/);
    assert.match(
      sql,
      /Active shared member must remain active in its personal event/
    );
    assert.match(sql, /coalesce\(new\.state -> 'events', '\[\]'::jsonb\)/);
  }
  assert.match(
    verification,
    /Personal workspace guard does not protect active member identity/
  );
});

test("personal workspaces keep the active account inside its matching event", async () => {
  const [schema, migration, verification] = await Promise.all([
    fs.readFile(schemaUrl, "utf8"),
    fs.readFile(memberMigrationUrl, "utf8"),
    fs.readFile(memberVerificationUrl, "utf8")
  ]);

  for (const sql of [schema, migration]) {
    assert.match(sql, /personal_event\.value -> 'participantIds'/);
    assert.match(sql, /personal_event\.value -> 'inactiveParticipantIds'/);
    assert.match(
      sql,
      /Active shared member must remain active in its personal event/
    );
  }
  assert.match(
    verification,
    /Personal workspace guard does not protect active member identity/
  );
});
