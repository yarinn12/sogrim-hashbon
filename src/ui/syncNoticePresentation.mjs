import { iconSvg } from "../uiIcons.mjs";

// Presentation only: this owner never reads the outbox, sends writes or acknowledges saves.
const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
export function createSyncNoticePresentation({ document = globalThis.document, requestFrame = callback => window.requestAnimationFrame(callback) } = {}) {
  let retainedSyncNode = null;
  let lastFeedbackKey = "";
  function render({ status, message }) {
    let node = document.querySelector("[data-sync-status]") || retainedSyncNode;
    if (!node) {
      node = document.createElement("div");
      node.dataset.syncStatus = "";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      node.setAttribute("aria-atomic", "true");
      document.body.append(node);
    }
    retainedSyncNode = node;
    node.className = `public-sync-status notice app-toast sync-inline-notice is-${status}`;
    node.hidden = false;
    node.innerHTML = `
      <span class="app-toast-copy">${escapeHtml(message)}</span>
      <button class="app-toast-close" type="button" data-sync-dismiss aria-label="סגירת ההודעה" title="סגירת ההודעה">${iconSvg("x")}</button>
    `;
    return node;
  }
  function place(status) {
    const app = document.querySelector("#app");
    if (!app) return;
    const panel = [...app.querySelectorAll('.event-modal, .expense-modal, [role="dialog"], [role="alertdialog"]')].filter(n=>!n.hidden&&n.getClientRects().length).at(-1);
    const body = panel?.querySelector(":scope > .event-modal-body, :scope > .expense-modal-body");
    const screen = app.querySelector(":scope > .screen");
    const header = panel?.querySelector(":scope > .event-modal-header, :scope > .expense-modal-header") || screen?.querySelector(":scope > .top");
    const node = retainedSyncNode;
    if (node && status && !node.hidden) {
      if (body && node.parentElement !== body) body.prepend(node);
      else if (!body && header && node.parentElement !== header.parentElement) header.after(node);
      else if (!body && !header && panel && node.parentElement !== panel) panel.prepend(node);
      else if (!body && !header && !panel && screen && node.parentElement !== screen) screen.prepend(node);
    }
    let route = panel?.querySelector("[data-route-sync-status]");
    if (route) {
      route.classList.add("sync-inline-route");
      if (body && route.parentElement !== body) body.prepend(route);
      const retry = route.querySelector("[data-sync-retry]");
      if (retry && retry.textContent !== "נסה לשמור שוב") retry.textContent = "נסה לשמור שוב";
    }
    const feedback = node && status && !node.hidden ? node : route && !route.hidden ? route : null;
    const key = feedback ? (feedback === node ? status : feedback.querySelector("[data-sync-event-id]")?.dataset.syncEventId || "route") + ":" + feedback.textContent : "";
    if (!key) { lastFeedbackKey = ""; return; }
    if (lastFeedbackKey === key) return;
    lastFeedbackKey = key;
    requestFrame(()=>requestFrame(()=>{
      if (lastFeedbackKey !== key || !feedback.isConnected || feedback.hidden) return;
      const scroller = feedback.closest('.event-modal, .expense-modal, [role="dialog"], [role="alertdialog"]');
      feedback.scrollIntoView({block:scroller && feedback.offsetHeight > scroller.clientHeight ? "start" : "nearest",behavior:"instant"});
    }));
  }

  return { render, place };
}

export function renderPendingSyncSummary(target, message, { pendingEventIds = [], failureDetails = {}, document = target.ownerDocument } = {}) {
  const ids = Array.isArray(pendingEventIds) ? [...new Set(pendingEventIds)] : [];
  let supplied = [];
  try {
    const parsed = JSON.parse(target.dataset.syncAccountEvents || "[]");
    if (Array.isArray(parsed)) supplied = parsed.filter(item =>
      typeof item?.id === "string" && typeof item?.name === "string");
  } catch { /* Older home markup can still resolve its visible event row. */ }
  const rows = [...document.querySelectorAll('.product-home-screen [data-action="open-event"]')]
    .filter(button => !target.contains(button));
  const events = ids.map(id => {
    const row = rows.find(button => button.dataset.eventId === id);
    const name = supplied.find(item => item.id === id)?.name ||
      (id === target.dataset.syncAccountEventId ? target.dataset.syncAccountEventName : "") ||
      row?.querySelector(".event-row-title strong, .recent-event-main strong")?.textContent?.trim() || "";
    return { id, name, failureKind: failureDetails.eventFailures?.find(item => item.id === id)?.failureKind || "" };
  });
  target.classList.add("sync-pending-context");
  const key = JSON.stringify([message, events]);
  if (target.dataset.syncSummaryKey === key) return;
  target.dataset.syncSummaryKey = key;
  target.replaceChildren();
  if (!message) return;

  const eventName = events[0]?.name;
  const context = ids.length > 1
    ? `עדכונים ב־${ids.length} אירועים לא סונכרנו. `
    : eventName ? `עדכונים באירוע ״${eventName}״ לא סונכרנו. `
      : ids.length === 1 ? "עדכונים באירוע לא סונכרנו. " : "עדכונים בחשבון לא סונכרנו. ";
  const guidance = failureDetails.failureKind === "permission"
    ? "השרת דחה שמירה בגלל הרשאה. פרטי האירועים מופיעים כאן."
    : message;
  if (failureDetails.failureKind === "permission" && ids.length && events.every(event => event.failureKind === "permission")) {
    const heading = document.createElement("strong");
    heading.className = "sync-pending-heading";
    heading.textContent = ids.length > 1 ? `שמירת העדכונים נחסמה ב־${ids.length} אירועים` : "שמירת העדכונים באירוע נחסמה";
    const explanation = document.createElement("p");
    explanation.className = "sync-pending-explanation";
    explanation.textContent = `העדכונים שמורים במכשיר הזה. בדקו הרשאות עם ${ids.length > 1 ? "מנהלי האירועים" : "מנהל האירוע"}.`;
    target.append(heading, explanation);
  } else {
    target.append(document.createTextNode(`${context}${guidance} העדכונים הממתינים שמורים במכשיר הזה.`));
  }
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "secondary-button pending-sync-review sync-pending-retry";
  retry.dataset.syncRetry = "";
  retry.textContent = "נסה לשמור שוב";
  target.append(retry);
  const addReview = (container, event) => {
    if (!event.name) {
      container.append(document.createTextNode("אירוע שהוסר או אינו זמין — עדכון ממתין לסנכרון"));
      return;
    }
    const review = document.createElement("button");
    review.type = "button";
    review.className = "pending-sync-review";
    review.dataset.action = "open-event";
    review.dataset.eventId = event.id;
    review.textContent = event.name;
    review.setAttribute("aria-label", `פתיחת האירוע ${event.name} לבדיקת העדכון הממתין`);
    container.append(document.createTextNode(" "), review);
    if (event.failureKind) container.append(document.createTextNode(
      event.failureKind === "permission" ? " — השמירה נחסמה בגלל הרשאה" : " — נדרש לבדוק את העדכון"));
  };
  if (events.length === 1) { addReview(target, events[0]); return; }
  if (!events.length) return;
  const details = document.createElement("details");
  details.dataset.syncEventDetails = "";
  const summary = document.createElement("summary");
  summary.className = "pending-sync-review";
  summary.textContent = "באילו אירועים?";
  const chevron = document.createElement("span");
  chevron.className = "sync-pending-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = iconSvg("chevron-left");
  summary.append(chevron);
  const list = document.createElement("ul");
  for (const event of events) {
    const item = document.createElement("li");
    addReview(item, event);
    list.append(item);
  }
  details.append(summary, list);
  target.append(details);
}
