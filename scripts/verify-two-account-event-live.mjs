import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { devices, webkit } from "@playwright/test";

import {
  accountProfileFromUser,
  signInWithPassword
} from "../src/data/accountAuth.mjs";
import {
  loadCloudState,
  readAccessibleSharedCloudStates,
  RECOVERED_MEMBER_SPACE_KEY,
  saveCloudState
} from "../src/data/cloudStore.mjs";
import {
  saveCloudStateWithConflictRetry
} from "../src/data/cloudConflictRetry.mjs";
import {
  refreshSharedEvents,
  saveSharedEventState
} from "../src/data/sharedEventStore.mjs";
import { accountLinkIsConfirmed } from "../src/data/pendingAccountLinks.mjs";
import {
  closeEvent,
  deactivateEventParticipant,
  leaveEvent,
  linkParticipantAccountInEvent,
  reopenEvent,
  removeExpense,
  setEventAdminsCanEditOnly,
  updateTransferStatus
} from "../src/domain/appActions.mjs";
import { calculateSettlement } from "../src/domain/settlement.mjs";
import {
  addEventNote,
  updateEventNote
} from "../src/domain/eventNotes.mjs";
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
const browserOrigin = String(
  process.env.TWO_ACCOUNT_QA_ORIGIN || "https://sogrim-hesbon-app.vercel.app"
).replace(/\/+$/, "");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const eventId = `event-two-account-${suffix}`;
const eventCredentials = {
  id: `space-two-account-event-${suffix}`,
  key: randomBytes(32).toString("base64url")
};
const createdUserIds = [];
const createdSpaceIds = new Set([eventCredentials.id]);
const syncTimings = [];

function recordSyncTiming(name, startedAt) {
  syncTimings.push({
    name,
    milliseconds: Math.round((performance.now() - startedAt) * 10) / 10
  });
}

function summarizeSyncTimings(samples) {
  const values = samples
    .map((sample) => sample.milliseconds)
    .sort((left, right) => left - right);
  const percentile = (ratio) => values[Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * ratio) - 1)
  )] ?? 0;
  return {
    samples: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: values.at(-1) ?? 0
  };
}

try {
  const owner = await createTemporaryAccount("owner", "בעל אירוע בדיקה");
  const joiner = await createTemporaryAccount(
    "joiner",
    "חבר מצטרף בדיקה",
    { includeUsername: false }
  );
  const addedFriend = await createTemporaryAccount(
    "added-friend",
    "חבר שנוסף באירוע שיתופי"
  );
  const ownerConfig = runtimeConfig(owner);
  const joinerConfig = runtimeConfig(joiner);
  const ownerProfile = accountProfileFromUser(owner.session.user);
  const joinerProfile = accountProfileFromUser(joiner.session.user);
  const addedFriendProfile = accountProfileFromUser(addedFriend.session.user);
  const createdAt = "2026-08-03T12:00:00.000Z";

  let ownerState = baseAccountState(ownerProfile);
  await saveCloudState(ownerConfig, ownerState, qaFetch);
  await saveCloudState(joinerConfig, baseAccountState(joinerProfile), qaFetch);
  await saveCloudState(
    runtimeConfig(addedFriend),
    baseAccountState(addedFriendProfile),
    qaFetch
  );

  const joinerParticipant = baseAccountState(joinerProfile).participants[0];
  ownerState.participants.push(joinerParticipant);
  ownerState.events = [
    {
      id: eventId,
      name: "בדיקת שני חשבונות",
      eventType: "standard",
      currency: "ILS",
      participantIds: [ownerProfile.participantId, joinerProfile.participantId],
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
  await adminRequest("/rest/v1/friendships", {
    method: "POST",
    body: {
      requester_id: owner.session.user.id,
      addressee_id: joiner.session.user.id,
      status: "accepted",
      responded_at: new Date().toISOString()
    },
    prefer: "return=representation"
  });
  await adminRequest("/rest/v1/friendships", {
    method: "POST",
    body: {
      requester_id: joiner.session.user.id,
      addressee_id: addedFriend.session.user.id,
      status: "accepted",
      responded_at: new Date().toISOString()
    },
    prefer: "return=representation"
  });
  const publicationStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);

  const atomicallyGrantedEvents = await readAccessibleSharedCloudStates(joinerConfig);
  assert.equal(
    atomicallyGrantedEvents.some((row) => row.state?.events?.[0]?.id === eventId),
    true,
    "Canonical event publication did not atomically grant the connected participant access"
  );
  recordSyncTiming("event-publication-to-member-read", publicationStartedAt);

  const directInviteResponse = await fetch(
    "https://sogrim-hesbon-app.vercel.app/api/notifications/event-activity",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.session.access_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId,
        activityId: joinerProfile.participantId,
        kind: "event-invite"
      })
    }
  );
  const directInvitePayload = await directInviteResponse.json().catch(() => ({}));
  assert.equal(directInviteResponse.ok, true, JSON.stringify(directInvitePayload));
  assert.equal(directInvitePayload.ok, true);
  assert.equal(directInvitePayload.membershipRecipients, 1);
  const joinerAccessibleEvents = await readAccessibleSharedCloudStates(joinerConfig);
  assert.equal(
    joinerAccessibleEvents.some((row) => row.state?.events?.[0]?.id === eventId),
    true
  );

  const productionInviteStartedAt = performance.now();
  const productionInviteResponse = await qaFetch(
    `${browserOrigin}/api/event-invites/open-link`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.session.access_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId,
        candidateToken: "",
        operation: "ensure"
      })
    }
  );
  const productionInvitePayload = await productionInviteResponse.json()
    .catch(() => ({}));
  recordSyncTiming("production invite endpoint", productionInviteStartedAt);
  assert.equal(
    productionInviteResponse.ok,
    true,
    JSON.stringify(productionInvitePayload)
  );
  assert.match(
    String(productionInvitePayload?.token ?? ""),
    /^[A-Za-z0-9_-]{32,128}$/
  );

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
    token: openInvite.payload.token,
    afterJoin: async (page) => {
      await page
        .locator(`[data-action="open-event"][data-event-id="${eventId}"]`)
        .first()
        .click();
      await page
        .locator(`[data-screen-kind="event"][data-event-id="${eventId}"]`)
        .first()
        .waitFor({ timeout: 10_000 });

      const foregroundExpenseId = `expense-foreground-${suffix}`;
      const foregroundExpenseName = `בדיקת רענון חי ${suffix}`;
      ownerState = addExpense(ownerState, {
        id: foregroundExpenseId,
        name: foregroundExpenseName,
        total: 1_234,
        payers: [{ participantId: ownerProfile.participantId, amount: 1_234 }],
        sharedByParticipantIds: [
          ownerProfile.participantId,
          joinerProfile.participantId
        ],
        createdByParticipantId: ownerProfile.participantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const foregroundCreateStartedAt = performance.now();
      ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
      await page
        .getByText(foregroundExpenseName, { exact: true })
        .waitFor({ timeout: 10_000 });
      const foregroundCreateElapsed = performance.now() - foregroundCreateStartedAt;
      recordSyncTiming(
        "foreground-expense-create-to-open-iphone",
        foregroundCreateStartedAt
      );
      assert.ok(
        foregroundCreateElapsed <= 3_500,
        `Open iPhone did not show the new expense within 3.5 seconds (${foregroundCreateElapsed.toFixed(1)}ms)`
      );

      ownerState = removeExpense(
        ownerState,
        eventId,
        foregroundExpenseId,
        new Date().toISOString()
      );
      const foregroundDeleteStartedAt = performance.now();
      ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
      await page
        .getByText(foregroundExpenseName, { exact: true })
        .waitFor({ state: "detached", timeout: 10_000 });
      const foregroundDeleteElapsed = performance.now() - foregroundDeleteStartedAt;
      recordSyncTiming(
        "foreground-expense-delete-from-open-iphone",
        foregroundDeleteStartedAt
      );
      assert.ok(
        foregroundDeleteElapsed <= 3_500,
        `Open iPhone did not remove the deleted expense within 3.5 seconds (${foregroundDeleteElapsed.toFixed(1)}ms)`
      );
    }
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

  // A non-admin may add exactly one accepted friend when the event is in
  // collaborative mode. The same member must still be unable to remove that
  // person or promote themselves to manager.
  const friendParticipant = baseAccountState(addedFriendProfile).participants[0];
  const friendAddedAt = new Date().toISOString();
  const collaborativeFriendState = structuredClone(joinerState);
  collaborativeFriendState.participants.push(friendParticipant);
  collaborativeFriendState.events[0].participantIds.push(
    addedFriendProfile.participantId
  );
  collaborativeFriendState.events[0].membershipUpdatedAt = friendAddedAt;
  collaborativeFriendState.events[0].membershipUpdatedAtByParticipant = {
    ...(collaborativeFriendState.events[0].membershipUpdatedAtByParticipant ?? {}),
    [addedFriendProfile.participantId]: friendAddedAt
  };
  joinerState = await saveSharedEventState(
    joinerConfig,
    collaborativeFriendState,
    eventId
  );
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(
    ownerState.events[0].participantIds.includes(addedFriendProfile.participantId),
    true
  );

  const unauthorizedRemoval = deactivateEventParticipant(
    structuredClone(joinerState),
    eventId,
    addedFriendProfile.participantId,
    new Date(Date.now() + 1_000).toISOString()
  );
  await assert.rejects(
    saveSharedEventState(joinerConfig, unauthorizedRemoval, eventId),
    (error) => error?.status === 403 || error?.status === 400
  );

  const unauthorizedPromotion = structuredClone(joinerState);
  unauthorizedPromotion.events[0].adminIds.push(joinerProfile.participantId);
  unauthorizedPromotion.events[0].adminIdsScopedToEvent = true;
  unauthorizedPromotion.events[0].adminIdsUpdatedAt =
    new Date(Date.now() + 2_000).toISOString();
  await assert.rejects(
    saveSharedEventState(joinerConfig, unauthorizedPromotion, eventId),
    (error) => error?.status === 403 || error?.status === 400
  );

  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.deepEqual(
    new Set(ownerState.events[0].participantIds),
    new Set([
      ownerProfile.participantId,
      joinerProfile.participantId,
      addedFriendProfile.participantId
    ])
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

  // Collaborative mode must let a regular member edit an existing expense,
  // not only create a new one. This covers the exact non-admin iPhone report.
  const ownerExpenseId = `expense-owner-${suffix}`;
  const joinerEditedState = structuredClone(joinerState);
  const expenseEditedByJoiner = joinerEditedState.events[0].expenses.find(
    (expense) => expense.id === ownerExpenseId
  );
  assert.ok(expenseEditedByJoiner);
  expenseEditedByJoiner.name = "ארוחה עודכנה על ידי חבר";
  expenseEditedByJoiner.updatedAt = "2026-08-03T12:05:01.500Z";
  const expenseEditStartedAt = performance.now();
  joinerState = await saveSharedEventState(
    joinerConfig,
    joinerEditedState,
    eventId
  );
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(
    ownerState.events[0].expenses.find((expense) => expense.id === ownerExpenseId)?.name,
    "ארוחה עודכנה על ידי חבר"
  );
  recordSyncTiming("expense-edit-to-owner-read", expenseEditStartedAt);

  // Switching to centralized management must propagate to the second account
  // before it can make another event edit. The server remains the final guard,
  // so a stale or modified client cannot bypass the selected management mode.
  ownerState = setEventAdminsCanEditOnly(ownerState, eventId, true);
  const centralizedModeStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(joinerState.events[0].adminsCanEditOnly, true);
  recordSyncTiming("centralized-mode-to-member-read", centralizedModeStartedAt);

  const unauthorizedCentralizedEdit = addExpense(joinerState, {
    id: `expense-centralized-block-${suffix}`,
    name: "הוצאה שחבר רגיל לא רשאי להוסיף",
    total: 100,
    payers: [{ participantId: joinerProfile.participantId, amount: 100 }],
    sharedByParticipantIds: [
      ownerProfile.participantId,
      joinerProfile.participantId
    ],
    createdByParticipantId: joinerProfile.participantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await assert.rejects(
    saveSharedEventState(joinerConfig, unauthorizedCentralizedEdit, eventId),
    (error) => error?.status === 403 || error?.status === 400
  );

  ownerState = setEventAdminsCanEditOnly(ownerState, eventId, false);
  const collaborativeModeStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(joinerState.events[0].adminsCanEditOnly, false);
  recordSyncTiming("collaborative-mode-to-member-read", collaborativeModeStartedAt);

  // A deletion from one phone must become canonical before a stale device can
  // publish its older copy. The tombstone must remain visible to both users.
  const deletedExpenseId = `expense-delete-${suffix}`;
  joinerState = addExpense(joinerState, {
    id: deletedExpenseId,
    name: "הוצאה למחיקה",
    total: 900,
    payers: [{ participantId: joinerProfile.participantId, amount: 900 }],
    sharedByParticipantIds: [ownerProfile.participantId, joinerProfile.participantId],
    createdByParticipantId: joinerProfile.participantId,
    createdAt: "2026-08-03T12:05:02.000Z",
    updatedAt: "2026-08-03T12:05:02.000Z"
  });
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  const staleOwnerBeforeDeletion = structuredClone(ownerState);

  joinerState = removeExpense(
    joinerState,
    eventId,
    deletedExpenseId,
    "2026-08-03T12:05:03.000Z"
  );
  const expenseDeletionStartedAt = performance.now();
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await saveSharedEventState(
    ownerConfig,
    staleOwnerBeforeDeletion,
    eventId
  );
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  for (const syncedState of [ownerState, joinerState]) {
    assert.equal(
      syncedState.events[0].expenses.some(
        (expense) => expense.id === deletedExpenseId
      ),
      false
    );
    assert.equal(
      syncedState.events[0].deletedExpenses.some(
        (deletion) => deletion.id === deletedExpenseId
      ),
      true
    );
  }
  recordSyncTiming("expense-delete-to-both-reads", expenseDeletionStartedAt);

  ownerState = linkParticipantAccountInEvent(
    ownerState,
    eventId,
    offlineGuestId,
    joinerProfile.participantId
  );
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  for (const [stateOwner, linkedState] of [["owner", ownerState], ["joiner", joinerState]]) {
    const linkedEvent = linkedState.events[0];
    assert.equal(linkedEvent.participantIds.includes(offlineGuestId), false);
    const accountLinkConfirmed = accountLinkIsConfirmed(
      linkedState,
      {
        eventId,
        sourceParticipantId: offlineGuestId,
        targetParticipantId: joinerProfile.participantId
      }
    );
    if (!accountLinkConfirmed) {
      console.error(JSON.stringify({
        diagnostic: "canonical-account-link-not-confirmed",
        stateOwner,
        participantAccountLinks: linkedEvent.participantAccountLinks,
        membershipTimestampRetained: Object.hasOwn(
          linkedEvent.membershipUpdatedAtByParticipant ?? {},
          offlineGuestId
        ),
        aliasRetained: Object.hasOwn(
          linkedEvent.participantAliases ?? {},
          offlineGuestId
        )
      }));
    }
    assert.equal(
      accountLinkConfirmed,
      true
    );
    assert.equal(linkedEvent.expenses.length, 2);
  }

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
  const transferStatusStartedAt = performance.now();
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(ownerState.events[0].transfers[0].status, "paid");
  assert.equal(
    ownerState.events[0].transfers[0].markedPaidByParticipantId,
    joinerProfile.participantId
  );
  recordSyncTiming("transfer-status-to-owner-read", transferStatusStartedAt);

  const sharedNoteId = `note-two-account-${suffix}`;
  ownerState = addEventNote(ownerState, eventId, {
    id: sharedNoteId,
    title: "פרטי הטיסה",
    body: "טרמינל 3",
    participantId: ownerProfile.participantId,
    createdAt: "2026-08-03T12:12:00.000Z"
  });
  const noteCreateStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(
    joinerState.events[0].notes?.find((note) => note.id === sharedNoteId)?.body,
    "טרמינל 3"
  );
  recordSyncTiming("note-create-to-member-read", noteCreateStartedAt);

  joinerState = updateEventNote(joinerState, eventId, sharedNoteId, {
    body: "טרמינל 3 · להגיע שלוש שעות לפני",
    pinned: true,
    participantId: joinerProfile.participantId,
    updatedAt: "2026-08-03T12:13:00.000Z"
  });
  const noteEditStartedAt = performance.now();
  joinerState = await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  const synchronizedNote = ownerState.events[0].notes?.find(
    (note) => note.id === sharedNoteId
  );
  assert.equal(synchronizedNote?.pinned, true);
  assert.equal(
    synchronizedNote?.body,
    "טרמינל 3 · להגיע שלוש שעות לפני"
  );
  recordSyncTiming("note-edit-to-owner-read", noteEditStartedAt);

  ownerState = closeEvent(ownerState, eventId, "2026-08-03T12:15:00.000Z");
  const closeEventStartedAt = performance.now();
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  joinerState = await refreshSharedEvents(joinerConfig, joinerState);
  assert.equal(joinerState.events[0].locked, true);
  assert.equal(joinerState.events[0].closedAt, "2026-08-03T12:15:00.000Z");
  recordSyncTiming("event-close-to-member-read", closeEventStartedAt);

  ownerState = (await saveCloudStateWithConflictRetry({
    state: ownerState,
    loadLatest: (fallbackState) =>
      loadCloudState(ownerConfig, fallbackState, qaFetch),
    save: (candidate) => saveCloudState(ownerConfig, candidate, qaFetch)
  })).state;
  joinerState = (await saveCloudStateWithConflictRetry({
    state: joinerState,
    loadLatest: (fallbackState) =>
      loadCloudState(joinerConfig, fallbackState, qaFetch),
    save: (candidate) => saveCloudState(joinerConfig, candidate, qaFetch)
  })).state;
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
  joinerState = leaveEvent(
    joinerState,
    eventId,
    joinerProfile.participantId
  );
  assert.equal(
    joinerState.events[0].participantIds.includes(joinerProfile.participantId) &&
      joinerState.events[0].inactiveParticipantIds?.includes(joinerProfile.participantId),
    true
  );
  const leaveEventStartedAt = performance.now();
  await saveSharedEventState(joinerConfig, joinerState, eventId);
  ownerState = await refreshSharedEvents(ownerConfig, ownerState);
  assert.equal(
    ownerState.events[0].participantIds.includes(joinerProfile.participantId) &&
      ownerState.events[0].inactiveParticipantIds?.includes(joinerProfile.participantId),
    true
  );
  recordSyncTiming("member-leave-to-owner-read", leaveEventStartedAt);

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

  // The original creator must be able to leave after transferring management.
  // This used to pass in the client domain and fail only at the database guard,
  // producing an optimistic success on one device and a rollback elsewhere.
  const managementTransferredAt = new Date().toISOString();
  ownerState.events[0].adminIds = [
    ownerProfile.participantId,
    addedFriendProfile.participantId
  ];
  ownerState.events[0].adminIdsScopedToEvent = true;
  ownerState.events[0].adminIdsUpdatedAt = managementTransferredAt;
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  ownerState = leaveEvent(ownerState, eventId, ownerProfile.participantId);
  assert.equal(
    ownerState.events[0].inactiveParticipantIds?.includes(ownerProfile.participantId),
    true
  );
  ownerState = await saveSharedEventState(ownerConfig, ownerState, eventId);
  let addedFriendState = await loadCloudState(
    runtimeConfig(addedFriend),
    baseAccountState(addedFriendProfile)
  );
  addedFriendState = await refreshSharedEvents(
    runtimeConfig(addedFriend),
    addedFriendState
  );
  const creatorLeaveEvent = addedFriendState.events.find(
    (event) => event.id === eventId
  );
  assert.equal(
    creatorLeaveEvent?.inactiveParticipantIds?.includes(ownerProfile.participantId),
    true
  );
  assert.equal(
    creatorLeaveEvent?.adminIds?.includes(addedFriendProfile.participantId),
    true
  );

  const syncLatencyMs = summarizeSyncTimings(syncTimings);
  assert.ok(
    syncLatencyMs.max <= 5_000,
    `Two-account synchronization exceeded 5 seconds: ${JSON.stringify(syncTimings)}`
  );

  console.log(JSON.stringify({
    ok: true,
    syncLatencyMs,
    syncTimings,
    checks: {
      separateAccountIdentities: true,
      canonicalPublicationGrantedMembershipAtomically: true,
      directFriendInviteGrantedMembershipWithoutOpeningLink: true,
      productionInviteEndpointFast: true,
      authenticatedInviteRedeemed: true,
      replacementInviteRevokesPreviousLink: true,
      newlyGeneratedInviteRedeemed: true,
      productionIphoneLoginJoinedFromNewLink: true,
      openIphoneForegroundCreateAutoSynced: true,
      openIphoneForegroundDeleteAutoSynced: true,
      connectedParticipantJoined: true,
      collaborativeMemberAddedAcceptedFriend: true,
      collaborativeMemberRemovalBlocked: true,
      collaborativeMemberPromotionBlocked: true,
      centralizedModeSyncedAndBlockedMemberEdit: true,
      collaborativeModeRestoredMemberEditing: true,
      nonAdminOfflineGuestAndExpenseSynced: true,
      nonAdminExistingExpenseEditSynced: true,
      offlineAccountLinkPersistedCanonically: true,
      concurrentExpensesMerged: true,
      expenseDeletionSurvivesStaleDeviceWrite: true,
      settlementMatchedBothAccounts: true,
      transferStatusSynced: true,
      sharedNotesCreateEditAndPinSynced: true,
      eventClosureSynced: true,
      bothAccountWorkspacesReloaded: true,
      nonAdminLeftWithMoneyHistoryPreservedOffline: true,
      creatorLeftAfterManagementTransfer: true,
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
  token,
  afterJoin = null
}) {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...devices["iPhone 15"] });
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, "__SOGRIM_AUTOMATED_QA__", {
        value: true,
        configurable: false,
        writable: false
      });
      const browserFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, init) => {
        const requestUrl = input instanceof Request ? input.url : String(input ?? "");
        if (new URL(requestUrl, globalThis.location.href).pathname === "/api/product-metrics") {
          return Promise.resolve(new Response(JSON.stringify({ ok: true, qaSuppressed: true }), {
            status: 202,
            headers: { "content-type": "application/json" }
          }));
        }
        return browserFetch(input, init);
      };
    });
    await context.route("**/api/product-metrics", (route) =>
      route.fulfill({ status: 202, json: { ok: true, qaSuppressed: true } })
    );
    const invitePage = await context.newPage();
    let page = invitePage;
    const failedResponses = [];
    const authDiagnostics = [];
    context.on("response", async (response) => {
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
    const inviteUrl = `${browserOrigin}/i/${encodeURIComponent(eventId)}/t/${encodeURIComponent(token)}`;
    await invitePage.goto(inviteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await invitePage.locator("#public-account-auth-gate").waitFor({ timeout: 20_000 });

    // Reproduce registration opening in a separate tab after the original
    // invitation address is no longer visible. The account gate must recover
    // the durable handoff before authentication and profile completion.
    page = await context.newPage();
    await page.goto(`${browserOrigin}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });
    const gate = page.locator("#public-account-auth-gate");
    await gate.waitFor({ timeout: 20_000 });
    const durableHandoff = await page.evaluate(() =>
      localStorage.getItem("sogrim-pending-invite-handoff-v1")
    );
    assert.equal(JSON.parse(durableHandoff ?? "null")?.inviteUrl, inviteUrl);
    await gate.getByText("קיבלת הזמנה", { exact: true }).waitFor({ timeout: 20_000 });
    await invitePage.close();
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
    if (typeof afterJoin === "function") {
      try {
        await afterJoin(page);
      } catch (error) {
        console.log(JSON.stringify({
          diagnostic: "post-join-live-sync-failed",
          currentUrl: page.url(),
          pageText: (await page.locator("body").innerText().catch(() => "")).slice(0, 1_500),
          failedResponses,
          recentSnapshotResponses: authDiagnostics.slice(-20)
        }));
        throw error;
      }
    }
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

async function qaFetch(input, init) {
  const response = await fetch(input, init);
  if (!response.ok) {
    console.error(JSON.stringify({
      diagnostic: "two-account-cloud-request-failed",
      path: new URL(String(input)).pathname,
      method: init?.method ?? "GET",
      status: response.status,
      body: (await response.clone().text().catch(() => "")).slice(0, 800)
    }));
  }
  return response;
}

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required for two-account QA.`);
  return value;
}
