import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

import {
  accountProfileFromUser,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import { loadCloudState, readCloudState, saveCloudState } from "../src/data/cloudStore.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";
import {
  buildSharedEventState,
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import {
  addEventNote,
  removeEventNote,
  updateEventNote
} from "../src/domain/eventNotes.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error("Database URL is required");

const origin = String(
  process.env.TWO_ACCOUNT_QA_ORIGIN || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const eventId = `event-atomic-notes-${suffix}`;
const noteId = `note-atomic-${suffix}`;
const eventSpace = {
  id: `space-atomic-notes-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const createdUserIds = [];
const createdSpaceIds = new Set([eventSpace.id]);
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require"
});

try {
  const owner = await createAccount("owner", "בעל פתק אטומי");
  const member = await createAccount("member", "חבר פתק אטומי");
  const ownerProfile = accountProfileFromUser(owner.session.user);
  const memberProfile = accountProfileFromUser(member.session.user);
  const ownerConfig = runtimeConfig(owner);
  const memberConfig = runtimeConfig(member);

  let ownerState = accountState(ownerProfile);
  let memberState = accountState(memberProfile);
  await saveCloudState(ownerConfig, ownerState);
  await saveCloudState(memberConfig, memberState);

  ownerState.events = [sharedEvent(ownerProfile)];
  await saveCloudState(ownerConfig, ownerState);
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);

  const inviteResponse = await fetch(`${origin}/api/event-invites/open-link`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${owner.session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ eventId, candidateToken: "", operation: "ensure" })
  });
  const invite = await inviteResponse.json().catch(() => ({}));
  assert.equal(inviteResponse.ok, true, JSON.stringify(invite));

  const redeemResponse = await fetch(`${origin}/api/event-invites/redeem`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${member.session.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ eventId, token: invite.token })
  });
  const redeem = await redeemResponse.json().catch(() => ({}));
  assert.equal(redeemResponse.ok, true, JSON.stringify(redeem));
  assert.equal(redeem.atomic, true);

  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  ownerState = addEventNote(ownerState, eventId, {
    id: noteId,
    title: "בדיקת שכפול אטומי",
    body: "נוצר אצל בעל האירוע",
    participantId: ownerProfile.participantId
  });
  const createStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  const createElapsedMs = elapsed(createStartedAt);
  await assertNoteEverywhere("נוצר אצל בעל האירוע", false, owner, member);

  memberState = await loadCloudState(memberConfig, memberState);
  memberState = await refreshSharedEvents(memberConfig, memberState);
  memberState = updateEventNote(memberState, eventId, noteId, {
    body: "נערך אצל החבר",
    participantId: memberProfile.participantId
  });
  const editStartedAt = performance.now();
  memberState = await saveSharedEventState(memberConfig, memberState, eventId);
  const editElapsedMs = elapsed(editStartedAt);
  await assertNoteEverywhere("נערך אצל החבר", false, owner, member);

  // A background read can advance the account version while an older local
  // save is queued. Even with a current version token, that stale workspace
  // must not overwrite notes already committed to the canonical event.
  ownerState.groups = [{
    id: `group-personal-${suffix}`,
    name: "שינוי אישי שנשמר במקביל",
    participantIds: [ownerProfile.participantId]
  }];
  const localOnlyEvent = structuredClone(ownerState.events[0]);
  localOnlyEvent.id = `event-local-only-${suffix}`;
  delete localOnlyEvent.sharedSpaceId;
  delete localOnlyEvent.sharedSpaceKey;
  ownerState.events.push(localOnlyEvent);
  await loadCloudState(ownerConfig, ownerState);
  await saveCloudState(ownerConfig, ownerState);
  await assertNoteEverywhere("נערך אצל החבר", false, owner, member);
  const projectedOwnerState = await loadCloudState(ownerConfig, ownerState);
  assert.deepEqual(projectedOwnerState.groups, ownerState.groups);
  assert.deepEqual(
    projectedOwnerState.events.find((event) => event.id === localOnlyEvent.id),
    localOnlyEvent
  );

  // Exercise overlapping personal/canonical writes, including conflict retry.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const body = `עריכה במקביל ${attempt}`;
    memberState = updateEventNote(memberState, eventId, noteId, {
      body,
      participantId: memberProfile.participantId
    });
    const [, savedMemberState] = await Promise.all([
      saveCloudStateWithConflictRetry({
        state: ownerState,
        loadLatest: () => loadCloudState(ownerConfig, ownerState),
        save: (candidate) => saveCloudState(ownerConfig, candidate)
      }),
      saveSharedEventState(memberConfig, memberState, eventId)
    ]);
    memberState = savedMemberState;
    await assertNoteEverywhere(body, false, owner, member);
  }

  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  ownerState = removeEventNote(ownerState, eventId, noteId, {
    participantId: ownerProfile.participantId
  });
  const deleteStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  const deleteElapsedMs = elapsed(deleteStartedAt);
  await assertNoteEverywhere("", true, owner, member);

  // The member still holds the pre-deletion note. Replaying that personal
  // snapshot must retain the canonical tombstone, not resurrect the note.
  await loadCloudState(memberConfig, memberState);
  await saveCloudState(memberConfig, memberState);
  await assertNoteEverywhere("", true, owner, member);

  // Both devices removed the same note before receiving each other's update.
  // The member also has a new note queued: a redundant deletion must not block
  // that unrelated write, and the returned state must retain the committed
  // tombstone so the next save cannot reintroduce the same conflict.
  const committedDeletion = ownerState.events.find((event) => event.id === eventId)
    .deletedNotes.find((item) => item.id === noteId);
  memberState = removeEventNote(memberState, eventId, noteId, {
    participantId: memberProfile.participantId,
    deletedAt: new Date(Date.parse(committedDeletion.deletedAt) + 1).toISOString()
  });
  const companionNoteId = `note-companion-${suffix}`;
  memberState = addEventNote(memberState, eventId, {
    id: companionNoteId,
    body: "מחיקה מקבילה לא חוסמת פתק חדש",
    participantId: memberProfile.participantId
  });
  memberState = await saveSharedEventState(memberConfig, memberState, eventId);
  assert.deepEqual(
    memberState.events.find((event) => event.id === eventId)
      .deletedNotes.find((item) => item.id === noteId),
    committedDeletion
  );
  await assertNoteEverywhere("", true, owner, member);
  for (const account of [owner, member]) {
    const loaded = await loadCloudState(runtimeConfig(account), memberState);
    const event = loaded.events.find((item) => item.id === eventId);
    assert.equal(event.notes.some((item) => item.id === companionNoteId), true);
    assert.deepEqual(event.deletedNotes.find((item) => item.id === noteId), committedDeletion);
  }

  // Emulate an old app that sends its newer duplicate deletion directly to
  // the write RPC, without the new client's canonical merge protection.
  const legacyNoteId = `note-legacy-${suffix}`;
  const legacyCandidate = addEventNote(memberState, eventId, {
    id: legacyNoteId,
    body: "גם לקוח ישן ממשיך לשמור",
    participantId: memberProfile.participantId
  });
  const legacyPayload = buildSharedEventState(legacyCandidate, eventId);
  legacyPayload.events[0].deletedNotes = legacyPayload.events[0].deletedNotes.map((item) =>
    item.id === noteId ? {
      ...item,
      deletedAt: new Date(Date.parse(committedDeletion.deletedAt) + 2).toISOString(),
      deletedByParticipantId: memberProfile.participantId
    } : item
  );
  const sharedConfig = {
    ...memberConfig,
    storage: {
      ...memberConfig.storage,
      spaceId: eventSpace.id,
      spaceKey: eventSpace.key,
      snapshotKind: "shared_event"
    }
  };
  await readCloudState(sharedConfig);
  await saveCloudState(sharedConfig, legacyPayload);
  const legacySaved = await readCloudState(sharedConfig);
  assert.deepEqual(legacySaved.events[0].deletedNotes.find((item) => item.id === noteId), committedDeletion);
  assert.equal(legacySaved.events[0].notes.some((item) => item.id === legacyNoteId), true);
  for (const account of [owner, member]) {
    const loaded = await loadCloudState(runtimeConfig(account), memberState);
    const event = loaded.events.find((item) => item.id === eventId);
    assert.equal(event.notes.some((item) => item.id === legacyNoteId), true);
    assert.deepEqual(event.deletedNotes.find((item) => item.id === noteId), committedDeletion);
  }

  // A genuinely unauthorized edit must still be rejected after normalization.
  const forbiddenPayload = structuredClone(legacyPayload);
  const forbiddenNote = forbiddenPayload.events[0].notes.find((item) => item.id === companionNoteId);
  forbiddenNote.body = "forged editor";
  forbiddenNote.updatedAt = new Date(Math.max(Date.now(), Date.parse(forbiddenNote.updatedAt) + 1)).toISOString();
  forbiddenNote.updatedByParticipantId = ownerProfile.participantId;
  await assert.rejects(saveCloudState(sharedConfig, forbiddenPayload), (error) => error.status === 403);
  const afterRejectedWrite = await readCloudState(sharedConfig);
  assert.deepEqual(afterRejectedWrite, legacySaved);

  // Offline retry saves a personal candidate before publishing to the shared
  // event. Projection must not mutate that candidate or discard its pending
  // note when the canonical write subsequently runs.
  memberState = await refreshSharedEvents(memberConfig, memberState);
  const offlineNoteId = `note-offline-${suffix}`;
  memberState = addEventNote(memberState, eventId, {
    id: offlineNoteId,
    body: "פתק שנשמר אחרי חזרה לחיבור",
    participantId: memberProfile.participantId
  });
  const pendingCandidate = structuredClone(memberState);
  await loadCloudState(memberConfig, memberState);
  await saveCloudState(memberConfig, memberState);
  assert.deepEqual(memberState, pendingCandidate);
  memberState = await saveSharedEventState(memberConfig, memberState, eventId);
  for (const account of [owner, member]) {
    const loaded = await loadCloudState(runtimeConfig(account), memberState);
    const note = loaded.events.find((event) => event.id === eventId)
      ?.notes?.find((item) => item.id === offlineNoteId);
    assert.equal(note?.body, "פתק שנשמר אחרי חזרה לחיבור");
  }

  console.log(JSON.stringify({
    ok: true,
    recipientClientReadsBeforeCreateAssertion: 0,
    atomicPersonalWorkspaceReplication: true,
    createElapsedMs,
    editElapsedMs,
    deleteElapsedMs,
    createReplicated: true,
    editReplicated: true,
    deleteReplicated: true,
    staleWorkspaceCannotOverwriteNotes: true,
    staleWorkspaceCannotResurrectNotes: true,
    unrelatedPersonalDataPreserved: true,
    concurrentWorkspaceWritesVerified: 3,
    concurrentDeletionWithCompanionNoteSynced: true,
    legacyDuplicateDeletionAccepted: true,
    unauthorizedNoteEditStillBlocked: true,
    offlineCandidatePublished: true,
    temporaryDataCleanup: true
  }));
} finally {
  const cleanupErrors = [];
  for (const spaceId of createdSpaceIds) {
    try {
      await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(spaceId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const userId of createdUserIds) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  await sql.end({ timeout: 5 });
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Atomic shared-note QA cleanup failed");
  }
}

async function assertNoteEverywhere(expectedBody, deleted, owner, member) {
  const [result] = await sql`
    with target_workspaces as (
      select snapshot.id, snapshot.state
      from public.app_snapshots as snapshot
      where snapshot.id in (${owner.workspace.id}, ${member.workspace.id})
    ),
    indexed_events as (
      select workspace.id, event_item.value as event
      from target_workspaces as workspace
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(workspace.state -> 'events', '[]'::jsonb)
      ) as event_item(value)
      where event_item.value ->> 'id' = ${eventId}
        and event_item.value ->> 'sharedSpaceId' = ${eventSpace.id}
    )
    select
      (
        select count(*) = 2
        from indexed_events
      ) as both_workspaces_indexed,
      (
        select count(*) = ${deleted ? 0 : 2}
        from indexed_events as indexed
        where exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(indexed.event -> 'notes', '[]'::jsonb)
          ) as note(value)
          where note.value ->> 'id' = ${noteId}
            and note.value ->> 'body' = ${expectedBody}
        )
      ) as personal_note_state_matches,
      (
        select count(*) = ${deleted ? 2 : 0}
        from indexed_events as indexed
        where exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            coalesce(indexed.event -> 'deletedNotes', '[]'::jsonb)
          ) as deletion(value)
          where deletion.value ->> 'id' = ${noteId}
        )
      ) as personal_tombstone_state_matches,
      exists (
        select 1
        from public.app_snapshots as shared
        where shared.id = ${eventSpace.id}
          and (
            ${deleted}::boolean
            and exists (
              select 1
              from pg_catalog.jsonb_array_elements(
                coalesce(
                  shared.state -> 'events' -> 0 -> 'deletedNotes',
                  '[]'::jsonb
                )
              ) as deletion(value)
              where deletion.value ->> 'id' = ${noteId}
            )
            or not ${deleted}::boolean
            and exists (
              select 1
              from pg_catalog.jsonb_array_elements(
                coalesce(shared.state -> 'events' -> 0 -> 'notes', '[]'::jsonb)
              ) as note(value)
              where note.value ->> 'id' = ${noteId}
                and note.value ->> 'body' = ${expectedBody}
            )
          )
      ) as canonical_state_matches
  `;

  const evidence = JSON.stringify(result);
  assert.equal(result?.both_workspaces_indexed, true, evidence);
  assert.equal(result?.personal_note_state_matches, true, evidence);
  assert.equal(result?.personal_tombstone_state_matches, true, evidence);
  assert.equal(result?.canonical_state_matches, true, evidence);
}

async function createAccount(role, displayName) {
  const workspace = {
    id: `space-atomic-notes-${role}-${suffix}`,
    key: randomBytes(32).toString("base64url")
  };
  const email = `qa-atomic-notes-${role}-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const username = `qa_atomic_notes_${role}_${randomBytes(4).toString("hex")}`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        username,
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  createdUserIds.push(user.id);
  createdSpaceIds.add(workspace.id);
  const session = await signInWithPassword(
    { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
    { email, password }
  );
  assert.equal(session.user.id, user.id);
  return { session, workspace };
}

function runtimeConfig(account) {
  return {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: account.workspace.id,
      spaceKey: account.workspace.key,
      account: {
        userId: account.session.user.id,
        accessToken: account.session.access_token,
        spaceId: account.workspace.id
      }
    }
  };
}

function accountState(profile) {
  return {
    currentParticipantId: profile.participantId,
    participants: [participant(profile)],
    groups: [],
    events: [],
    deletedEvents: [],
    deletedParticipants: []
  };
}

function participant(profile) {
  return {
    id: profile.participantId,
    displayName: profile.displayName,
    kind: "user",
    authProvider: profile.authProvider,
    authSubject: profile.authSubject,
    email: profile.email,
    accountLinked: true
  };
}

function sharedEvent(profile) {
  const now = new Date().toISOString();
  return {
    id: eventId,
    name: "בדיקת פתקים אטומית",
    eventType: "standard",
    currency: "ILS",
    participantIds: [profile.participantId],
    adminIds: [profile.participantId],
    createdByParticipantId: profile.participantId,
    adminsCanEditOnly: false,
    roundSettlementTransfers: false,
    locked: false,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    sharedSpaceId: eventSpace.id,
    sharedSpaceKey: eventSpace.key,
    inactiveParticipantIds: [],
    participantAliases: {},
    distinctParticipantPairs: [],
    expenses: [],
    deletedExpenses: [],
    activityLog: [],
    transfers: []
  };
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || payload.error ||
        `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for atomic shared-note QA.`);
  return value;
}
