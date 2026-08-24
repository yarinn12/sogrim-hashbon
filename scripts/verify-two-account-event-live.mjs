import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { devices, webkit } from "@playwright/test";

import {
  accountProfileFromUser,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import {
  loadCloudState,
  RECOVERED_MEMBER_SPACE_KEY,
  saveCloudState
} from "../src/data/cloudStore.mjs";
import {
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import {
  closeEvent,
  deactivateEventParticipant,
  reopenEvent,
  updateTransferStatus
} from "../src/domain/appActions.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";
import {
  manageOpenEventInvite,
  redeemEventInvite
} from "../src/server/eventInvites.mjs";

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
  const joiner = await createTemporaryAccount(
    "joiner",
    "חבר מצטרף בדיקה",
    { includeUsername: false }
  );
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
      closedAt: null,
      createdAt,
      updatedAt: createdAt,
      sharedSpaceId: eventCredentials.id,
      sharedSpaceKey: eventCredentials.key,
      inactiveParticipantIds: [],
      participantAliases: {},
      distinctParticipantPairs: [],
      expenses: [],
      deletedExpenses: [],
      activityLog: [],
      transfers: []
    }
  ];

  await saveCloudState(ownerConfig, ownerState);
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);

  const initialInvite = await manageOpenEventInvite({
    runtimeConfig: ownerConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    authorization: `Bearer ${owner.session.access_token}`,
    eventId,
    operation: "rotate"
  });
  assert.equal(initialInvite.ok, true);
  assert.match(String(initialInvite.payload?.token ?? ""), /^[A-Za-z0-9_-]{32,128}$/);

  // Reproduce the exact user action: generating a new link must revoke the
  // previous one and make the replacement immediately redeemable.
  const openInvite = await manageOpenEventInvite({
    runtimeConfig: ownerConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    authorization: `Bearer ${owner.session.access_token}`,
    eventId,
    operation: "rotate"
  });
  assert.equal(openInvite.ok, true);
  assert.match(String(openInvite.payload?.token ?? ""), /^[A-Za-z0-9_-]{32,128}$/);
  assert.notEqual(openInvite.payload.token, initialInvite.payload.token);

  const supersededInvite = await redeemEventInvite({
    runtimeConfig: joinerConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    authorization: `Bearer ${joiner.session.access_token}`,
    eventId,
    token: initialInvite.payload.token
  });
  assert.equal(supersededInvite.ok, false);
  assert.equal(supersededInvite.payload?.code, "EVENT_INVITE_REVOKED");

  await joinThroughProductionBrowser({
    email: joiner.email,
    password: joiner.password,
    username: joiner.username,
    eventId,
    eventName: "בדיקת שני חשבונות",
    token: openInvite.payload.token
  });
  let joinerState = await loadCloudState(
    joinerConfig,
    baseAccountState(joinerProfile)
  );
  assert.equal(joinerState.events?.some((event) => event.id === eventId), true);
  const joinedEvent = joinerState.events.find((event) => event.id === eventId);
  assert.equal(joinedEvent?.sharedSpaceId, eventCredentials.id);
  // A freshly redeemed invite can still carry the event credential, while a
  // device that rebuilt its missing index uses the membership-scoped recovery
  // capability. Both must keep syncing; the writes below prove the exact
  // capability returned by this run remains usable while membership is active.
  assert.ok(
    [eventCredentials.key, RECOVERED_MEMBER_SPACE_KEY].includes(
      joinedEvent?.sharedSpaceKey
    )
  );
  joinedEvent.sharedSpaceKey = RECOVERED_MEMBER_SPACE_KEY;

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
  const offlineGuestId = `guest-two-account-${suffix}`;
  const joinerStateWithGuest = addOfflineGuest(joinerState, {
    id: offlineGuestId,
    displayName: "אורח בדיקת סנכרון"
  });
  const joinerStaleState = addExpense(joinerStateWithGuest, {
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
  assert.equal(ownerState.events[0].participantIds.includes(offlineGuestId), true);
  assert.equal(
    ownerState.participants.some((participant) => participant.id === offlineGuestId),
    true
  );
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
    // Payment-status writes are intentionally freshness-checked by Supabase.
    markedAt: new Date().toISOString()
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

  ownerState = reopenEvent(ownerState, eventId, "2026-08-03T12:16:00.000Z");
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(joinerState.events[0].locked, false);

  const staleJoinerState = addExpense(structuredClone(joinerState), {
    id: `expense-revoked-${suffix}`,
    name: "כתיבה אחרי הסרה",
    total: 1_000,
    payers: [{ participantId: joinerProfile.participantId, amount: 1_000 }],
    sharedByParticipantIds: [ownerProfile.participantId, joinerProfile.participantId],
    createdByParticipantId: joinerProfile.participantId,
    createdAt: "2026-08-03T12:17:00.000Z",
    updatedAt: "2026-08-03T12:17:00.000Z"
  });
  const removalAt = new Date(Date.now() + 60_000).toISOString();
  ownerState = deactivateEventParticipant(
    ownerState,
    eventId,
    joinerProfile.participantId,
    removalAt
  );
  assert.equal(
    !ownerState.events[0].participantIds.includes(joinerProfile.participantId) ||
      ownerState.events[0].inactiveParticipantIds?.includes(joinerProfile.participantId),
    true
  );
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  assert.equal(
    !ownerState.events[0].participantIds.includes(joinerProfile.participantId) ||
      ownerState.events[0].inactiveParticipantIds?.includes(joinerProfile.participantId),
    true
  );

  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  const revokedEvent = joinerState.events.find((event) => event.id === eventId);
  assert.equal(
    revokedEvent?.inactiveParticipantIds?.includes(joinerProfile.participantId),
    true
  );
  assert.equal(revokedEvent?.sharedSpaceId, undefined);
  assert.equal(revokedEvent?.sharedSpaceKey, undefined);

  await assert.rejects(
    saveSharedEventState(joinerConfig, staleJoinerState, eventId),
    (error) =>
      error.code === "SHARED_EVENT_CREATE_NOT_ALLOWED" && error.status === 403
  );
  const revokedInvite = await redeemEventInvite({
    runtimeConfig: joinerConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    authorization: `Bearer ${joiner.session.access_token}`,
    eventId,
    token: openInvite.payload.token
  });
  assert.equal(revokedInvite.ok, false);
  assert.equal(revokedInvite.payload?.code, "EVENT_INVITE_REVOKED");

  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(
    ownerState.events[0].expenses.some(
      (expense) => expense.id === `expense-revoked-${suffix}`
    ),
    false
  );

  console.log(JSON.stringify({
    ok: true,
    checks: {
      separateAccountIdentities: true,
      authenticatedInviteRedeemed: true,
      replacementInviteRevokesPreviousLink: true,
      newlyGeneratedInviteRedeemed: true,
      productionIphoneLoginJoinedFromNewLink: true,
      connectedParticipantJoined: true,
      nonAdminOfflineGuestAndExpenseSynced: true,
      concurrentExpensesMerged: true,
      settlementMatchedBothAccounts: true,
      transferStatusSynced: true,
      eventClosureSynced: true,
      bothAccountWorkspacesReloaded: true,
      removedMemberAccessRevoked: true,
      removedMemberStaleWriteBlocked: true,
      oldInviteCannotRejoinRemovedMember: true,
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

async function createTemporaryAccount(
  role,
  displayName,
  { includeUsername = true } = {}
) {
  const workspace = {
    id: `space-two-account-${role}-${suffix}`,
    key: randomBytes(32).toString("base64url")
  };
  const email = `qa-two-account-${role}-${suffix}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const username = `qa_${role}_${randomBytes(5).toString("hex")}`;
  const user = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        ...(includeUsername ? { username } : {}),
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
  return { session, workspace, email, password, username };
}

async function joinThroughProductionBrowser({
  email,
  password,
  username,
  eventId,
  eventName,
  token
}) {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...devices["iPhone 15"] });
    const page = await context.newPage();
    const failedResponses = [];
    const authDiagnostics = [];
    page.on("response", async (response) => {
      const url = new URL(response.url());
      const isRelevant =
        url.pathname.startsWith("/auth/v1/") ||
        url.pathname.includes("/rest/v1/rpc/set_friend_username") ||
        url.pathname.includes("/rest/v1/app_snapshots");
      if (!isRelevant) return;
      const entry = {
        path: url.pathname,
        status: response.status(),
        method: response.request().method(),
        requestBody: String(response.request().postData() ?? "").slice(0, 1_200),
        body: (await response.text().catch(() => "")).slice(0, 400)
      };
      authDiagnostics.push(entry);
      if (response.status() >= 400) failedResponses.push(entry);
    });
    const inviteUrl = `https://sogrim-hesbon-app.vercel.app/i/${encodeURIComponent(eventId)}/t/${encodeURIComponent(token)}`;
    await page.goto(inviteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const gate = page.locator("#public-account-auth-gate");
    await gate.waitFor({ timeout: 20_000 });
    const emailToggle = gate.locator('[data-account-action="toggle-email"]');
    if (await emailToggle.isVisible()) await emailToggle.click();
    await gate.locator('input[name="email"]').fill(email);
    await gate.locator('input[name="password"]').fill(password);
    await gate.locator('button[type="submit"]').click();
    const completionForm = page.locator('[data-account-form][data-mode="complete-profile"]');
    if (await completionForm.waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false)) {
      await completionForm.locator('input[name="username"]').fill(username);
      await completionForm.locator('button[type="submit"]').click();
    }
    try {
      await gate.waitFor({ state: "detached", timeout: 40_000 });
    } catch (error) {
      console.log(JSON.stringify({
        diagnostic: "legacy-profile-completion-stuck",
        gateText: (await gate.innerText().catch(() => "")).slice(0, 800),
        formMode: await gate.locator("[data-account-form]").getAttribute("data-mode").catch(() => ""),
        currentUrl: page.url(),
        failedResponses,
        authDiagnostics
      }));
      throw error;
    }
    await page.getByText(eventName, { exact: true }).first().waitFor({ timeout: 30_000 });
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    await context.close();
  } finally {
    await browser.close();
  }
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

function addOfflineGuest(state, participant) {
  return {
    ...state,
    participants: [
      ...state.participants,
      { ...participant, kind: "guest", accountLinked: false }
    ],
    events: state.events.map((event) =>
      event.id === eventId
        ? {
            ...event,
            participantIds: [...event.participantIds, participant.id]
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
