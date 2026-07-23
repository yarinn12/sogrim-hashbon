export function validateExpense(expense, context = {}) {
  const errors = [];
  const participantIds = context.participantIds ?? [];
  const knownParticipantIds = new Set(participantIds);

  if (expense.name.trim().length === 0) {
    errors.push("צריך לתת שם להוצאה.");
  }

  if (expense.total <= 0) {
    errors.push("סכום ההוצאה חייב להיות גדול מאפס.");
  }

  if (expense.payers.length === 0) {
    errors.push("צריך לבחור לפחות משלם אחד.");
  }

  if (expense.payers.some((payer) => payer.amount <= 0)) {
    errors.push("סכום לכל משלם חייב להיות גדול מאפס.");
  }

  if (expense.sharedByParticipantIds.length === 0) {
    errors.push("צריך לבחור לפחות משתתף אחד שמשתתף בהוצאה.");
  }

  const payerParticipantIds = expense.payers.map((payer) => payer.participantId);

  if (hasDuplicates(expense.sharedByParticipantIds) || hasDuplicates(payerParticipantIds)) {
    errors.push("אותו משתתף מופיע יותר מפעם אחת בהוצאה.");
  }

  if (
    knownParticipantIds.size > 0 &&
    [...expense.sharedByParticipantIds, ...payerParticipantIds].some(
      (participantId) => !knownParticipantIds.has(participantId)
    )
  ) {
    errors.push("יש בהוצאה משתתף שלא נמצא באירוע.");
  }

  const paidTotal = expense.payers.reduce((sum, payer) => sum + payer.amount, 0);
  if (paidTotal !== expense.total) {
    errors.push("סכום המשלמים חייב להיות שווה לסכום ההוצאה.");
  }

  return errors;
}

function hasDuplicates(values) {
  return new Set(values.filter(Boolean)).size !== values.filter(Boolean).length;
}
