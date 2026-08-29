import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources = [
  readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  readFileSync(
    new URL(
      "../supabase/migrations/20260829141500_connected_event_publication_health.sql",
      import.meta.url
    ),
    "utf8"
  )
];
const verification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260829141500_connected_event_publication_health.sql",
    import.meta.url
  ),
  "utf8"
);

for (const source of sources) {
  test("operations detect active creator events stranded before publication", () => {
    assert.match(source, /admin_connected_event_publication_health\(\)/);
    assert.match(source, /activeUnsharedMultiAccountCreatorEvents/);
    assert.match(source, /createdByParticipantId/);
    assert.match(source, /sharedSpaceId/);
    assert.match(source, /inactiveParticipantIds/);
    assert.match(source, /participant\.participant_id ~\*/);
    assert.match(source, /revoke all[\s\S]*from public, anon, authenticated/);
    assert.match(source, /grant execute[\s\S]*to service_role/);
  });
}

test("publication health migration is bounded and independently verified", () => {
  const migration = sources[1];
  assert.match(migration, /^begin;/);
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /set local statement_timeout = '90s'/);
  assert.match(migration, /commit;\s*$/);
  assert.match(verification, /health RPC is missing/);
  assert.match(verification, /health RPC is exposed/);
  assert.match(verification, /health RPC is unavailable/);
});
