import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { addEventNote, removeEventNote } from "../src/domain/eventNotes.mjs";
import {
  mergeSharedEventIntoState,
  mergeSharedEventWriteState,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";

const credentials = { id: "space-note-convergence", key: "note_convergence_key_1234567890123456" };
const config = {
  storage: {
    mode: "supabase", url: "https://example.supabase.co", anonKey: "test-anon",
    table: "app_snapshots", spaceId: "space-member-account", spaceKey: credentials.key,
    account: { userId: "member", accessToken: "test-token", spaceId: "space-member-account" }
  }
};

function scenario(localDeletedAt = "2026-09-03T08:02:00.000Z") {
  let initial = {
    currentParticipantId: "account-owner",
    participants: [
      { id: "account-owner", displayName: "Owner" },
      { id: "account-member", displayName: "Member" }
    ],
    groups: [],
    events: [{
      id: "event-notes", name: "Notes", participantIds: ["account-owner", "account-member"],
      adminIds: ["account-owner"], createdByParticipantId: "account-owner",
      adminsCanEditOnly: false, locked: false, expenses: [], transfers: [],
      sharedSpaceId: credentials.id, sharedSpaceKey: credentials.key
    }]
  };
  initial = addEventNote(initial, "event-notes", {
    id: "note-delete", body: "Shared", createdAt: "2026-09-03T08:00:00.000Z"
  });
  const canonical = removeEventNote(initial, "event-notes", "note-delete", {
    participantId: "account-owner", deletedAt: "2026-09-03T08:01:00.000Z"
  });
  let local = removeEventNote(initial, "event-notes", "note-delete", {
    participantId: "account-member", deletedAt: localDeletedAt
  });
  local = addEventNote(local, "event-notes", {
    id: "note-companion", body: "Must still save", participantId: "account-member",
    createdAt: "2026-09-03T08:03:00.000Z"
  });
  local.currentParticipantId = "account-member";
  return { initial, canonical, local };
}

function assertConverged(state, canonical) {
  const event = state.events.find((item) => item.id === "event-notes");
  assert.deepEqual(event.deletedNotes, canonical.events[0].deletedNotes);
  assert.deepEqual(event.notes.map((note) => note.id), ["note-companion"]);
}

for (const localDeletedAt of [
  "2026-09-03T08:00:30.000Z", "2026-09-03T08:01:00.000Z", "2026-09-03T08:02:00.000Z"
]) {
  test(`shared note writes retain the committed deletion despite local clock ${localDeletedAt}`, () => {
    const { canonical, local } = scenario(localDeletedAt);
    const before = structuredClone({ canonical, local });
    assertConverged(mergeSharedEventWriteState(canonical, local, config), canonical);
    assert.deepEqual({ canonical, local }, before);
  });
}

test("refresh adopts committed note deletions without losing pending notes or personal context", () => {
  const { canonical, local } = scenario();
  local.groups = [{ id: "personal-group", name: "Personal" }];
  local.events[0].groupId = "personal-group";
  local.events.push({ id: "local-only", name: "Local", notes: [] });
  const refreshed = mergeSharedEventIntoState(local, canonical, credentials);
  assertConverged(refreshed, canonical);
  assert.equal(refreshed.currentParticipantId, "account-member");
  assert.equal(refreshed.events.find((event) => event.id === "event-notes").groupId, "personal-group");
  assert.deepEqual(refreshed.events.find((event) => event.id === "local-only"), local.events[1]);
});

test("two devices signed into the same regular member keep the first committed deletion", () => {
  const { canonical, local } = scenario();
  canonical.events[0].deletedNotes[0].deletedByParticipantId = "account-member";
  assertConverged(mergeSharedEventWriteState(canonical, local, config), canonical);
  assertConverged(mergeSharedEventIntoState(local, canonical, credentials), canonical);
});

test("new deletions are retained and old tombstones cannot remove a different pending note", () => {
  const { initial, canonical, local } = scenario();
  assertConverged(mergeSharedEventWriteState(initial, local, config), local);
  const ownerConfig = { storage: { account: { userId: "owner" } } };
  assertConverged(mergeSharedEventWriteState(canonical, local, ownerConfig), canonical);
});

test("a note deletion arriving during conflict retry does not poison the queued companion note", async () => {
  const { initial, canonical, local } = scenario();
  let attempts = 0;
  const result = await saveCloudStateWithConflictRetry({
    state: mergeSharedEventWriteState(initial, local, config),
    loadLatest: async () => canonical,
    mergeStates: (latest, pending) => mergeSharedEventWriteState(latest, pending, config),
    retryDelay: () => 0,
    save: async (candidate) => {
      if (++attempts === 1) throw Object.assign(new Error("Conflict"), { code: "CLOUD_STATE_CONFLICT" });
      assertConverged(candidate, canonical);
    }
  });
  assert.equal(attempts, 2);
  assertConverged(result.state, canonical);
});

test("saving and saving again return the canonical deletion instead of reviving the stale local record", async () => {
  const { canonical, local } = scenario();
  let stored = canonical;
  let writes = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/rpc/update_shared_event_snapshot")) {
      const body = JSON.parse(options.body);
      assertConverged(body.p_state, canonical);
      stored = body.p_state;
      writes += 1;
      return Response.json({ status: "updated", updatedAt: "2026-09-03T08:04:00.000Z" });
    }
    assert.equal(options.method ?? "GET", "GET");
    return Response.json([{ state: stored, updated_at: "2026-09-03T08:03:00.000Z" }]);
  };
  const saved = await saveSharedEventState(config, local, "event-notes", fetchImpl);
  assertConverged(saved, canonical);
  assertConverged(await saveSharedEventState(config, saved, "event-notes", fetchImpl), canonical);
  assert.equal(writes, 2);
});

test("legacy deletion normalization ships identically in the migration and fresh schema", async () => {
  const migration = await readFile("supabase/migrations/20260903213000_idempotent_shared_note_deletions.sql", "utf8");
  const schema = await readFile("supabase/schema.sql", "utf8");
  for (const name of ["preserve_committed_note_deletions", "normalize_repeated_shared_note_deletions"]) {
    const pattern = new RegExp(`create or replace function private\\.${name}\\([^]*?\\n\\$\\$;`);
    assert.ok(migration.match(pattern));
    assert.equal(migration.match(pattern)[0], schema.match(pattern)?.[0]);
  }
  assert.match(migration, /before update of state on public\.app_snapshots/);
  assert.match(migration, /create trigger ab_normalize_repeated_shared_note_deletions/);
  assert.doesNotMatch(migration, /drop trigger.*guard_shared_event_notes/);
});

test("database verification checks real duplicate deletion behavior and preserves authorization", async () => {
  const verification = await readFile("supabase/verification/verify_20260903213000_idempotent_shared_note_deletions.sql", "utf8");
  for (const marker of [
    "A duplicate deletion still blocks the companion note",
    "Normalization bypassed note authorship permissions",
    "Normalization allowed committed deletion history to disappear",
    "Normalization bypassed permissions on a different deletion",
    "Normalization crossed event identity boundaries"
  ]) assert.ok(verification.includes(marker));
  assert.match(verification, /tgenabled = 'O'/);
  assert.match(verification, /has_function_privilege/);
});

test("live regression covers current and legacy clients plus the rejected-write state", async () => {
  const probe = await readFile("scripts/verify-atomic-shared-event-notes-live.mjs", "utf8");
  assert.match(probe, /concurrentDeletionWithCompanionNoteSynced: true/);
  assert.match(probe, /legacyDuplicateDeletionAccepted: true/);
  assert.match(probe, /unauthorizedNoteEditStillBlocked: true/);
  assert.match(probe, /assert\.deepEqual\(afterRejectedWrite, legacySaved\)/);
});
