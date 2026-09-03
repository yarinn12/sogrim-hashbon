import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("../supabase/migrations/20260904003000_note_field_clocks.sql");
const schema = read("../supabase/schema.sql");

test("fresh installs and incremental upgrades use the same clock functions", () => {
  for (const name of ["has_valid_note_field_clocks", "has_valid_shared_event_notes", "normalize_note_field_clocks", "normalize_shared_note_field_clocks"]) {
    const extract = (source) => {
      const start = source.indexOf(`create or replace function private.${name}(`);
      assert.ok(start >= 0);
      return source.slice(start, source.indexOf("\n$$;", start) + 4);
    };
    assert.equal(extract(schema), extract(migration), name);
  }
});

test("clock rollout verifies before commit and keeps existing authorization guards", () => {
  const script = read("../scripts/apply-note-field-clocks.mjs");
  assert.match(script, /verification \+ \(dryRun \? "\\nrollback;" : "\\ncommit;"\)/);
  assert.match(script, /verify_20260903223000_preserve_complete_note_history/);
  assert.doesNotMatch(migration, /drop (?:function|trigger).*guard_/i);
  assert.doesNotMatch(migration, /create or replace function private.is_safe_shared_event_notes_update/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /jsonb_array_length\(notes_value\) > 100/);
});
