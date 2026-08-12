import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  accountProfileFromUser,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import { loadCloudState, saveCloudState } from "../src/data/cloudStore.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState,
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import {
  closeEvent,
  updateTransferStatus
} from "../src/domain/appActions.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import { ensureNamedParticipant } from "../src/domain/userProfile.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const eventId = `event-two-account-${suffix}`;
const eventCredentials = {
  id: `space-two-account-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const createdUserIds = [];
const createdSpaceIds = new Set([eventCredentials.id]);

try {
  const owner = await createTemporaryAccount("owner", "בעל אירוע בדיקה");
  const joiner = await createTemporaryAccount("joiner", "חבר מצטרף בדיקה");
  const ownerConfig = runtimeConfig(owner);
  const joinerConfig = runtimeConfig(joiner);
  const ownerProfile = accountProfileFromUser(owner.session.user);
  const joinerProfile = accountProfileFromUser(joiner.session.user);
  const createdAt = "2026-08-03T12:00:00.000Z";

  let ownerState = baseAccountState(ownerProfile);
  ownerState.events = [
    {
      id: eventId,
      name: "בדיקת שני חשבונות",
      eventType: "standard",
      currency: "ILS",
      participantIds: [ownerProfile.participantId],
      adminIds: [ownerProfile.participantId],
      createdByParticipantId: ownerProfile.participantId,
      adminsCanEditOnly: false,
      roundSettlementTransfers: false,
      locked: false,
      createdAt,
      updatedAt: createdAt,
      sharedSpaceId: eventCredentials.id,
      sharedSpaceKey: eventCredentials.key,
      expenses: [],
      transfers: []
    }
  ];

  await saveCloudState(ownerConfig, ownerState);
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);

  const inviteSnapshot = await readSharedEventState(
    joinerConfig,
    eventCredentials,
    eventId
  );
  assert.equal(inviteSnapshot?.events?.[0]?.id, eventId);

  let joinerState = mergeSharedEventIntoState(
    baseAccountState(joinerProfile),
    inviteSnapshot,
    eventCredentials
  );
  joinerState = ensureNamedParticipant(joinerState, {
    id: joinerProfile.participantId,
    displayName: joinerProfile.displayName,
    authProvider: joinerProfile.authProvider,
    authSubject: joinerProfile.authSubject,
    email: joinerProfile.email
  }, eventId);
  await saveCloudState(joinerConfig, joinerState);
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);

  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.deepEqual(
    new Set(ownerState.events[0].participantIds),
    new Set([ownerProfile.participantId, joinerProfile.participantId])
  );

  const ownerStaleState = addExpense(ownerState, {
    id: `expense-owner-${suffix}`,
    name: "ארוחה",
    total: 12_000,
    payers: [{ participantId: ownerProfile.participantId, amount: 12_000 }],
    sharedByParticipantIds: [ownerProfile.participantId, joinerProfile.participantId],
    createdByParticipantId: ownerProfile.participantId,
    createdAt: "2026-08-03T12:05:00.000Z",
    updatedAt: "2026-08-03T12:05:00.000Z"
  });
  const joinerStaleState = addExpense(joinerState, {
    id: `expense-joiner-${suffix}`,
    name: "מונית",
    total: 6_000,
    payers: [{ participantId: joinerProfile.participantId, amount: 6_000 }],
    sharedByParticipantIds: [ownerProfile.participantId, joinerProfile.participantId],
    createdByParticipantId: joinerProfile.participantId,
    createdAt: "2026-08-03T12:05:01.000Z",
    updatedAt: "2026-08-03T12:05:01.000Z"
  });

  ownerState = await saveSharedEventState(ownerConfig, ownerStaleState, eventId);
  joinerState = await saveSharedEventState(joinerConfig, joinerStaleState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);

  assert.equal(ownerState.events[0].expenses.length, 2);
  assert.equal(joinerState.events[0].expenses.length, 2);
  assert.deepEqual(
    new Set(ownerState.events[0].expenses.map((expense) => expense.id)),
    new Set(joinerState.events[0].expenses.map((expense) => expense.id))
  );

  const settlement = calculateSettlement(
    ownerState.participants.filter((participant) =>
      ownerState.events[0].participantIds.includes(participant.id)
    ),
    ownerState.events[0].expenses
  );
  assert.deepEqual(settlement.issues, []);
  assert.equal(settlement.transfers.length, 1);
  assert.equal(settlement.transfers[0].fromParticipantId, joinerProfile.participantId);
  assert.equal(settlement.transfers[0].toParticipantId, ownerProfile.participantId);
  assert.equal(settlement.transfers[0].amount, 3_000);

  ownerState = replaceEvent(ownerState, {
    ...ownerState.events[0],
    transfers: settlement.transfers
  });
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  const transferId = joinerState.events[0].transfers[0].id;
  joinerState = updateTransferStatus(joinerState, eventId, transferId, {
    status: "paid",
    participantId: joinerProfile.participantId,
    markedAt: "2026-08-03T12:10:00.000Z"
  });
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(ownerState.events[0].transfers[0].status, "paid");
  assert.equal(
    ownerState.events[0].transfers[0].markedPaidByParticipantId,
    joinerProfile.participantId
  );

  ownerState = closeEvent(ownerState, eventId, "2026-08-03T12:15:00.000Z");
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(joinerState.events[0].locked, true);
  assert.equal(joinerState.events[0].closedAt, "2026-08-03T12:15:00.000Z");

  await saveCloudState(ownerConfig, ownerState);
  await saveCloudState(joinerConfig, joinerState);
  const ownerReloaded = await loadCloudState(ownerConfig, null);
  const joinerReloaded = await loadCloudState(joinerConfig, null);
  assert.equal(ownerReloaded.currentParticipantId, ownerProfile.participantId);
  assert.equal(joinerReloaded.currentParticipantId, joinerProfile.participantId);
  assert.equal(ownerReloaded.events[0].expenses.length, 2);
  assert.equal(joinerReloaded.events[0].expenses.length, 2);
  assert.equal(ownerReloaded.events[0].transfers[0].status, "paid");
  assert.equal(joinerReloaded.events[0].locked, true);

  console.log(JSON.stringify({
    ok: true,
    checks: {
      separateAccountIdentities: true,
      inviteSnapshotReadable: true,
      connectedParticipantJoined: true,
      concurrentExpensesMerged: true,
      settlementMatchedBothAccounts: true,
      transferStatusSynced: true,
      eventClosureSynced: true,
      bothAccountWorkspacesReloaded: true,
      temporaryDataCleanup: true
    }
  }));
} finally {
  const cleanupErrors = [];
  for (const spaceId of createdSpaceIds) {
    try {
      await adminRequest(`/rest/v1/app_snapshots?id=eq.${encodeURIComponent(spaceId)}`, {
        method: "DELETE",
        prefer: "return=minimal"
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
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Two-account QA cleanup failed");
  }
}

async function createTemporaryAccount(role, displayName) {
  const workspace = {
    id: `space-two-account-${role}-${suffix}`,
    key: randomBytes(32).toString("base64url")
  };
  const email = `qa-two-account-${role}-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
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

function baseAccountState(profile) {
  return {
    currentParticipantId: profile.participantId,
    participants: [
      {
        id: profile.participantId,
        displayName: profile.displayName,
        kind: "user",
        authProvider: profile.authProvider,
        authSubject: profile.authSubject,
        email: profile.email,
        accountLinked: true
      }
    ],
    groups: [],
    events: [],
    deletedEvents: [],
    deletedParticipants: []
  };
}

function addExpense(state, expense) {
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            expenses: [...event.expenses, expense],
            updatedAt: expense.updatedAt,
            transfers: []
          }
        : event
    )
  };
}

function replaceEvent(state, nextEvent) {
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === nextEvent.id ? nextEvent : event
    )
  };
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
  if (response.status === 204) return {};
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
  if (!value) throw new Error(`${name} is required for two-account QA.`);
  return value;
}
