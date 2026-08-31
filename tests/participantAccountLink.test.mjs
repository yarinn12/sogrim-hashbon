import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createParticipantAccountLinkSnapshot,
  participantAccountLinkRequestKey,
  participantAccountLinkSnapshotMatches
} from "../src/domain/participantAccountLink.mjs";

const event = {
  id: "event-exit",
  participantIds: ["account-yarin", "guest-hgg"],
  inactiveParticipantIds: []
};
const source = { id: "guest-hgg", displayName: "HGG", kind: "guest" };
const target = {
  id: "account-yarin",
  displayName: "ירין יצחק",
  kind: "user",
  accountLinked: true
};

test("an explicit account link snapshot locks the event, offline name and account", () => {
  const snapshot = createParticipantAccountLinkSnapshot({ event, source, target });
  assert.deepEqual(snapshot, {
    eventId: "event-exit",
    sourceParticipantId: "guest-hgg",
    targetParticipantId: "account-yarin",
    sourceDisplayName: "hgg",
    targetDisplayName: "ירין יצחק",
    targetIdentityKey: "account-yarin"
  });
  assert.equal(
    participantAccountLinkRequestKey(snapshot),
    "event-exit|guest-hgg|account-yarin|account-yarin"
  );
  assert.equal(
    participantAccountLinkSnapshotMatches(snapshot, { event, source, target }),
    true
  );
});

test("a stale link is rejected when sync replaces either displayed identity", () => {
  const snapshot = createParticipantAccountLinkSnapshot({ event, source, target });
  assert.equal(
    participantAccountLinkSnapshotMatches(snapshot, {
      event,
      source: { ...source, displayName: "ניזרי" },
      target
    }),
    false
  );
  assert.equal(
    participantAccountLinkSnapshotMatches(snapshot, {
      event,
      source,
      target: { ...target, displayName: "ניזרי" }
    }),
    false
  );
});

test("a stale link is rejected when membership or the connected account changes", () => {
  const snapshot = createParticipantAccountLinkSnapshot({ event, source, target });
  assert.equal(
    participantAccountLinkSnapshotMatches(snapshot, {
      event: { ...event, inactiveParticipantIds: [source.id] },
      source,
      target
    }),
    false
  );
  assert.equal(
    participantAccountLinkSnapshotMatches(snapshot, {
      event,
      source,
      target: { ...target, id: "account-nizri" }
    }),
    false
  );
});

test("the app serializes identity mutations and never reuses another link request", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(
    app,
    /if \(mergeParticipantsRequest\) \{[\s\S]*?קישור חשבון אחר עדיין נשמר[\s\S]*?return;/
  );
  assert.match(
    app,
    /mergeParticipantsInState\(mergeParticipantsDraft\)/
  );
  assert.match(
    app,
    /mergeParticipantsInStateNow\(pendingMerge\)/
  );
  assert.doesNotMatch(
    app,
    /mergeParticipantsRequest = mergeParticipantsInStateNow\(\)/
  );
  assert.match(
    app,
    /participantAccountLinkSnapshotMatches\(pendingMerge\.identitySnapshot[\s\S]*?prepareSharedEventForInvitation[\s\S]*?participantAccountLinkSnapshotMatches\(pendingMerge\.identitySnapshot/
  );
});

test("an async link result can only update the event that started it", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  const mergeFlow = app.slice(
    app.indexOf("async function mergeParticipantsInStateNow(pendingMerge)"),
    app.indexOf("function dropParticipantFromDrafts")
  );
  const asyncMessage = app.slice(
    app.indexOf("function showAsyncEventParticipantMessage"),
    app.indexOf("function requestEventParticipantRemoval")
  );

  assert.match(
    mergeFlow,
    /participant-identities[\s\S]*?eventDialog\.eventId === pendingMerge\.eventId/
  );
  assert.match(
    mergeFlow,
    /\["participant-profile", "participant-link"\][\s\S]*?eventDialog\.eventId === pendingMerge\.eventId/
  );
  assert.match(
    asyncMessage,
    /if \(!dialogMatches && !screenMatches\) \{[\s\S]*?return false;/
  );
  assert.match(
    mergeFlow,
    /dropParticipantFromDrafts\([\s\S]*?eventScoped: true, eventId: pendingMerge\.eventId/
  );
  assert.match(
    app,
    /if \(!eventScoped && groupDraft\)/
  );
  assert.match(
    app,
    /expenseDraft && \(!eventScoped \|\| expenseDraft\.eventId === eventId\)/
  );
});

test("every offline-to-account entry point uses the same event-scoped link", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  const duplicateReviewFlow = app.slice(
    app.indexOf("function requestDuplicateParticipantMerge("),
    app.indexOf("function requestExplicitParticipantLink(")
  );
  const completionCopy = app.slice(
    app.indexOf("function participantAccountLinkCompletionMessage("),
    app.indexOf("async function mergeParticipantsInStateNow(")
  );

  assert.match(
    duplicateReviewFlow,
    /if \(targetConnected\) \{[\s\S]*?requestExplicitParticipantLink\([\s\S]*?return;/
  );
  assert.ok(
    duplicateReviewFlow.indexOf("requestExplicitParticipantLink(") <
      duplicateReviewFlow.indexOf("canMergeParticipants(")
  );
  assert.match(
    completionCopy,
    /sameDisplayName[\s\S]*?לחשבון המחובר[\s\S]*?חשבון אחד באירוע הזה/
  );
});
