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

test("expense draft memory ignores expired or mismatched drafts", () => {
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
  assert.equal(parseExpenseDraftMemory(serializeExpenseDraftMemory({ ...draft, id: "expense-1" }), {
    eventId: "event-1", participantIds: ["dani"]
  }), null, "an edit must never be restored as a new expense");
});

test("edited expense drafts survive reload and stay separate from new and other edits", () => {
  const edited = { ...draft, id: "expense-1", name: "Unsaved edit", total: "140" };
  const raw = serializeExpenseDraftMemory(edited);
  const options = { eventId: "event-1", expenseId: "expense-1", participantIds: ["dani"] };
  assert.equal(parseExpenseDraftMemory(raw, options)?.name, "Unsaved edit");
  assert.equal(parseExpenseDraftMemory(raw, options)?.id, "expense-1");
  assert.equal(parseExpenseDraftMemory(raw, { ...options, expenseId: "expense-2" }), null);
  assert.equal(parseExpenseDraftMemory(serializeExpenseDraftMemory(draft), options), null);
  const keys = [
    expenseDraftMemoryKey("dani", "event-1"),
    expenseDraftMemoryKey("dani", "event-1", "expense-1"),
    expenseDraftMemoryKey("dani", "event-1", "expense-2"),
    expenseDraftMemoryKey("avi", "event-1", "expense-1")
  ];
  assert.equal(new Set(keys).size, keys.length);
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
