import test from "node:test";
import assert from "node:assert/strict";

import { buildParticipantRelationshipInsights } from "../src/domain/participantRelationshipInsights.mjs";

test("participant relationship insights summarize only shared events in one currency", () => {
  const insights = buildParticipantRelationshipInsights({
    currentParticipantId: "yarin",
    targetParticipantId: "maor",
    currency: "ILS",
    events: [
      {
        id: "event-1",
        name: "ערב חברים",
        currency: "ILS",
        participantIds: ["yarin", "maor", "dani"],
        createdByParticipantId: "maor",
        expenses: [
          {
            id: "expense-1",
            name: "מונית",
            total: 10000,
            createdByParticipantId: "yarin",
            payers: [{ participantId: "maor", amount: 10000 }]
          },
          {
            id: "expense-2",
            name: "  מונית  ",
            total: 6000,
            createdByParticipantId: "maor",
            payers: [{ participantId: "yarin", amount: 6000 }]
          }
        ]
      },
      {
        id: "event-2",
        name: "סופ״ש באילת",
        currency: "ILS",
        participantIds: ["yarin", "maor"],
        createdByParticipantId: "yarin",
        expenses: [
          {
            id: "expense-3",
            name: "מלון",
            total: 20000,
            createdByParticipantId: "maor",
            payers: [{ participantId: "maor", amount: 20000 }]
          }
        ]
      },
      {
        id: "event-3",
        name: "ניו יורק",
        currency: "USD",
        participantIds: ["yarin", "maor"],
        createdByParticipantId: "maor",
        expenses: [
          {
            id: "expense-4",
            name: "מלון",
            total: 50000,
            createdByParticipantId: "maor",
            payers: [{ participantId: "maor", amount: 50000 }]
          }
        ]
      },
      {
        id: "event-private",
        name: "לא משותף",
        currency: "ILS",
        participantIds: ["yarin", "dani"],
        expenses: [
          {
            id: "expense-private",
            name: "מונית",
            total: 90000,
            createdByParticipantId: "yarin",
            payers: [{ participantId: "yarin", amount: 90000 }]
          }
        ]
      }
    ]
  });

  assert.equal(insights.sharedEventCount, 3);
  assert.equal(insights.financialEventCount, 2);
  assert.equal(insights.expenseCount, 3);
  assert.deepEqual(insights.paid, { current: 6000, target: 30000 });
  assert.deepEqual(insights.paidShare, { current: 17, target: 83 });
  assert.deepEqual(insights.expensesAdded, { current: 1, target: 2 });
  assert.deepEqual(insights.payerActions, { current: 1, target: 2 });
  assert.deepEqual(insights.eventsCreated, { current: 1, target: 2 });
  assert.deepEqual(insights.involvement, { current: 3, target: 6 });
  assert.equal(insights.paymentLeader, "target");
  assert.equal(insights.expenseLeader, "target");
  assert.equal(insights.involvementLeader, "target");
  assert.deepEqual(insights.largestEvent, {
    id: "event-2",
    name: "סופ״ש באילת",
    total: 20000
  });
  assert.deepEqual(insights.recurringExpense, { name: "מונית", count: 2 });
  assert.equal(insights.hasHistory, true);
});

test("participant relationship insights keep an honest empty state", () => {
  const insights = buildParticipantRelationshipInsights({
    currentParticipantId: "yarin",
    targetParticipantId: "maor",
    events: [
      {
        id: "event-empty",
        participantIds: ["yarin", "maor"],
        currency: "ILS",
        expenses: []
      }
    ]
  });

  assert.equal(insights.sharedEventCount, 1);
  assert.equal(insights.expenseCount, 0);
  assert.deepEqual(insights.paid, { current: 0, target: 0 });
  assert.deepEqual(insights.paidShare, { current: 50, target: 50 });
  assert.equal(insights.paymentLeader, "tie");
  assert.equal(insights.largestEvent, null);
  assert.equal(insights.recurringExpense, null);
  assert.equal(insights.hasHistory, false);
});

test("participant relationship insights reject missing or identical identities", () => {
  const event = {
    id: "event-1",
    participantIds: ["yarin", "maor"],
    expenses: []
  };

  assert.equal(
    buildParticipantRelationshipInsights({
      events: [event],
      currentParticipantId: "yarin",
      targetParticipantId: "yarin"
    }).sharedEventCount,
    0
  );
  assert.equal(
    buildParticipantRelationshipInsights({
      events: [event],
      currentParticipantId: "yarin",
      targetParticipantId: ""
    }).sharedEventCount,
    0
  );
});
