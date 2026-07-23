import { parseMoneyInput, splitEvenly } from "./money.mjs";

export const QUICK_ITEM_ALL_PARTICIPANTS = "__all__";
export const QUICK_ITEM_CUSTOM_PARTICIPANTS = "__custom__";

export function buildQuickItemExpenses({
  items,
  payerParticipantId,
  participantIds,
  occurredOn,
  createdByParticipantId,
  makeExpenseId,
  updatedAt = new Date().toISOString()
}) {
  const knownParticipantIds = new Set(participantIds ?? []);
  const activeItems = (items ?? []).filter(
    (item) => item.name?.trim() || String(item.amount ?? "").trim()
  );

  if (!knownParticipantIds.has(payerParticipantId)) {
    return { expenses: [], error: "צריך לבחור מי שילם את החשבון." };
  }

  if (activeItems.length === 0) {
    return { expenses: [], error: "צריך להוסיף לפחות מנה או פריט אחד." };
  }

  const expenses = [];

  for (let index = 0; index < activeItems.length; index += 1) {
    const item = activeItems[index];
    const name = item.name?.trim() ?? "";
    let total = 0;

    try {
      total = parseMoneyInput(item.amount);
    } catch {
      return { expenses: [], error: `המחיר בשורה ${index + 1} אינו תקין.` };
    }

    if (!name) {
      return { expenses: [], error: `חסר שם מנה או פריט בשורה ${index + 1}.` };
    }

    if (total <= 0) {
      return { expenses: [], error: `המחיר בשורה ${index + 1} חייב להיות גדול מאפס.` };
    }

    const sharedByParticipantIds = quickItemParticipantIds(item, [...knownParticipantIds]);

    if (
      sharedByParticipantIds.length === 0 ||
      sharedByParticipantIds.some((participantId) => !knownParticipantIds.has(participantId))
    ) {
      return { expenses: [], error: `צריך לבחור למי שייך הפריט בשורה ${index + 1}.` };
    }

    expenses.push({
      id: makeExpenseId(),
      name,
      total,
      payers: [{ participantId: payerParticipantId, amount: total }],
      sharedByParticipantIds,
      createdByParticipantId,
      occurredOn: normalizeOccurredOn(occurredOn),
      updatedAt
    });
  }

  return { expenses, error: "" };
}

export function groupExpensesByDay(expenses) {
  const groups = new Map();

  for (const expense of expenses ?? []) {
    const day = normalizeOccurredOn(expense.occurredOn) || dateFromTimestamp(expense.updatedAt);
    const key = day || "undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === "undated") return 1;
      if (right === "undated") return -1;
      return right.localeCompare(left);
    })
    .map(([date, dayExpenses]) => ({ date, expenses: dayExpenses }));
}

export function summarizeQuickItemShares(items, participantIds) {
  const knownParticipantIds = [...new Set((participantIds ?? []).filter(Boolean))];
  const totals = Object.fromEntries(knownParticipantIds.map((participantId) => [participantId, 0]));
  let billTotal = 0;
  let error = "";

  const activeItems = (items ?? []).filter(
    (item) => item.name?.trim() || String(item.amount ?? "").trim()
  );

  for (let index = 0; index < activeItems.length; index += 1) {
    const item = activeItems[index];
    const rowNumber = index + 1;

    if (!item.name?.trim()) {
      error ||= `\u05d7\u05e1\u05e8 \u05e9\u05dd \u05de\u05e0\u05d4 \u05d0\u05d5 \u05e4\u05e8\u05d9\u05d8 \u05d1\u05e9\u05d5\u05e8\u05d4 ${rowNumber}.`;
      continue;
    }

    let amount = 0;
    try {
      amount = parseMoneyInput(item.amount);
    } catch {
      error ||= `\u05d4\u05de\u05d7\u05d9\u05e8 \u05d1\u05e9\u05d5\u05e8\u05d4 ${rowNumber} \u05d0\u05d9\u05e0\u05d5 \u05ea\u05e7\u05d9\u05df.`;
      continue;
    }
    if (amount <= 0) {
      error ||= `\u05d4\u05de\u05d7\u05d9\u05e8 \u05d1\u05e9\u05d5\u05e8\u05d4 ${rowNumber} \u05d7\u05d9\u05d9\u05d1 \u05dc\u05d4\u05d9\u05d5\u05ea \u05d2\u05d3\u05d5\u05dc \u05de\u05d0\u05e4\u05e1.`;
      continue;
    }

    const sharedByParticipantIds = quickItemParticipantIds(item, knownParticipantIds);
    if (sharedByParticipantIds.length === 0) {
      error ||= `\u05e6\u05e8\u05d9\u05da \u05dc\u05d1\u05d7\u05d5\u05e8 \u05dc\u05de\u05d9 \u05e9\u05d9\u05d9\u05da \u05d4\u05e4\u05e8\u05d9\u05d8 \u05d1\u05e9\u05d5\u05e8\u05d4 ${rowNumber}.`;
      continue;
    }

    const shares = splitEvenly(amount, sharedByParticipantIds);
    for (const [participantId, share] of Object.entries(shares)) {
      totals[participantId] += share;
    }
    billTotal += amount;
  }

  return { totals, billTotal, error };
}

export function quickItemParticipantIds(item, participantIds) {
  const knownParticipantIds = [...new Set((participantIds ?? []).filter(Boolean))];
  const knownParticipantIdSet = new Set(knownParticipantIds);

  if (
    item?.sharedBy === QUICK_ITEM_CUSTOM_PARTICIPANTS ||
    Array.isArray(item?.sharedByParticipantIds)
  ) {
    return [
      ...new Set(
        (item?.sharedByParticipantIds ?? []).filter((participantId) =>
          knownParticipantIdSet.has(participantId)
        )
      )
    ];
  }

  if (item?.sharedBy === QUICK_ITEM_ALL_PARTICIPANTS) {
    return knownParticipantIds;
  }

  return knownParticipantIdSet.has(item?.sharedBy) ? [item.sharedBy] : [];
}

export function formatExpenseDay(date, locale = "he-IL") {
  if (!date || date === "undated") return "ללא תאריך";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "ללא תאריך";

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(parsed);
}

function normalizeOccurredOn(value) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function dateFromTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
