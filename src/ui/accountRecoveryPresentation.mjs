import { renderAccountEntryBrandView } from "./accountEntryPresentation.mjs";
import { iconSvg } from "../uiIcons.mjs";

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

// Presentation only. Delivery, PKCE, sessions, account loading and retries stay
// in the account adapter. No persisted recovery state or credentials live here.
export function renderAccountRecoveryView({
  screen = "request", email = "", error = "", message = "",
  errorFieldName = "", deliveryReady = false,
  connecting = false, signInPending = false
} = {}, { inviteMarkup = "" } = {}) {
  const back = `<button class="account-flow-secondary" type="button" data-account-action="recovery-login"><span>חזרה לכניסה</span>${iconSvg("chevron-left")}</button>`;
  const primary = (text, action) => `<button class="primary-button account-auth-submit" type="button" ${action}>${text}</button>`;
  const feedback = error
    ? `<p id="account-auth-feedback" class="account-flow-feedback" role="alert">${escapeHtml(error)}</p>`
    : message ? `<p id="account-auth-feedback" class="account-flow-feedback" role="status">${escapeHtml(message)}</p>` : "";
  const recipient = `<div class="account-flow-recipient"><span>הקישור נשלח אל</span><p dir="ltr">${escapeHtml(email)}</p></div>`;
  let title, content;
  if (screen === "request") {
    title = "שכחתי סיסמה";
    content = `<p class="account-flow-copy">הזן את האימייל שאיתו נרשמת. נשלח לך קישור לבחירת סיסמה חדשה.</p>
      <form class="account-auth-form" data-account-form data-mode="request-password-reset" novalidate>
        <label><span>אימייל</span><input name="email" type="email" dir="ltr" autocomplete="email" inputmode="email" spellcheck="false" value="${escapeHtml(email)}" required aria-invalid="${errorFieldName === "email"}"${errorFieldName === "email" ? ' aria-describedby="account-auth-feedback"' : ""}></label>
        ${feedback}
        ${deliveryReady ? '<button class="primary-button account-auth-submit" type="submit">שלח קישור לאיפוס</button>' : '<p class="account-flow-hint">שליחת קישורים לאימייל אינה זמינה כרגע.</p>'}
      </form>${back}`;
  } else if (screen === "reset-sent" || screen === "verify") {
    const verify = screen === "verify";
    title = verify ? "אימות האימייל" : "קישור האיפוס נשלח";
    content = `${recipient}<p class="account-flow-copy">${verify ? "פתח את הקישור באימייל כדי להפעיל את החשבון. אחר כך תוכל להתחבר." : "פתח את הקישור באימייל כדי לבחור סיסמה חדשה."}</p>
      <p class="account-flow-hint">לא הגיע? כדאי לבדוק גם בספאם.</p>
      ${deliveryReady ? primary(verify ? "שלח שוב קישור אימות" : "שלח קישור שוב", `data-account-action="${verify ? "resend-verification" : "resend-password-reset"}"`) : ""}
      ${back}${feedback}`;
  } else if (screen === "connection") {
    title = connecting ? "פותחים את החשבון" : signInPending ? "פתיחת החשבון מתעכבת" : "החיבור מתעכב";
    content = `<p class="account-flow-copy" role="status" aria-live="polite">${connecting ? "עוד רגע והאירועים שלך כאן." : signInPending ? "הכניסה הצליחה, אבל עדיין לא הצלחנו לטעון את החשבון." : "כדאי לבדוק את החיבור לאינטרנט ולנסות שוב."}</p>
      ${!connecting && signInPending ? '<p class="account-flow-hint">בדוק את החיבור לאינטרנט ונסה שוב.</p>' : ""}
      ${connecting ? "" : primary("נסה שוב", "data-account-retry")}`;
  } else {
    throw new RangeError("Unknown account recovery screen");
  }
  return `<div class="account-auth-shell">${renderAccountEntryBrandView()}<section class="account-auth-form-panel">${inviteMarkup}
    <div class="account-auth-heading"><h2 id="account-recovery-title" tabindex="-1">${title}</h2></div>${content}
  </section></div>`;
}
