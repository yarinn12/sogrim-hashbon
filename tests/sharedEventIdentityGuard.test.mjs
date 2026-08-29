import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20260828224500_unique_shared_event_identity.sql",
  "utf8"
);
const verification = fs.readFileSync(
  "supabase/verification/verify_20260828224500_unique_shared_event_identity.sql",
  "utf8"
);
const repair = fs.readFileSync(
  "scripts/repair-duplicate-shared-events-live.mjs",
  "utf8"
);

test("the database enforces one canonical shared snapshot per event id", () => {
  assert.match(migration, /create unique index if not exists app_snapshots_shared_event_event_id_uidx/i);
  assert.match(migration, /state #>> '\{events,0,id\}'/i);
  assert.match(migration, /snapshot_kind = 'shared_event'/i);
  assert.match(verification, /having count\(\*\) > 1/i);
});

test("duplicate repair is backup-first and rejects active references", () => {
  assert.ok(repair.indexOf("writeBackup(backup, plans)") < repair.indexOf("delete from public.app_snapshots"));
  assert.match(repair, /personal_references !== 0 \|\| safety\.active_invites !== 0/);
  assert.match(repair, /protected activity history; refusing repair/);
  assert.match(repair, /Duplicate snapshot set changed after backup; refusing repair/);
});
