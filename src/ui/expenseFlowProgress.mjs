function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Buttons retain the original visual bars. Validation and navigation stay in the app.
export function renderExpenseFlowProgressView({ steps, currentStep }) {
  const currentIndex = steps.findIndex(step => step.key === currentStep);
  return `<ol class="expense-flow-progress" aria-label="התקדמות בהוספת הוצאה">
    ${steps.map((step, index) => {
      const stateClass = index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : "";
      const label = `שלב ${index + 1} מתוך ${steps.length}: ${step.title}`;
      return `<li class="${stateClass}">
        <button class="expense-progress-step-button" type="button" data-action="expense-progress-step" data-step="${escapeHtml(step.key)}" aria-label="${escapeHtml(label)}" ${index === currentIndex ? 'aria-current="step"' : ""}>
          <span>${escapeHtml(label)}</span>
        </button>
      </li>`;
    }).join("")}
  </ol>`;
}
