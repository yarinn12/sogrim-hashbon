import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPENSE_DRAFT_MAX_AGE_MS,
  expenseDraftMemoryKey,
  parseExpenseDraftMemory,
  serializeExpenseDraftMemory
} from "../src/domain/expenseDraftMemory.mjs";

const draft = {
  eventId: "event-1",
  mode: "items",
  flowStep: "payer",
  occurredOn: "2026-07-17",
  payers: [{ participantId: "dani", amount: "120", amountTouched: true }],
  sharedByParticipantIds: ["dani", "avi"],
  quickStage: "review",
  quickPayerId: "dani",
  quickInlineGuestIndex: 0,
  quickInlineGuestName: "temporary guest",
  quickItems: [{
    name: "shared dish",
    amount: "80",
    sharedBy: "__custom__",
    sharedByParticipantIds: ["dani", "avi"]
  }]
};

test("expense draft memory is scoped to a participant and event", () => {
  assert.equal(
    expenseDraftMemoryKey("participant-1", "event-1"),
    "settle-friends-expense-draft:participant-1:event-1"
  );
});

test("expense draft memory restores a valid recent draft", () => {
  const now = Date.now();
  const restored = parseExpenseDraftMemory(serializeExpenseDraftMemory(draft, now - 1000), {
    eventId: "event-1",
    participantIds: ["dani", "avi"],
    fallbackParticipantId: "dani",
    now
  });

  assert.equal(restored.restored, true);
  assert.equal(restored.flowStep, "payer");
  assert.equal(restored.quickStage, "review");
  assert.equal(restored.quickItems[0].name, "shared dish");
  assert.deepEqual(restored.quickItems[0].sharedByParticipantIds, ["dani", "avi"]);
  assert.equal(restored.quickInlineGuestIndex, null);
  assert.equal(restored.quickInlineGuestName, "");
});

test("expense draft memory ignores expired, edited, or mismatched drafts", () => {
  const now = Date.now();
  assert.equal(
    parseExpenseDraftMemory(
      serializeExpenseDraftMemory(draft, now - EXPENSE_DRAFT_MAX_AGE_MS - 1),
      { eventId: "event-1", participantIds: ["dani"], now }
    ),
    null
  );
  assert.equal(
    parseExpenseDraftMemory(serializeExpenseDraftMemory(draft, now), {
      eventId: "another-event",
      participantIds: ["dani"],
      now
    }),
    null
  );
  assert.equal(serializeExpenseDraftMemory({ ...draft, id: "expense-1" }), "");
});

test("expense draft memory ignores a dialog that closed before any input", () => {
  assert.equal(
    serializeExpenseDraftMemory({
      eventId: "event-1",
      mode: "single",
      name: "",
      total: "",
      payers: [{ participantId: "dani", amount: "", amountTouched: true }],
      quickItems: [{ name: "", amount: "" }]
    }),
    ""
  );
  assert.equal(
    serializeExpenseDraftMemory({
      eventId: "event-1",
      mode: "single",
      name: "חשבון מסעדה",
      total: "",
      restaurantEqualSplit: true,
      payers: [{ participantId: "dani", amount: "", amountTouched: false }],
      quickItems: [{ name: "", amount: "" }]
    }),
    ""
  );
});

test("expense draft memory drops participants no longer in the event", () => {
  const restored = parseExpenseDraftMemory(serializeExpenseDraftMemory(draft), {
    eventId: "event-1",
    participantIds: ["dani"],
    fallbackParticipantId: "dani"
  });

  assert.deepEqual(restored.sharedByParticipantIds, ["dani"]);
  assert.deepEqual(restored.quickItems[0].sharedByParticipantIds, ["dani"]);
});
