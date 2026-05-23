export function validateExpense(expense) {
  const errors = [];

  if (expense.name.trim().length === 0) {
    errors.push("צריך לתת שם להוצאה.");
  }

  if (expense.total <= 0) {
    errors.push("סכום ההוצאה חייב להיות גדול מאפס.");
  }

  if (expense.payers.length === 0) {
    errors.push("צריך לבחור לפחות משלם אחד.");
  }

  if (expense.sharedByParticipantIds.length === 0) {
    errors.push("צריך לבחור לפחות משתתף אחד שמשתתף בהוצאה.");
  }

  const paidTotal = expense.payers.reduce((sum, payer) => sum + payer.amount, 0);
  if (paidTotal !== expense.total) {
    errors.push("סכום המשלמים חייב להיות שווה לסכום ההוצאה.");
  }

  return errors;
}
