export function createFeedbackDraft(ownerId = "") {
  return { ownerId: String(ownerId), category: "bug", message: "", error: "", status: "editing", submissionId: 0 };
}
export function feedbackRequestIsCurrent(draft, request, currentOwnerId) {
  return Boolean(request?.ownerId && draft === request.draft && draft.ownerId === request.ownerId && currentOwnerId === request.ownerId && draft.submissionId === request.id);
}
