export const EXPENSE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPENSE_DRAFT_STORAGE_PREFIX = "settle-friends-expense-draft";

export function expenseDraftMemoryKey(participantId, eventId) {
  if (!participantId || !eventId) return "";
  return `${EXPENSE_DRAFT_STORAGE_PREFIX}:${participantId}:${eventId}`;
}

export function serializeExpenseDraftMemory(draft, savedAt = Date.now()) {
  if (!draft?.eventId || draft.id) return "";

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
      draft.id ||
      draft.eventId !== eventId
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
