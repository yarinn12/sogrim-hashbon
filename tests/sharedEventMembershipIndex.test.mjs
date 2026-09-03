import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260828181500_index_shared_event_membership_workspaces.sql",
  "utf8"
);
const schema = await readFile("supabase/schema.sql", "utf8");
const server = await readFile("src/server/eventInvites.mjs", "utf8");
const audit = await readFile(
  "scripts/audit-shared-event-visibility-live.mjs",
  "utf8"
);

test("active event membership is indexed into the recipient workspace immediately", () => {
  for (const sql of [migration, schema]) {
    assert.match(
      sql,
      /create or replace function public\.index_shared_event_for_member\(/
    );
    assert.match(
      sql,
      /private\.shared_snapshot_members[\s\S]*?status = 'active'/
    );
    assert.match(
      sql,
      /sharedSpaceKey', 'member_access_recovery_v1_key_0001'/
    );
    assert.match(
      sql,
      /pg_catalog\.set_config\([\s\S]*?'request\.jwt\.claim\.sub'[\s\S]*?p_user_id::text/
    );
    assert.match(
      sql,
      /revoke all on function public\.index_shared_event_for_member\(text, uuid\)[\s\S]*?from public, anon, authenticated/
    );
    assert.match(
      sql,
      /grant execute on function public\.index_shared_event_for_member\(text, uuid\)[\s\S]*?to service_role/
    );
  }
  assert.match(
    server,
    /activateInviteMembership\([\s\S]*?indexSharedEventForMember\(/
  );
  assert.match(
    server,
    /canonicalParticipantReady[\s\S]*?if \(canonicalParticipantReady\) \{[\s\S]*?indexSharedEventForMember\(/
  );
  assert.match(server, /indexPending: !canonicalParticipantReady/);
  assert.match(
    server,
    /\/rest\/v1\/rpc\/index_shared_event_for_member/
  );
  assert.match(
    audit,
    /ok: anomalies\.length === 0 && recoverableIndexes\.length === 0/
  );
  assert.match(
    audit,
    /if \(anomalies\.length \|\| recoverableIndexes\.length\) process\.exitCode = 1/
  );
});
