import { iconSvg } from "../uiIcons.mjs";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttribute = (value) => escapeHtml(value).replaceAll("`", "&#096;");

export function renderAccountEntryBrandView() {
  return `<section class="account-auth-brand">
    <span class="account-auth-mark" aria-hidden="true"><img src="./app-icon-exterior-192.png" alt="" width="50" height="50" /></span>
    <h1>סוגרים חשבון</h1>
  </section>`;
}

// Presentation only. Authentication, provider availability, invite recovery and
// form submissions remain in the account adapter. The two markup slots are
// produced by that adapter's existing invite/provider renderers.
export function renderAccountEntryView({
  mode = "login",
  emailDeliveryReady = false,
  hasInvite = false,
  inviteEventName = "",
  providerAvailable = false,
  message = "",
  error = "",
  providerFeedback = false,
  errorFieldName = "",
  showVerificationResend = false,
  values = {},
  showEmailAuth = !providerAvailable || mode === "signup" || Boolean(message) || Boolean(error)
} = {}, {
  inviteMarkup = "",
  providerMarkup = ""
} = {}) {
  const signup = mode === "signup";
  const formMode = signup ? "signup" : "login";
  const fields = values ?? {};
  const safeErrorFieldName = /^[a-zA-Z][\w-]*$/.test(errorFieldName)
    ? errorFieldName
    : "";
  const fieldErrorAttributes = (fieldName) => safeErrorFieldName === fieldName
    ? 'aria-invalid="true" aria-describedby="account-auth-feedback"'
    : 'aria-invalid="false"';
  const heading = hasInvite
    ? `מצטרפים ל־${escapeHtml(inviteEventName)}`
    : signup ? "יצירת חשבון" : "כניסה לחשבון";
  const providerSlot = `<div class="account-google-slot" data-google-auth-slot>${providerMarkup}</div>`;
  const errorMarkup = error
    ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>`
    : "";
  // Both messages remain visible if a caller supplies both. The field's error
  // association always points to the alert, never to a duplicate status ID.
  const statusMarkup = message
    ? `<p id="${error ? "account-auth-message" : "account-auth-feedback"}" class="account-auth-message" role="status">${escapeHtml(message)}</p>`
    : "";
  const submitLabel = hasInvite
    ? signup ? "צור חשבון והצטרף" : "התחבר והצטרף"
    : signup ? "צור חשבון" : "התחבר";

  return `<div class="account-auth-shell">
    ${renderAccountEntryBrandView()}
    <section class="account-auth-form-panel">
      ${inviteMarkup}
      <div class="account-auth-heading">
        <h2>${heading}</h2>
        ${hasInvite ? "<p>נכנסים או נרשמים, ומיד ממשיכים לאירוע שקיבלת.</p>" : ""}
      </div>
      ${providerFeedback ? errorMarkup : ""}
      ${signup ? "" : providerSlot}
      ${providerAvailable && !signup ? `<button
        class="account-email-toggle"
        type="button"
        data-account-action="toggle-email"
        aria-expanded="${Boolean(showEmailAuth)}"
        aria-controls="account-email-auth"
      >${showEmailAuth ? "חזרה לאפשרויות הכניסה" : "כניסה עם אימייל"}</button>` : ""}
      <div id="account-email-auth" class="account-email-auth" ${showEmailAuth ? "" : "hidden"}>
        <div class="account-auth-tabs" role="group" aria-label="כניסה או הרשמה">
          <button type="button" data-account-mode="login" aria-pressed="${!signup}" class="${signup ? "" : "is-active"}">כניסה</button>
          ${emailDeliveryReady ? `<button type="button" data-account-mode="signup" aria-pressed="${signup}" class="${signup ? "is-active" : ""}">הרשמה</button>` : ""}
        </div>
        <form class="account-auth-form" data-account-form data-mode="${formMode}" novalidate>
          ${signup ? `<label>
            <span>שם פרטי ושם משפחה</span>
            <input name="displayName" autocomplete="name" value="${escapeAttribute(fields.displayName)}" ${fieldErrorAttributes("displayName")} required />
          </label>
          <label>
            <span>שם משתמש</span>
            <input name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" value="${escapeAttribute(fields.username)}" ${fieldErrorAttributes("username")} required />
          </label>` : ""}
          <label>
            <span>אימייל</span>
            <input name="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" value="${escapeAttribute(fields.email)}" ${fieldErrorAttributes("email")} required />
            ${signup ? '<small class="account-auth-field-hint">אחרי ההרשמה נשלח קישור להפעלת החשבון.</small>' : ""}
          </label>
          <label>
            <span>סיסמה</span>
            <span class="account-password-input">
              <input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" ${fieldErrorAttributes("password")} required />
              <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
            </span>
          </label>
          ${!signup && emailDeliveryReady ? '<button class="account-forgot-button" type="button" data-account-action="forgot-password">שכחתי סיסמה</button>' : ""}
          ${statusMarkup}
          ${providerFeedback ? "" : errorMarkup}
          ${showVerificationResend && emailDeliveryReady ? '<button class="account-forgot-button" type="button" data-account-action="resend-verification">שלח שוב קישור אימות</button>' : ""}
          <button class="primary-button account-auth-submit" type="submit">${submitLabel}</button>
        </form>
        ${signup ? `${providerAvailable ? '<p class="account-entry-alternative">או</p>' : ""}${providerSlot}` : ""}
      </div>
      <p class="account-auth-legal">בהמשך השימוש אתה מאשר את <a href="./terms.html">תנאי השימוש</a> ואת <a href="./privacy.html">מדיניות הפרטיות</a>.</p>
      <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
    </section>
  </div>`;
}
