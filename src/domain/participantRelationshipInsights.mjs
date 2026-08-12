import { normalizeCurrency } from "./currencies.mjs";

export function buildParticipantRelationshipInsights({
  events = [],
  currentParticipantId,
  targetParticipantId,
  currency = "ILS"
} = {}) {
  const currentId = String(currentParticipantId ?? "").trim();
  const targetId = String(targetParticipantId ?? "").trim();
  const normalizedCurrency = normalizeCurrency(currency);
  const sharedEvents = Array.isArray(events)
    ? events.filter((event) => includesBothParticipants(event, currentId, targetId))
    : [];
  const financialEvents = sharedEvents.filter(
    (event) => normalizeCurrency(event?.currency) === normalizedCurrency
  );

  const paid = { current: 0, target: 0 };
  const expensesAdded = { current: 0, target: 0 };
  const payerActions = { current: 0, target: 0 };
  const eventsCreated = { current: 0, target: 0 };
  const recurringExpenses = new Map();
  let expenseCount = 0;
  let largestEvent = null;

  for (const event of sharedEvents) {
    if (event?.createdByParticipantId === currentId) eventsCreated.current += 1;
    if (event?.createdByParticipantId === targetId) eventsCreated.target += 1;
  }

  for (const event of financialEvents) {
    const expenses = Array.isArray(event?.expenses) ? event.expenses : [];
    const eventTotal = expenses.reduce(
      (sum, expense) => sum + safeMinorAmount(expense?.total),
      0
    );

    if (!largestEvent || eventTotal > largestEvent.total) {
      largestEvent = {
        id: String(event?.id ?? ""),
        name: String(event?.name ?? "").trim() || "אירוע ללא שם",
        total: eventTotal
      };
    }

    for (const expense of expenses) {
      expenseCount += 1;
      if (expense?.createdByParticipantId === currentId) expensesAdded.current += 1;
      if (expense?.createdByParticipantId === targetId) expensesAdded.target += 1;

      const payers = Array.isArray(expense?.payers) ? expense.payers : [];
      let currentPaidThisExpense = false;
      let targetPaidThisExpense = false;
      for (const payer of payers) {
        const amount = safeMinorAmount(payer?.amount);
        if (payer?.participantId === currentId) {
          paid.current += amount;
          currentPaidThisExpense ||= amount > 0;
        }
        if (payer?.participantId === targetId) {
          paid.target += amount;
          targetPaidThisExpense ||= amount > 0;
        }
      }
      if (currentPaidThisExpense) payerActions.current += 1;
      if (targetPaidThisExpense) payerActions.target += 1;

      const recurringKey = normalizeExpenseName(expense?.name);
      if (recurringKey) {
        const existing = recurringExpenses.get(recurringKey) ?? {
          name: String(expense.name).trim(),
          count: 0
        };
        existing.count += 1;
        recurringExpenses.set(recurringKey, existing);
      }
    }
  }

  const involvement = {
    current: expensesAdded.current + payerActions.current + eventsCreated.current,
    target: expensesAdded.target + payerActions.target + eventsCreated.target
  };
  const totalPaid = paid.current + paid.target;
  const paidShare = totalPaid > 0
    ? splitPercentage(paid.current, totalPaid)
    : { current: 50, target: 50 };
  const recurringExpense = [...recurringExpenses.values()]
    .filter((item) => item.count > 1)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "he"))[0] ?? null;

  return {
    currency: normalizedCurrency,
    sharedEventCount: sharedEvents.length,
    financialEventCount: financialEvents.length,
    expenseCount,
    paid,
    paidShare,
    expensesAdded,
    payerActions,
    eventsCreated,
    involvement,
    paymentLeader: leaderFor(paid),
    expenseLeader: leaderFor(expensesAdded),
    involvementLeader: leaderFor(involvement),
    largestEvent: largestEvent?.total > 0 ? largestEvent : null,
    recurringExpense,
    hasHistory: sharedEvents.length > 0 && (expenseCount > 0 || totalPaid > 0)
  };
}

function includesBothParticipants(event, currentId, targetId) {
  if (!currentId || !targetId || currentId === targetId) return false;
  const participantIds = Array.isArray(event?.participantIds)
    ? event.participantIds
    : [];
  return participantIds.includes(currentId) && participantIds.includes(targetId);
}

function safeMinorAmount(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function splitPercentage(currentAmount, totalAmount) {
  const current = Math.max(0, Math.min(100, Math.round((currentAmount / totalAmount) * 100)));
  return { current, target: 100 - current };
}

function leaderFor(values) {
  if (values.current === values.target) return "tie";
  return values.current > values.target ? "current" : "target";
}

function normalizeExpenseName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("he-IL");
}
