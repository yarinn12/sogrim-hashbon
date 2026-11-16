import { iconSvg } from "../uiIcons.mjs";
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
export function renderFeedbackPageView({ backButton = "" } = {}) {
  return `<section class="screen font-hebrew profile-setup-screen profile-edit-screen feedback-page-screen" data-screen-kind="profile" data-feedback-screen>
    <header class="top">${backButton}<div class="brand"><h1 id="account-feedback-title">שליחת משוב</h1></div></header>
    <section class="panel feedback-page-panel" aria-labelledby="account-feedback-title" data-account-feedback-page></section>
  </section>`;
}
export function renderFeedbackFormView({ category = "bug", message = "", error = "", busy = false, signedIn = true } = {}) {
  if (!signedIn) return `<p role="status">יש להתחבר לחשבון כדי לשלוח משוב.</p><button class="secondary-button" type="button" data-action="edit-profile">כניסה לחשבון</button>`;
  const disabled = busy ? " disabled" : "";
  return `      <form class="account-feedback-form" data-account-feedback-form novalidate${busy ? ' aria-busy="true"' : ""}>
        <fieldset class="account-feedback-categories">
          <legend>נושא המשוב</legend>
          <label>
            <input type="radio" name="category" value="bug"${category === "bug" ? " checked" : ""}${disabled} />
            <span>תקלה</span>
          </label>
          <label>
            <input type="radio" name="category" value="clarity"${category === "clarity" ? " checked" : ""}${disabled} />
            <span>לא ברור</span>
          </label>
          <label>
            <input type="radio" name="category" value="idea"${category === "idea" ? " checked" : ""}${disabled} />
            <span>הצעה</span>
          </label>
        </fieldset>
        <label class="account-feedback-message">
          <span>פרטי המשוב</span>
          <textarea
            name="message"
            rows="4"
            minlength="10"
            maxlength="1200"
            autocomplete="off"
            placeholder="כתבו כאן את הפרטים…"
            aria-describedby="account-feedback-description account-feedback-error"${error ? ' aria-invalid="true"' : ""}
            required${disabled}
          >${escapeHtml(message)}</textarea>
          <small id="account-feedback-description">בלי שמות, מספרי טלפון או מידע כספי. פרטי הגרסה מצורפים אוטומטית.</small>
        </label>
        <p class="account-feedback-error" id="account-feedback-error" role="alert" data-account-feedback-error${error ? "" : " hidden"}>${escapeHtml(error)}</p>
        <div class="account-feedback-actions">
          <button class="primary-button" type="submit"${disabled}>שליחה</button>
        </div>
      </form>`;
}
export function renderFeedbackSuccessView() {
  return `<div class="account-feedback-success" role="status">
      <div class="account-feedback-success-heading">
        <span class="account-feedback-success-mark" aria-hidden="true">${iconSvg("check")}</span>
        <h2>המשוב נשלח</h2>
      </div>
      <p>תודה על המשוב.</p>
      <button class="primary-button" type="button" data-account-action="feedback-done">חזרה לפרופיל</button>
    </div>`;
}
