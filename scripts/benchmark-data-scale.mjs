import { performance } from "node:perf_hooks";

import { calculateSettlement } from "../src/domain/settlement.mjs";
import {
  mergeSharedStates,
  validateSharedStateFinancials,
  validateSharedStateIdentifiers
} from "../src/domain/sharedStateMerge.mjs";

const scenarios = [
  {
    name: "אירוע גדול",
    events: 1,
    expensesPerEvent: 1_000,
    participants: 50,
    budget: { settlementMs: 250, mergeMs: 500, payloadBytes: 750_000 }
  },
  {
    name: "חשבון ותיק",
    events: 50,
    expensesPerEvent: 50,
    participants: 30,
    budget: { settlementMs: 100, mergeMs: 750, payloadBytes: 1_500_000 }
  },
  {
    name: "בדיקת תקרה",
    events: 100,
    expensesPerEvent: 50,
    participants: 30,
    budget: null
  }
];

let failed = false;

for (const scenario of scenarios) {
  const state = createState(scenario);
  const payloadBytes = Buffer.byteLength(JSON.stringify(state));
  const settlement = measure(() =>
    calculateSettlement(state.participants, state.events[0].expenses)
  );
  const identifierValidation = measure(() =>
    validateSharedStateIdentifiers(state)
  );
  const financialValidation = measure(() =>
    validateSharedStateFinancials(state)
  );
  const local = structuredClone(state);
  local.events.at(-1).updatedAt = "2026-08-05T12:01:00.000Z";
  const merge = measure(() => mergeSharedStates(state, local));

  const result = {
    scenario: scenario.name,
    participants: scenario.participants,
    events: scenario.events,
    expenses: scenario.events * scenario.expensesPerEvent,
    payloadMb: Number((payloadBytes / 1024 / 1024).toFixed(2)),
    settlementMs: settlement.ms,
    mergeMs: merge.ms,
    validationMs: Number(
      (identifierValidation.ms + financialValidation.ms).toFixed(1)
    )
  };
  console.log(JSON.stringify(result));

  const problems = [];
  if (settlement.value.issues.length) problems.push("settlement issues");
  if (identifierValidation.value.length) problems.push("unsafe identifiers");
  if (financialValidation.value.length) problems.push("invalid financial data");
  if (scenario.budget && settlement.ms > scenario.budget.settlementMs) {
    problems.push("slow settlement");
  }
  if (scenario.budget && merge.ms > scenario.budget.mergeMs) {
    problems.push("slow merge");
  }
  if (scenario.budget && payloadBytes > scenario.budget.payloadBytes) {
    problems.push("oversized payload");
  }
  if (problems.length) {
    failed = true;
    console.error(`${scenario.name}: ${problems.join(", ")}`);
  }
}

if (failed) process.exitCode = 1;

function createState({ events, expensesPerEvent, participants }) {
  const people = Array.from({ length: participants }, (_, index) => ({
    id: `person-${index + 1}`,
    displayName: `Participant ${index + 1}`,
    kind: "user"
  }));
  const participantIds = people.map((person) => person.id);
  const eventRows = Array.from({ length: events }, (_, eventIndex) => ({
    id: `event-${eventIndex + 1}`,
    name: `Event ${eventIndex + 1}`,
    currency: "ILS",
    participantIds,
    adminIds: [participantIds[0]],
    createdByParticipantId: participantIds[0],
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
    transfers: [],
    expenses: Array.from({ length: expensesPerEvent }, (_, expenseIndex) => {
      const amount = 1_000 + ((eventIndex * expensesPerEvent + expenseIndex) % 9_999);
      const payerId = participantIds[expenseIndex % participantIds.length];
      return {
        id: `expense-${eventIndex + 1}-${expenseIndex + 1}`,
        name: `Expense ${expenseIndex + 1}`,
        total: amount,
        payers: [{ participantId: payerId, amount }],
        sharedByParticipantIds: participantIds.filter(
          (_, participantIndex) => (participantIndex + expenseIndex) % 4 !== 0
        ),
        createdByParticipantId: payerId,
        occurredOn: "2026-08-05",
        updatedAt: "2026-08-05T12:00:00.000Z"
      };
    })
  }));

  return {
    currentParticipantId: participantIds[0],
    participants: people,
    friendContacts: [],
    groups: [],
    events: eventRows,
    deletedEvents: [],
    deletedParticipants: []
  };
}

function measure(operation) {
  const startedAt = performance.now();
  const value = operation();
  return {
    value,
    ms: Number((performance.now() - startedAt).toFixed(1))
  };
}
