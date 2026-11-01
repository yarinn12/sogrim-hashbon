import {iconSvg} from "../uiIcons.mjs";
import {renderAccountEntryBrandView} from "./accountEntryPresentation.mjs";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

// Presentation only. Recovery eligibility and password updates stay in the adapter.
export function renderAccountPasswordResetView({error = ""} = {}) {
  return `
    <div class="account-auth-shell account-auth-shell-compact">
      ${renderAccountEntryBrandView()}
      <section class="account-auth-form-panel">
        <div class="account-auth-heading">
          <h2>סיסמה חדשה</h2>
          <p>לפחות 8 תווים.</p>
        </div>
        <form class="account-auth-form" data-account-form data-mode="reset-password" novalidate>
          <label>
            <span>סיסמה חדשה</span>
            <span class="account-password-input">
              <input name="password" type="password" autocomplete="new-password" minlength="8" required />
              <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
            </span>
          </label>
          <label>
            <span>אימות סיסמה</span>
            <span class="account-password-input">
              <input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="8" required />
              <button class="account-password-toggle" type="button" data-account-action="toggle-password" aria-label="הצג סיסמה" aria-pressed="false">${iconSvg("eye")}</button>
            </span>
          </label>
          ${error ? `<p id="account-auth-feedback" class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button account-auth-submit" type="submit">שמור סיסמה</button>
        </form>
        <p class="visually-hidden" data-account-auth-status role="status" aria-live="polite"></p>
      </section>
    </div>
  `;
}
