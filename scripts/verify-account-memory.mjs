import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import {
  accountProfileFromUser,
  loadAccountUser,
  refreshAccountSession,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import { loadCloudState, saveCloudState } from "../src/data/cloudStore.mjs";
import { deleteEvent } from "../src/domain/appActions.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import { mergeSharedStates } from "../src/domain/sharedStateMerge.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState,
  saveSharedEventState,
  syncSharedEvents
} from "../src/data/sharedEventStore.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `qa-memory-${suffix}@example.test`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const workspace = {
  id: `space-qa-memory-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const eventWorkspace = {
  id: `space-qa-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};

let userId = "";
let snapshotCreated = false;
let eventSnapshotCreated = false;
let result = null;

try {
  const createdUser = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "בדיקת זיכרון אוטומטית",
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  userId = createdUser.id;
  assert.ok(userId, "Temporary account was not created");

  const authConfig = {
    storage: { mode: "supabase", url: supabaseUrl, anonKey }
  };
  const session = await signInWithPassword(authConfig, { email, password });
  assert.equal(session.user.id, userId);

  const profile = accountProfileFromUser(session.user);
  assert.equal(profile.participantId, `account-${userId}`);
  assert.equal(profile.displayName, "בדיקת זיכרון אוטומטית");
  assert.equal(profile.authProvider, "email");

  const refreshedSession = await refreshAccountSession(authConfig, session);
  assert.ok(refreshedSession.access_token);
  assert.notEqual(refreshedSession.refresh_token, "");
  const refreshedUser = await loadAccountUser(authConfig, refreshedSession);
  assert.equal(refreshedUser.id, userId);
  assert.equal(refreshedUser.user_metadata.account_space_id, workspace.id);
  assert.equal(refreshedUser.user_metadata.account_space_key, workspace.key);

  const ownerId = profile.participantId;
  const guestId = `guest-${randomUUID()}`;
  const eventId = `event-qa-memory-${suffix}`;
  const expense = {
    id: `expense-qa-memory-${suffix}`,
    name: "בדיקת שמירה בענן",
    total: 12345,
    payers: [{ participantId: ownerId, amount: 12345 }],
    sharedByParticipantIds: [ownerId, guestId],
    createdByParticipantId: ownerId,
    createdAt: new Date().toISOString()
  };
  const participants = [
    { id: ownerId, displayName: profile.displayName, kind: "user" },
    { id: guestId, displayName: "אורח בדיקה", kind: "guest" }
  ];
  const settlement = calculateSettlement(participants, [expense]);
  assert.deepEqual(settlement.issues, []);
  assert.equal(settlement.transfers.length, 1);
  assert.equal(settlement.transfers[0].fromParticipantId, guestId);
  assert.equal(settlement.transfers[0].toParticipantId, ownerId);
  assert.equal(settlement.transfers[0].amount, 6172);

  const savedState = {
    currentParticipantId: ownerId,
    participants,
    groups: [],
    events: [
      {
        id: eventId,
        name: "בדיקת זיכרון בענן",
        eventType: "standard",
        participantIds: [ownerId, guestId],
        adminIds: [ownerId],
        createdByParticipantId: ownerId,
        adminsCanEditOnly: false,
        roundSettlementTransfers: false,
        locked: false,
        createdAt: new Date().toISOString(),
        sharedSpaceId: eventWorkspace.id,
        sharedSpaceKey: eventWorkspace.key,
        expenses: [expense],
        transfers: settlement.transfers
      }
    ]
  };
  const cloudConfig = {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: workspace.id,
      spaceKey: workspace.key,
      account: {
        userId,
        accessToken: refreshedSession.access_token,
        spaceId: workspace.id
      }
    }
  };

  await saveCloudState(cloudConfig, savedState);
  snapshotCreated = true;
  const reloadedState = await loadCloudState(cloudConfig, null);
  assert.deepEqual(reloadedState, savedState);
  assert.equal(reloadedState.events[0].expenses[0].total, 12345);
  assert.equal(reloadedState.events[0].transfers[0].amount, 6172);

  await saveSharedEventState(cloudConfig, savedState, eventId);
  eventSnapshotCreated = true;
  const updatedExpense = {
    ...expense,
    total: 12346,
    payers: [{ participantId: ownerId, amount: 12346 }],
    updatedAt: new Date(Date.now() + 1000).toISOString()
  };
  const updatedState = {
    ...savedState,
    events: savedState.events.map((event) =>
      event.id === eventId
        ? { ...event, expenses: [updatedExpense], transfers: [] }
        : event
    )
  };
  await saveSharedEventState(cloudConfig, updatedState, eventId);
  const updatedSharedEvent = await readSharedEventState(
    cloudConfig,
    eventWorkspace,
    eventId
  );
  assert.equal(updatedSharedEvent.events[0].expenses[0].total, 12346);

  const deletedState = deleteEvent(reloadedState, eventId);
  await saveCloudState(cloudConfig, deletedState);
  await syncSharedEvents(cloudConfig, deletedState);

  const deletedSharedEvent = await readSharedEventState(
    cloudConfig,
    eventWorkspace,
    eventId
  );
  assert.deepEqual(deletedSharedEvent.events, []);
  assert.equal(deletedSharedEvent.deletedEvents[0].id, eventId);
  assert.deepEqual(mergeSharedStates(deletedState, savedState).events, []);
  assert.deepEqual(
    mergeSharedEventIntoState(savedState, deletedSharedEvent, eventWorkspace).events,
    []
  );

  const inaccessibleRows = await publicSnapshotRead(workspace.id, `${workspace.key}-wrong`);
  assert.deepEqual(inaccessibleRows, []);

  result = {
    ok: true,
    checks: {
      accountLogin: true,
      sessionRefresh: true,
      stableIdentity: true,
      cloudSaveAndReload: true,
      sharedEventUpdate: true,
      settlementPersistence: true,
      deletionWinsAcrossDevices: true,
      deletedInviteIsRevoked: true,
      wrongKeyIsolation: true
    }
  };
} finally {
  const cleanupErrors = [];
  if (snapshotCreated) {
    try {
      await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(workspace.id)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (eventSnapshotCreated) {
    try {
      await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(eventWorkspace.id)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (userId) {
    try {
      await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "QA cleanup failed");
}

console.log(JSON.stringify({
  ...result,
  checks: { ...result.checks, temporaryDataCleanup: true }
}));

async function publicSnapshotRead(spaceId, spaceKey) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/app_snapshots?id=eq.${encodeURIComponent(spaceId)}&select=id`,
    {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-space-key": spaceKey
      }
    }
  );
  if (!response.ok) throw new Error(`Public snapshot read failed (${response.status})`);
  return response.json();
}

async function adminRequest(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || payload.error || `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for the account memory QA`);
  return value;
}
