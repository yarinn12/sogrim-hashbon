import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join } from "node:path";

import {
  mergeSharedStates,
  validateSharedStateFinancials,
  validateSharedStateIdentifiers
} from "../src/domain/sharedStateMerge.mjs";

const root = process.cwd();
const reportPath = process.env.CONTENTION_BENCHMARK_REPORT ||
  join(root, "artifacts", "performance", "shared-event-contention.json");
const scenarios = [
  {
    editors: 10,
    existingExpenses: 100,
    participants: 12,
    budget: { p95MergeMs: 250, totalMergeMs: 3_000, payloadBytes: 750_000 }
  },
  {
    editors: 25,
    existingExpenses: 500,
    participants: 30,
    budget: { p95MergeMs: 500, totalMergeMs: 10_000, payloadBytes: 1_500_000 }
  },
  {
    editors: 50,
    existingExpenses: 1_000,
    participants: 50,
    budget: { p95MergeMs: 750, totalMergeMs: 30_000, payloadBytes: 2_000_000 }
  }
];

const results = [];
let failed = false;

for (const scenario of scenarios) {
  const result = runScenario(scenario);
  results.push(result);
  console.log(JSON.stringify(result));
  if (result.problems.length) failed = true;
}

const report = {
  generatedAt: new Date().toISOString(),
  kind: "local-shared-event-contention-simulation",
  productionTrafficGenerated: false,
  results
};
await mkdir(join(root, "artifacts", "performance"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failed) process.exitCode = 1;

function runScenario(scenario) {
  const base = createState(scenario);
  const clientStates = Array.from({ length: scenario.editors }, (_, index) =>
    createClientEdit(base, index)
  );
  let canonical = structuredClone(base);
  const mergeSamples = [];

  for (const clientState of deterministicShuffle(clientStates)) {
    const startedAt = performance.now();
    canonical = mergeSharedStates(canonical, clientState);
    mergeSamples.push(performance.now() - startedAt);
  }

  const event = canonical.events[0];
  const expectedExpenseIds = new Set([
    ...base.events[0].expenses.map((expense) => expense.id),
    ...clientStates.map((state) => state.events[0].expenses.at(-1).id)
  ]);
  const actualExpenseIds = new Set(event.expenses.map((expense) => expense.id));
  const identifierErrors = validateSharedStateIdentifiers(canonical);
  const financialErrors = validateSharedStateFinancials(canonical);
  const payloadBytes = Buffer.byteLength(JSON.stringify(canonical));
  const latency = summarize(mergeSamples);
  const problems = [];

  if (actualExpenseIds.size !== expectedExpenseIds.size) {
    problems.push("expense count changed during merge");
  }
  if ([...expectedExpenseIds].some((id) => !actualExpenseIds.has(id))) {
    problems.push("a concurrent expense was lost");
  }
  if (identifierErrors.length) problems.push("unsafe identifiers");
  if (financialErrors.length) problems.push("invalid financial data");
  if (latency.p95 > scenario.budget.p95MergeMs) problems.push("slow p95 merge");
  if (latency.total > scenario.budget.totalMergeMs) problems.push("slow total merge");
  if (payloadBytes > scenario.budget.payloadBytes) problems.push("oversized payload");

  return {
    editors: scenario.editors,
    participants: scenario.participants,
    startingExpenses: scenario.existingExpenses,
    finalExpenses: event.expenses.length,
    expectedExpenses: scenario.existingExpenses + scenario.editors,
    payloadMb: round(payloadBytes / 1024 / 1024, 2),
    mergeLatencyMs: latency,
    identifierErrors: identifierErrors.length,
    financialErrors: financialErrors.length,
    problems
  };
}

function createClientEdit(base, editorIndex) {
  const state = structuredClone(base);
  const event = state.events[0];
  const participantId = state.participants[editorIndex % state.participants.length].id;
  const updatedAt = new Date(
    Date.parse("2026-08-14T10:00:00.000Z") + editorIndex * 1_000
  ).toISOString();
  const amount = 1_000 + editorIndex;

  event.expenses.push({
    id: `concurrent-expense-${editorIndex + 1}`,
    name: `Concurrent expense ${editorIndex + 1}`,
    total: amount,
    payers: [{ participantId, amount }],
    sharedByParticipantIds: [...event.participantIds],
    createdByParticipantId: participantId,
    occurredOn: "2026-08-14",
    updatedAt
  });
  event.updatedAt = updatedAt;
  return state;
}

function createState({ existingExpenses, participants }) {
  const people = Array.from({ length: participants }, (_, index) => ({
    id: `person-${index + 1}`,
    displayName: `Participant ${index + 1}`,
    kind: "user"
  }));
  const participantIds = people.map((person) => person.id);
  const expenses = Array.from({ length: existingExpenses }, (_, index) => {
    const amount = 2_000 + (index % 5_000);
    const participantId = participantIds[index % participantIds.length];
    return {
      id: `expense-${index + 1}`,
      name: `Expense ${index + 1}`,
      total: amount,
      payers: [{ participantId, amount }],
      sharedByParticipantIds: participantIds,
      createdByParticipantId: participantId,
      occurredOn: "2026-08-14",
      updatedAt: "2026-08-14T09:00:00.000Z"
    };
  });

  return {
    currentParticipantId: participantIds[0],
    participants: people,
    friendContacts: [],
    groups: [],
    events: [{
      id: "event-contention",
      name: "Contention benchmark",
      eventType: "trip",
      currency: "ILS",
      participantIds,
      adminIds: [participantIds[0]],
      createdByParticipantId: participantIds[0],
      createdAt: "2026-08-14T08:00:00.000Z",
      updatedAt: "2026-08-14T09:00:00.000Z",
      expenses,
      transfers: [],
      activityLog: []
    }],
    deletedEvents: [],
    deletedParticipants: []
  };
}

function deterministicShuffle(values) {
  const odds = values.filter((_, index) => index % 2 === 1).reverse();
  const evens = values.filter((_, index) => index % 2 === 0);
  return [...odds, ...evens];
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: round(sorted.at(-1) ?? 0),
    total: round(values.reduce((sum, value) => sum + value, 0))
  };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
