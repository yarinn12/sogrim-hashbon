import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829213000_enable_shared_event_notes.sql",
    import.meta.url
  ),
  "utf8"
);
const verification = readFileSync(
  new URL(
    "../supabase/verification/verify_20260829213000_shared_event_notes.sql",
    import.meta.url
  ),
  "utf8"
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8"
);

test("shared event notes are guarded and editable by authorized members", () => {
  for (const source of [migration, schema]) {
    assert.match(
      source,
      /private\.has_valid_shared_event_notes\(p_state jsonb\)/
    );
    assert.match(
      source,
      /private\.is_safe_shared_event_notes_update\([\s\S]*?p_actor_participant_id text/
    );
    assert.match(source, /create trigger guard_shared_event_notes/);
    assert.match(source, /'notes'/);
    assert.match(source, /'deletedNotes'/);
    assert.match(source, /Shared event note update is not authorized/);
  }
});

test("the shared note deployment verifies the real authorization boundary", () => {
  assert.match(verification, /valid member note edit was rejected/i);
  assert.match(verification, /forged note editor was accepted/i);
  assert.match(verification, /oversized note title was accepted/i);
  assert.match(verification, /guard_shared_event_notes/);
});
