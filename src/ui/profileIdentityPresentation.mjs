function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Pure identity presentation; values and existing SVG markup come from app adapters.
export function renderProfileIdentitySummaryView({ field, value, editIconHtml, chevronIconHtml }) {
  const username = field === "username";
  const identity = username ? "username" : "display-name";
  const action = username ? "edit-profile-username" : "edit-profile-name";
  const ariaLabel = username ? "עריכת שם משתמש" : "עריכת שם פרטי ושם משפחה";
  const label = username ? "שם משתמש" : "שם מלא";
  const escapedValue = escapeHtml(value);
  return `<button class="secondary-button profile-identity-summary profile-identity-entry" data-profile-identity="${identity}" data-action="${action}" type="button" aria-label="${ariaLabel}">
    <span class="profile-shortcut-icon" aria-hidden="true">${editIconHtml}</span>
    <span class="profile-identity-copy"><span>${label}</span><strong>${username ? `<bdi dir="ltr">${escapedValue}</bdi>` : escapedValue}</strong></span>
    <span class="profile-shortcut-chevron" aria-hidden="true">${chevronIconHtml}</span>
  </button>`;
}
