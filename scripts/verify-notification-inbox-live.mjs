import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { signInWithPassword } from "../src/data/accountAuth.mjs";
import { saveCloudState } from "../src/data/cloudStore.mjs";
import { sendEventActivityNotification } from "../src/data/eventActivityNotifications.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import { parseInviteEventId, parseInviteToken } from "../src/domain/inviteLinks.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import { ensureNamedParticipant } from "../src/domain/userProfile.mjs";
import {
  loadNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead
} from "../src/data/notificationInbox.mjs";
import { loadEnvFile } from "../src/server/envFile.mjs";
import { redeemEventInvite } from "../src/server/eventInvites.mjs";

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY || requiredEnv("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
assertLiveQaTarget();
const apiBaseUrl = String(
  process.env.PUBLIC_APP_URL || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const eventId = `event-qa-inbox-${suffix}`;
const firstExpenseId = `expense-qa-inbox-a-${suffix}`;
const secondExpenseId = `expense-qa-inbox-b-${suffix}`;
const sharedSpace = {
  id: `space-qa-inbox-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const accounts = [
  createAccountDefinition("sender", "שולח בדיקה"),
  createAccountDefinition("recipient", "מקבל בדיקה")
];

let result = null;
let sharedSnapshotCreated = false;

try {
  for (const account of accounts) {
    const created = await adminRequest("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: account.name,
          account_space_id: account.workspace.id,
          account_space_key: account.workspace.key
        }
      }
    });
    account.userId = created.id;
    assert.ok(account.userId, `${account.role} account was not created`);

    account.session = await signInWithPassword(
      { storage: { mode: "supabase", url: supabaseUrl, anonKey } },
      { email: account.email, password }
    );
    assert.equal(account.session.user.id, account.userId);
  }

  const sender = accounts[0];
  const recipient = accounts[1];
  const senderParticipantId = `account-${sender.userId}`;
  const recipientParticipantId = `account-${recipient.userId}`;
  const participants = [
    {
      id: senderParticipantId,
      displayName: sender.name,
      kind: "user",
      accountUserId: sender.userId,
      authProvider: "email"
    },
    {
      id: recipientParticipantId,
      displayName: recipient.name,
      kind: "user",
      accountUserId: recipient.userId,
      authProvider: "email"
    }
  ];
  const expenses = [
    expense(firstExpenseId, senderParticipantId, recipientParticipantId, 12000)
  ];

  const senderInviteState = accountState(sender, participants, []);
  const recipientEmptyState = accountState(recipient, [
    participants.find((participant) => participant.id === recipientParticipantId)
  ], [], false);
  await saveCloudState(accountCloudConfig(sender), senderInviteState);
  await saveCloudState(accountCloudConfig(recipient), recipientEmptyState);
  await saveSharedEventState(
    accountCloudConfig(sender),
    senderInviteState,
    eventId
  );
  sharedSnapshotCreated = true;

  const invitationDelivery = await sendEventActivityNotification(
    notificationConfig(sender),
    {
      eventId,
      activityId: recipientParticipantId,
      kind: "event-invite"
    }
  );
  assert.equal(invitationDelivery.ok, true);
  assert.equal(invitationDelivery.inboxRecipients, 1);
  assert.equal(invitationDelivery.delivered, 0);
  assert.equal(invitationDelivery.reason, "in-app-only");

  const invitationInbox = await loadNotificationInbox(
    notificationConfig(recipient)
  );
  const invitation = invitationInbox.items.find(
    (item) => item.kind === "event-invite"
  );
  assert.ok(invitation, "The recipient did not receive the event invitation");
  assert.match(
    invitation.actionUrl,
    /^https:\/\/sogrim-hesbon-app\.vercel\.app\/i\/[A-Za-z0-9_-]+\/t\/[A-Za-z0-9_-]{32,128}$/
  );
  assert.doesNotMatch(invitation.actionUrl, /space=|key=|sharedSpace/);
  const inviteEventId = parseInviteEventId(invitation.actionUrl);
  const inviteToken = parseInviteToken(invitation.actionUrl);
  assert.equal(inviteEventId, eventId);
  assert.ok(inviteToken);
  const redemption = await redeemEventInvite({
    runtimeConfig: accountCloudConfig(recipient),
    env: { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    authorization: `Bearer ${recipient.session.access_token}`,
    eventId: inviteEventId,
    token: inviteToken
  });
  assert.equal(redemption.ok, true);
  assert.equal(redemption.payload.kind, "private");
  const invitationCredentials = {
    id: redemption.payload.spaceId,
    key: redemption.payload.spaceKey
  };
  assert.equal(invitationCredentials.id, sharedSpace.id);
  assert.equal(invitationCredentials.key, sharedSpace.key);
  const invitedEventState = await readSharedEventState(
    accountCloudConfig(recipient),
    invitationCredentials,
    eventId
  );
  assert.equal(invitedEventState?.events?.[0]?.id, eventId);
  const recipientJoinedState = ensureNamedParticipant(
    mergeSharedEventIntoState(
      recipientEmptyState,
      invitedEventState,
      invitationCredentials
    ),
    {
      id: recipientParticipantId,
      participantId: recipientParticipantId,
      displayName: recipient.name,
      authSubject: recipient.userId,
      authProvider: "email"
    },
    eventId
  );
  assert.ok(
    recipientJoinedState.events[0].participantIds.includes(
      recipientParticipantId
    )
  );
  await saveCloudState(accountCloudConfig(recipient), recipientJoinedState);
  await adminRequest(
    `/rest/v1/notification_inbox?recipient_user_id=eq.${encodeURIComponent(recipient.userId)}&kind=eq.event-invite`,
    { method: "DELETE" }
  );

  await saveBothAccountStates({ participants, expenses });

  const firstDelivery = await notifyExpense(sender, firstExpenseId);
  assert.equal(firstDelivery.ok, true);
  assert.equal(firstDelivery.inboxRecipients, 1);
  assert.equal(firstDelivery.delivered, 0);
  assert.equal(firstDelivery.reason, "in-app-only");

  expenses.push(
    expense(secondExpenseId, senderParticipantId, recipientParticipantId, 6800)
  );
  await saveBothAccountStates({ participants, expenses });

  const secondDelivery = await notifyExpense(sender, secondExpenseId);
  assert.equal(secondDelivery.ok, true);
  assert.equal(secondDelivery.inboxRecipients, 1);
  assert.equal(secondDelivery.delivered, 0);
  assert.equal(secondDelivery.reason, "in-app-only");

  const recipientConfig = notificationConfig(recipient);
  const senderConfig = notificationConfig(sender);
  const recipientInbox = await loadNotificationInbox(recipientConfig);
  assert.equal(recipientInbox.available, true);
  assert.equal(recipientInbox.items.length, 2);
  assert.deepEqual(
    new Set(recipientInbox.items.map((item) => item.activityId)),
    new Set([firstExpenseId, secondExpenseId])
  );
  assert.ok(recipientInbox.items.every((item) => !item.readAt));

  const senderInbox = await loadNotificationInbox(senderConfig);
  assert.equal(senderInbox.available, true);
  assert.equal(senderInbox.items.length, 0);

  const protectedNotificationId = recipientInbox.items[0].id;
  assert.equal(
    await markNotificationRead(senderConfig, protectedNotificationId),
    true
  );
  const afterForeignUpdate = await loadNotificationInbox(recipientConfig);
  assert.ok(afterForeignUpdate.items.every((item) => !item.readAt));

  assert.equal(
    await markNotificationRead(recipientConfig, protectedNotificationId),
    true
  );
  const afterOwnUpdate = await loadNotificationInbox(recipientConfig);
  assert.ok(
    afterOwnUpdate.items.find((item) => item.id === protectedNotificationId)
      ?.readAt
  );

  assert.equal(await markAllNotificationsRead(recipientConfig), true);
  const fullyReadInbox = await loadNotificationInbox(recipientConfig);
  assert.ok(fullyReadInbox.items.every((item) => item.readAt));

  result = {
    ok: true,
    checks: {
      temporaryAccounts: true,
      activeParticipantInvitationWithoutFriendship: true,
      secureInvitationLink: true,
      invitationJoinsRecipientAccount: true,
      sharedEventVerification: true,
      inAppDeliveryWithoutPushDevice: true,
      rapidExpensesAreBothStored: true,
      senderDoesNotReceiveOwnActivity: true,
      crossAccountReadUpdateBlocked: true,
      recipientCanMarkOneRead: true,
      recipientCanMarkAllRead: true
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
  for (const account of [...accounts].reverse()) {
    if (!account.userId) continue;
    try {
      await adminRequest(
        `/auth/v1/admin/users/${encodeURIComponent(account.userId)}`,
        { method: "DELETE" }
      );
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Notification QA cleanup failed");
  }
}

console.log(JSON.stringify({
  ...result,
  checks: {
    ...result.checks,
    temporaryDataCleanup: true
  }
}));

function createAccountDefinition(role, name) {
  return {
    role,
    name,
    email: `qa-inbox-${role}-${suffix}@example.test`,
    workspace: {
      id: `space-qa-inbox-${role}-${suffix}`,
      key: randomBytes(32).toString("base64url")
    },
    userId: "",
    session: null
  };
}

function expense(id, payerId, participantId, total) {
  return {
    id,
    name: "הוצאת בדיקה",
    total,
    payers: [{ participantId: payerId, amount: total }],
    sharedByParticipantIds: [payerId, participantId],
    createdByParticipantId: payerId,
    createdAt: new Date().toISOString()
  };
}

async function saveBothAccountStates({ participants, expenses }) {
  const authoritativeState = accountState(accounts[0], participants, expenses);
  await saveSharedEventState(
    accountCloudConfig(accounts[0]),
    authoritativeState,
    eventId
  );
  for (const account of accounts) {
    await saveCloudState(
      accountCloudConfig(account),
      accountState(account, participants, expenses)
    );
  }
}

function accountState(account, participants, expenses, includeEvent = true) {
  const transfers = calculateSettlement(participants, expenses).transfers;
  const event = {
    id: eventId,
    name: "בדיקת התראות חיה",
    eventType: "standard",
    participantIds: participants.map((participant) => participant.id),
    adminIds: participants.map((participant) => participant.id),
    createdByParticipantId: participants[0].id,
    adminsCanEditOnly: false,
    currency: "ILS",
    roundSettlementTransfers: false,
    locked: false,
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sharedSpaceId: sharedSpace.id,
    sharedSpaceKey: sharedSpace.key,
    inactiveParticipantIds: [],
    participantAliases: {},
    distinctParticipantPairs: [],
    expenses,
    deletedExpenses: [],
    activityLog: [],
    transfers
  };
  return {
    currentParticipantId: `account-${account.userId}`,
    participants: participants.filter(Boolean),
    groups: [],
    events: includeEvent ? [event] : []
  };
}

function accountCloudConfig(account) {
  return {
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      table: "app_snapshots",
      spaceId: account.workspace.id,
      spaceKey: account.workspace.key,
      account: {
        userId: account.userId,
        accessToken: account.session.access_token,
        spaceId: account.workspace.id
      }
    }
  };
}

function notificationConfig(account) {
  return {
    apiBaseUrl,
    launch: { cloudStorageReady: true, pushDeliveryReady: true },
    storage: {
      mode: "supabase",
      url: supabaseUrl,
      anonKey,
      account: {
        userId: account.userId,
        accessToken: account.session.access_token
      }
    }
  };
}

function notifyExpense(sender, activityId) {
  return sendEventActivityNotification(
    notificationConfig(sender),
    { eventId, activityId, kind: "expense-created" }
  );
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
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.message ||
        payload.msg ||
        payload.error ||
        `Supabase request failed (${response.status})`
    );
  }
  return payload;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for notification QA.`);
  return value;
}

function assertLiveQaTarget() {
  const environment = String(process.env.LIVE_QA_ENVIRONMENT ?? "").trim();
  const productionApproved = process.env.LIVE_QA_ALLOW_PRODUCTION === "1";
  if (environment !== "staging" && !productionApproved) {
    throw new Error(
      "Live notification QA requires LIVE_QA_ENVIRONMENT=staging or explicit LIVE_QA_ALLOW_PRODUCTION=1."
    );
  }
}
