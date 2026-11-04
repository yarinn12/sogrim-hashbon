// Presentation only. A receipt belongs to one account generation and UI surface.
export const IMAGE_OPEN_ERROR_MESSAGE = "התמונה לא נפתחה. אפשר לבחור תמונה אחרת או לצלם מחדש.";
export const IMAGE_COVER_PERMISSION_MESSAGE = "תמונת האירוע לא נשמרה. אין לחשבון הרשאה לשנות אותה. בקש ממנהל האירוע לבדוק את ההרשאות.";

export function imageFeedbackMessage(feedback, surface) {
  if (!feedback || !surface || feedback.scope !== surface.scope ||
      feedback.screen !== surface.screen || feedback.dialog !== surface.dialog ||
      feedback.eventId !== surface.eventId) return "";
  return String(feedback.message ?? "");
}

export function renderImageSelectionFeedback(message) {
  if (!message) return "";
  const text = String(message).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  return `<p class="image-selection-feedback" role="alert">${text}</p>`;
}
