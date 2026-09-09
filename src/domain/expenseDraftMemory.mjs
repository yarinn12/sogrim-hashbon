export const EXPENSE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPENSE_DRAFT_STORAGE_PREFIX = "settle-friends-expense-draft";

export function expenseDraftMemoryKey(participantId, eventId, expenseId = "") {
  if (!participantId || !eventId) return "";
  return `${EXPENSE_DRAFT_STORAGE_PREFIX}:${participantId}:${eventId}${expenseId ? `:edit:${expenseId}` : ""}`;
}

// A draft and the durable expense snapshot are separate writes. Retain the
// identity and both revisions before persistence so a restarted editor can
// distinguish its own unacknowledged write from another participant's change.
export function expenseDraftSaveStatus(draft, event) {
  const pending = draft?.pendingExpenseSave;
  if (pending && (!validExpenseRevision(pending.expense) ||
      typeof pending.created !== "boolean" ||
      (draft.id && draft.id !== pending.expense.id) ||
      (pending.beforeExpense != null && (!validExpenseRevision(pending.beforeExpense) ||
        pending.beforeExpense.id !== pending.expense.id)) ||
      (!pending.created && (!validExpenseRevision(pending.beforeExpense) ||
        pending.beforeExpense.id !== pending.expense.id)))) return { conflict: true };
  const expenseId = draft?.id || pending?.expense.id;
  const existingExpense = event?.expenses?.find(expense => expense.id === expenseId);
  const wasNewExpense = pending ? pending.created : !draft?.id;
  const deleted = Boolean(expenseId && (event?.deletedExpenses?.some(expense => expense.id === expenseId) ||
    (!existingExpense && !wasNewExpense)));
  const conflict = deleted || Boolean(existingExpense && (pending
    ? !sameExpenseRevision(existingExpense, pending.expense) &&
      !sameExpenseRevision(existingExpense, pending.beforeExpense)
    : (draft.baseExpenseUpdatedAt ?? "") !== (existingExpense.updatedAt ?? "")));
  return { expenseId, existingExpense, wasNewExpense, deleted, conflict };
}

export function prepareQuickExpenseRetry(draft, event, expenses) {
  const pending = draft?.pendingQuickExpenseSave;
  if (!pending) return { expenses };
  const attempted = pending.expenses;
  if (!Array.isArray(attempted) || attempted.length !== expenses.length ||
      !attempted.every(validExpenseRevision) || new Set(attempted.map(item => item.id)).size !== attempted.length ||
      attempted.some((item, index) => expenseContentKey(item) !== expenseContentKey(expenses[index]))) {
    return { conflict: true };
  }
  const conflict = attempted.some(item => {
    const current = event.expenses?.find(expense => expense.id === item.id);
    return event.deletedExpenses?.some(expense => expense.id === item.id) ||
      (current && !sameExpenseRevision(current, item));
  });
  // Resend the exact original records. A retry must not invent identifiers or
  // advance clocks over an independently changed/deleted restaurant item.
  return conflict ? { conflict: true } : { expenses: attempted.map(item => ({ ...item })) };
}

function validExpenseRevision(expense) {
  return Boolean(expense && typeof expense.id === "string" && expense.id &&
    typeof expense.name === "string" && Number.isSafeInteger(expense.total) && expense.total > 0 &&
    typeof expense.updatedAt === "string" && Number.isFinite(Date.parse(expense.updatedAt)) &&
    Array.isArray(expense.payers) && expense.payers.length && expense.payers.every(payer =>
      typeof payer?.participantId === "string" && Number.isSafeInteger(payer.amount) && payer.amount > 0) &&
    Array.isArray(expense.sharedByParticipantIds) && expense.sharedByParticipantIds.length &&
    expense.sharedByParticipantIds.every(id => typeof id === "string" && id));
}

function expenseContentKey(expense) {
  return JSON.stringify([expense.name, expense.total,
    expense.payers.map(payer => [payer.participantId, payer.amount]).sort(),
    [...expense.sharedByParticipantIds].sort(), expense.createdByParticipantId ?? "",
    expense.occurredOn ?? "", expense.notes ?? "", expense.attachmentImage ?? ""]);
}

function sameExpenseRevision(left, right) {
  return Boolean(left && right && left.id === right.id && left.updatedAt === right.updatedAt &&
    expenseContentKey(left) === expenseContentKey(right));
}

export function serializeExpenseDraftMemory(draft, savedAt = Date.now()) {
  if (!draft?.eventId || !hasMeaningfulExpenseDraft(draft)) return "";

  return JSON.stringify({
    version: 1,
    savedAt,
    draft: {
      ...draft,
      restored: false,
      error: ""
    }
  });
}

export function parseExpenseDraftMemory(
  rawValue,
  {
    eventId,
    expenseId = "",
    participantIds = [],
    fallbackParticipantId = participantIds[0],
    now = Date.now(),
    maxAgeMs = EXPENSE_DRAFT_MAX_AGE_MS
  } = {}
) {
  if (!rawValue || !eventId) return null;

  try {
    const payload = JSON.parse(rawValue);
    const draft = payload?.draft;
    if (
      payload?.version !== 1 ||
      !Number.isFinite(payload.savedAt) ||
      now - payload.savedAt > maxAgeMs ||
      now < payload.savedAt ||
      !draft ||
      (draft.id || "") !== expenseId ||
      draft.eventId !== eventId ||
      !hasMeaningfulExpenseDraft(draft)
    ) {
      return null;
    }

    const knownParticipantIds = [...new Set(participantIds.filter(Boolean))];
    const knownParticipantIdSet = new Set(knownParticipantIds);
    const safeFallbackParticipantId = knownParticipantIdSet.has(fallbackParticipantId)
      ? fallbackParticipantId
      : knownParticipantIds[0];
    if (!safeFallbackParticipantId) return null;

    const payers = Array.isArray(draft.payers)
      ? draft.payers
          .filter((payer) => knownParticipantIdSet.has(payer?.participantId))
          .map((payer) => ({
            participantId: payer.participantId,
            amount: String(payer.amount ?? ""),
            amountTouched: Boolean(payer.amountTouched),
            autoAmount: Boolean(payer.autoAmount)
          }))
      : [];

    const quickItems = Array.isArray(draft.quickItems)
      ? draft.quickItems.map((item) => ({
          name: String(item?.name ?? ""),
          amount: String(item?.amount ?? ""),
          sharedBy: knownParticipantIdSet.has(item?.sharedBy) ||
            ["__all__", "__custom__"].includes(item?.sharedBy)
            ? item.sharedBy
            : safeFallbackParticipantId,
          sharedByParticipantIds: Array.isArray(item?.sharedByParticipantIds)
            ? [...new Set(item.sharedByParticipantIds.filter((id) => knownParticipantIdSet.has(id)))]
            : undefined
        }))
      : [];

    return {
      ...draft,
      mode: draft.mode === "items" ? "items" : "single",
      name: String(draft.name ?? ""),
      total: String(draft.total ?? ""),
      occurredOn: String(draft.occurredOn ?? ""),
      payers: payers.length ? payers : [{
        participantId: safeFallbackParticipantId,
        amount: "",
        amountTouched: false,
        autoAmount: true
      }],
      sharedByParticipantIds: Array.isArray(draft.sharedByParticipantIds)
        ? [...new Set(draft.sharedByParticipantIds.filter((id) => knownParticipantIdSet.has(id)))]
        : [...knownParticipantIds],
      quickPurpose: draft.quickPurpose === "paid" ? "paid" : "split",
      quickStage: ["method", "items", "review", "payer"].includes(draft.quickStage)
        ? draft.quickStage
        : "items",
      restaurantEqualSplit: Boolean(draft.restaurantEqualSplit),
      quickPayerId: knownParticipantIdSet.has(draft.quickPayerId)
        ? draft.quickPayerId
        : safeFallbackParticipantId,
      quickItems: quickItems.length
        ? quickItems
        : [{ name: "", amount: "", sharedBy: safeFallbackParticipantId }],
      inlinePayerGuestIndex: null,
      inlinePayerGuestName: "",
      quickInlineGuestIndex: null,
      quickInlineGuestName: "",
      restored: true,
      error: ""
    };
  } catch {
    return null;
  }
}

function hasMeaningfulExpenseDraft(draft) {
  const primaryName = String(draft?.name ?? "").trim();
  const hasPrimaryInput =
    (primaryName.length > 0 &&
      !(draft?.restaurantEqualSplit && primaryName === "חשבון מסעדה")) ||
    String(draft?.total ?? "").trim().length > 0;
  const hasQuickInput = Array.isArray(draft?.quickItems) &&
    draft.quickItems.some(
      (item) =>
        String(item?.name ?? "").trim().length > 0 ||
        String(item?.amount ?? "").trim().length > 0
    );
  const hasManualPayerInput = Array.isArray(draft?.payers) &&
    draft.payers.some(
      (payer) =>
        payer?.amountTouched === true &&
        String(payer?.amount ?? "").trim().length > 0
    );

  return hasPrimaryInput || hasQuickInput || hasManualPayerInput;
}
