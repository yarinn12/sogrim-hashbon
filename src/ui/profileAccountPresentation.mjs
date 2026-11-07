function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// Pure Profile account/support view. Authentication and actions stay in the adapter.
export function renderProfileAdPrivacyControlView(iconSvg) {
  return `<button class="account-data-link" type="button" data-account-action="ad-privacy">${iconSvg("sliders")}<span class="account-row-label">העדפות פרסום</span><span class="account-row-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></button>`;
}

export function renderProfileAccountControlsView({ email, adPrivacyControl, iconSvg }) {
  return `<details class="account-profile-controls" data-account-controls>
      <summary class="account-profile-controls-summary">
        <span class="account-profile-controls-summary-copy">
          <strong>חשבון ותמיכה</strong>
        </span>
        <span class="account-profile-controls-summary-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
      </summary>
      <div class="account-profile-controls-body">
        <p class="account-profile-email"><span>מחובר כ־</span><bdi dir="ltr">${escapeHtml(email).replaceAll("@", "@<wbr>").replaceAll(".", ".<wbr>").replaceAll("_", "_<wbr>")}</bdi></p>
        <button class="account-feedback-entry" type="button" data-account-action="feedback-open">
          <span class="account-feedback-entry-icon" aria-hidden="true">
            ${iconSvg("message")}
          </span>
          <span class="account-feedback-entry-copy">
            <strong>שליחת משוב</strong>
            <small>דיווח על תקלה או הצעה לשיפור</small>
          </span>
          <span class="account-feedback-entry-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span>
        </button>
        <nav class="account-data-links" aria-label="מידע על החשבון">
          <a href="./support.html" class="account-data-link">${iconSvg("message")}<span class="account-row-label">עזרה ותמיכה</span><span class="account-row-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></a>
          <a href="./privacy.html" class="account-data-link">${iconSvg("eye")}<span class="account-row-label">מדיניות פרטיות</span><span class="account-row-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></a>
          <a href="./terms.html" class="account-data-link">${iconSvg("receipt")}<span class="account-row-label">תנאי שימוש</span><span class="account-row-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></a>
          <a href="./accessibility.html" class="account-data-link">${iconSvg("accessibility")}<span class="account-row-label">הצהרת נגישות</span><span class="account-row-chevron" aria-hidden="true">${iconSvg("chevron-left")}</span></a>
          ${adPrivacyControl}
        </nav>
        <div class="account-profile-actions">
          <button class="secondary-button" type="button" data-account-action="signout">${iconSvg("log-out")}<span class="account-row-label">התנתק</span></button>
        </div>
        <div class="account-danger-zone">
          <button class="secondary-button account-delete-button" type="button" data-account-action="delete-account-open"><span class="button-action-icon" data-command-icon="delete-account-open" aria-hidden="true">${iconSvg("trash")}</span><span class="account-row-label">מחיקת חשבון</span></button>
          <small class="account-danger-note">החשבון והמידע האישי יימחקו לצמיתות.</small>
        </div>
      </div>
    </details>`;
}
