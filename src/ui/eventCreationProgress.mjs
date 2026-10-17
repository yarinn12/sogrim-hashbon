// Pure presentation: the app supplies stage and type availability. Navigation,
// financial settings and draft persistence stay with the existing app actions.
const STEPS = [
  { id: "type", label: "אירוע" },
  { id: "details", label: "פרטים" },
  { id: "settlement", label: "הגדרות חשבון" },
  { id: "participants", label: "משתתפים" }
];

export function renderEventCreationProgressView({ activeStep, eventTypeSelected = false } = {}) {
  const activeIndex = Math.max(0, STEPS.findIndex(step => step.id === activeStep));
  return `
    <ol class="event-creation-progress event-creation-tabs" aria-label="שלבי יצירת אירוע">
      ${STEPS.map((step, index) => `
        <li class="${index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : ""}" ${index === activeIndex ? 'aria-current="step"' : ""}>
          <button type="button" data-action="go-new-event-step" data-new-event-step="${step.id}" ${!eventTypeSelected && step.id !== "type" ? "disabled" : ""}>
            <strong>${step.label}</strong>
          </button>
        </li>
      `).join("")}
    </ol>
  `;
}
