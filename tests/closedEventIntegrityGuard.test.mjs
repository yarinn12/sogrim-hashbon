import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, schema, notificationServer] = await Promise.all([
  readFile("supabase/migrations/20260902093000_guard_closed_shared_event_integrity.sql", "utf8"),
  readFile("supabase/schema.sql", "utf8"),
  readFile("src/server/eventActivityNotifications.mjs", "utf8")
]);

for (const [label, source] of [["migration", migration], ["schema", schema]]) {
  test(`${label} blocks notes and account links after an event closes`, () => {
    assert.match(source, /create or replace function private\.guard_closed_shared_event_integrity/);
    assert.match(source, /old_is_closed[\s\S]*?old_event -> 'notes'/);
    assert.match(source, /old_event -> 'deletedNotes'/);
    assert.match(source, /old_event -> 'participantAccountLinks'/);
    assert.match(source, /Closed event notes and account links cannot be changed/);
  });

  test(`${label} binds event-closed activity to one admin close transition`, () => {
    assert.match(source, /Event close activity is append-only/);
    assert.match(source, /added_closed_count <> 1/);
    assert.match(source, /event_admin_ids\(old\.state\)/);
    assert.match(source, /actorParticipantId'[\s\S]*?actor_participant_id/);
    assert.match(source, /occurredAt'[\s\S]*?new_event ->> 'closedAt'/);
  });
}

test("notification delivery independently verifies canonical closed state", () => {
  const start = notificationServer.indexOf("function activityBelongsToSender");
  const end = notificationServer.indexOf("function isActiveEventParticipant", start);
  const helper = notificationServer.slice(start, end);
  assert.match(helper, /event\?\.locked === true/);
  assert.match(helper, /event\?\.adminIds\?\.includes\(senderParticipantId\)/);
  assert.match(helper, /closingActivity\?\.occurredAt[\s\S]*?=== closedAt/);
});
