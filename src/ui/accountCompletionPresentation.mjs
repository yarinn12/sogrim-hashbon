import {renderAccountEntryBrandView} from "./accountEntryPresentation.mjs";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttribute = value => escapeHtml(value).replaceAll("`", "&#096;");

// Presentation only. The adapter decides which identity details are already saved.
export function renderAccountCompletionView({
  displayName = "",
  username = "",
  error = "",
  errorFieldName = "",
  hasSavedFullName = false,
  hasInvite = false
} = {}) {
  return `
    <div class="account-auth-shell account-auth-shell-compact">
      ${renderAccountEntryBrandView()}
      <section class="account-auth-form-panel">
        <div class="account-auth-heading">
          <h2>השלמת פרטים</h2>
          <p>${hasInvite ? "אחרי השמירה נמשיך אוטומטית לאירוע מהקישור." : "כדי שחברים יוכלו לזהות ולמצוא אותך."}</p>
        </div>
        <form class="account-auth-form" data-account-form data-mode="complete-profile" novalidate>
          ${hasSavedFullName
            ? `<input name="displayName" type="hidden" value="${escapeAttribute(displayName)}" />`
            : `<label>
                <span>שם פרטי ושם משפחה</span>
                <input name="displayName" autocomplete="name" value="${escapeAttribute(displayName)}" />
              </label>`}
          <label>
            <span>שם משתמש</span>
            <input name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escapeAttribute(username)}" ${errorFieldName === "username" ? 'aria-invalid="true" aria-describedby="account-auth-feedback"' : ""} required />
          </label>
          ${error ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button account-auth-submit" type="submit">שמור והמשך</button>
        </form>
        <button class="account-forgot-button" type="button" data-account-action="signout">כניסה עם חשבון אחר</button>
        <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
      </section>
    </div>
  `;
}
