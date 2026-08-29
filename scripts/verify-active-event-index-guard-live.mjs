import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { saveCloudStateWithConflictRetry } from "../src/data/cloudConflictRetry.mjs";
import { loadCloudState, saveCloudState } from "../src/data/cloudStore.mjs";
import {
  saveSharedEventState,
  syncSharedEvents
} from "../src/data/sharedEventStore.mjs";
import { deleteEvent } from "../src/domain/appActions.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
assertLiveQaTarget();

const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const email = `qa-index-guard-${suffix}@example.test`;
const workspace = {
  id: `space-qa-index-account-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const sharedSpace = {
  id: `space-qa-index-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const eventId = `event-qa-index-${suffix}`;

let userId = "";
let workspaceCreated = false;
let sharedSnapshotCreated = false;
let result = null;

try {
  const created = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "בדיקת אינדקס זמנית",
        account_space_id: workspace.id,
        account_space_key: workspace.key
      }
    }
  });
  userId = String(created.id ?? "");
  assert.ok(userId);

  const session = await signInWithPassword(
    { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
    { email, password }
  );
  const participantId = `account-${userId}`;
  const config = accountCloudConfig(session.access_token, userId);
  const createdAt = new Date().toISOString();
  const state = {
    currentParticipantId: participantId,
    participants: [
      {
        id: participantId,
        displayName: "בדיקת אינדקס זמנית",
        kind: "user",
        accountUserId: userId,
        authProvider: "email"
      }
    ],
    groups: [],
    events: [
      {
        id: eventId,
        name: "בדיקת חסימת מכשיר ישן",
        eventType: "standard",
        participantIds: [participantId],
        inactiveParticipantIds: [],
        adminIds: [participantId],
        createdByParticipantId: participantId,
        adminsCanEditOnly: false,
        currency: "ILS",
        roundSettlementTransfers: false,
        locked: false,
        createdAt,
        updatedAt: createdAt,
        sharedSpaceId: sharedSpace.id,
        sharedSpaceKey: sharedSpace.key,
        expenses: [],
        transfers: []
      }
    ]
  };

  await saveCloudState(config, state);
  workspaceCreated = true;
  await saveSharedEventState(config, state, eventId);
  sharedSnapshotCreated = true;

  const missingMemberState = {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? { ...event, participantIds: [], adminIds: [] }
        : event
    )
  };
  let missingMemberWriteError = null;
  try {
    await saveCloudState(config, missingMemberState);
  } catch (error) {
    missingMemberWriteError = error;
  }
  assert.equal(missingMemberWriteError?.code, "CLOUD_STATE_CONFLICT");

  const staleState = { ...state, events: [] };
  let staleWriteError = null;
  try {
    await saveCloudState(config, staleState);
  } catch (error) {
    staleWriteError = error;
  }
  assert.equal(staleWriteError?.code, "CLOUD_STATE_CONFLICT");

  const recovered = await saveCloudStateWithConflictRetry({
    state: staleState,
    loadLatest: (fallbackState) => loadCloudState(config, fallbackState),
    save: (candidate) => saveCloudState(config, candidate)
  });
  assert.ok(recovered.conflictCount >= 1);
  assert.ok(recovered.state.events.some((event) => event.id === eventId));
  const afterStaleWrite = await loadCloudState(config, null);
  assert.ok(afterStaleWrite.events.some((event) => event.id === eventId));

  const deletedState = deleteEvent(afterStaleWrite, eventId);
  await syncSharedEvents(config, deletedState, undefined, {
    eventIds: [],
    deletedEventIds: [eventId]
  });
  const deletionSave = await saveCloudStateWithConflictRetry({
    state: deletedState,
    loadLatest: (fallbackState) => loadCloudState(config, fallbackState),
    save: (candidate) => saveCloudState(config, candidate)
  });
  assert.equal(
    deletionSave.state.events.some((event) => event.id === eventId),
    false
  );
  const afterLegitimateDeletion = await loadCloudState(config, null);
  assert.equal(
    afterLegitimateDeletion.events.some((event) => event.id === eventId),
    false
  );

  result = {
    ok: true,
    checks: {
      staleMembershipRemovalRejected: true,
      staleWorkspaceDeletionRejected: true,
      conflictRetryRestoredActiveEvent: true,
      legitimateSharedDeletionAllowed: true
    }
  };
} finally {
  const cleanupErrors = [];
  if (sharedSnapshotCreated) {
    try {
      await adminRequest(
        `/rest/v1/app_snapshots?id=eq.${encodeURIComponent(sharedSpace.id)}`,
        { method: "DELETE" }
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (workspaceCreated) {
    try {
      await adminRequest(
        `/rest/v1/app_snapshots?id=eq.${encodeURIComponent(workspace.id)}`,
        { method: "DELETE" }
      );
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
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Active event index QA cleanup failed");
  }
}

console.log(JSON.stringify({
  ...result,
  checks: { ...result.checks, temporaryDataCleanup: true }
}));

function accountCloudConfig(accessToken, accountUserId) {
  return {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: workspace.id,
      spaceKey: workspace.key,
      account: {
        userId: accountUserId,
        accessToken,
        spaceId: workspace.id
      }
    }
  };
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || payload.error ||
        `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function assertLiveQaTarget() {
  const environment = String(process.env.LIVE_QA_ENVIRONMENT ?? "").trim();
  const productionApproved = process.env.LIVE_QA_ALLOW_PRODUCTION === "1";
  if (environment !== "staging" && !productionApproved) {
    throw new Error(
      "Live index-guard QA requires LIVE_QA_ENVIRONMENT=staging or " +
        "explicit LIVE_QA_ALLOW_PRODUCTION=1."
    );
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
