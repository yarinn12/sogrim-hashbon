import {iconSvg} from "../uiIcons.mjs";

export const APP_NOTICE_COPY_ID = "app-notice-copy";
const attentionMessages = new Set([
  "החיבור לחשבון פג. התחברו מחדש ונסו שוב.",
  "אין לך הרשאה ליצור קישור פתוח לאירוע הזה."
]);
const connectionShareNotice = "לא הצלחנו להכין קישור בטוח כרגע. כדאי לבדוק את החיבור ולנסות שוב.";
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Presentation adapter: the underlying notice/write/authorization policy is unchanged.
export function appNoticeModel(message, presentation) {
  if (!presentation?.visible) return presentation;
  const kind = presentation.kind === "error" || attentionMessages.has(message) ? "error" : presentation.kind;
  return kind === "error" ? {...presentation, kind, ttlMs: 0} : presentation;
}

export function renderAppNoticeView({message = "", presentation} = {}) {
  if (!presentation?.visible) return "";
  return `
    <div class="notice app-toast app-inline-notice" data-notice-kind="${escapeHtml(presentation.kind)}" role="status" aria-live="polite" aria-atomic="true">
      <span class="app-toast-copy" id="${APP_NOTICE_COPY_ID}">${escapeHtml(message)}</span>
      <button class="app-toast-close" type="button" data-action="dismiss-notice" aria-label="סגירת ההודעה" title="סגירת ההודעה">${iconSvg("x")}</button>
    </div>
  `;
}

export function shouldConsolidateShareError({shareFailed = false, notice = "", shareFailureMessage = ""} = {}) {
  return Boolean(shareFailed && notice && (notice === shareFailureMessage || notice === connectionShareNotice));
}

// Keep app notices in the active scroll surface; independently owned sync nodes stay untouched.
export function placeAppNotice(app) {
  const node = app.querySelector(".app-inline-notice");
  if (!node) return;
  const panels = [...app.querySelectorAll('.event-modal, .expense-modal, [role="dialog"], [role="alertdialog"]')]
    .filter(panel => !panel.hidden && panel.getClientRects().length);
  const panel = panels.at(-1);
  if (!panel || panel.contains(node)) return;
  const body = panel.querySelector(":scope > .event-modal-body, :scope > .expense-modal-body");
  const header = panel.querySelector(":scope > .event-modal-header, :scope > .expense-modal-header");
  if (body) body.prepend(node);
  else if (header) header.after(node);
  else panel.prepend(node);
}

export function revealAppNotice(app, isCurrent) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if (!isCurrent()) return;
    const node = app.querySelector(".app-inline-notice");
    if (!node?.isConnected) return;
    const scroller = node.closest('.event-modal, .expense-modal, [role="dialog"], [role="alertdialog"]');
    node.scrollIntoView({block: scroller && node.offsetHeight > scroller.clientHeight ? "start" : "nearest", behavior: "instant"});
  }));
}

export function clearAppNoticeView(app) {
  app.querySelector(".app-inline-notice")?.remove();
  for (const node of app.querySelectorAll("[aria-describedby]")) {
    const ids = node.getAttribute("aria-describedby").split(/\s+/).filter(id => id !== APP_NOTICE_COPY_ID);
    if (ids.length) node.setAttribute("aria-describedby", ids.join(" "));
    else node.removeAttribute("aria-describedby");
  }
}
