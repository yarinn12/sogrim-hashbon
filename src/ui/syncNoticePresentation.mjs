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

const pendingSummaryNodes = new WeakMap();
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
  const key = JSON.stringify(["pending-disclosure-v1", message, failureDetails.failureKind, events]);
  if (target.dataset.syncSummaryKey === key) return;
  const noticeWasOpen = target.querySelector("[data-sync-pending-notice]")?.open === true;
  const detailsWereOpen = target.querySelector("[data-sync-event-details]")?.open === true;
  target.dataset.syncSummaryKey = key;
  if (!message) { target.replaceChildren(); pendingSummaryNodes.delete(target); return; }

  // Keep the failure visible without turning the whole durable pending
  // inventory into a large error panel or a count of confirmed failures.
  let nodes = pendingSummaryNodes.get(target);
  if (!nodes || !target.contains(nodes.notice)) {
    target.replaceChildren();
    const notice = document.createElement("details");
    notice.dataset.syncPendingNotice = "";
    notice.open = noticeWasOpen;
    const toggle = document.createElement("summary");
    toggle.className = "sync-pending-toggle";
    const heading = document.createElement("strong");
    heading.className = "sync-pending-heading";
    heading.textContent = "השמירה לא הושלמה";
    const toggleChevron = document.createElement("span");
    toggleChevron.className = "sync-pending-chevron";
    toggleChevron.setAttribute("aria-hidden", "true");
    toggleChevron.innerHTML = iconSvg("chevron-left");
    toggle.append(heading, toggleChevron);
    const body = document.createElement("div");
    body.className = "sync-pending-body";
    notice.append(toggle, body);
    target.append(notice);
    const explanation = document.createElement("p");
    explanation.className = "sync-pending-explanation";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary-button pending-sync-review sync-pending-retry";
    retry.dataset.syncRetry = "";
    retry.textContent = "נסה לשמור שוב";
    const reviews = document.createElement("div");
    reviews.dataset.syncEventReviews = "";
    body.append(explanation, retry, reviews);
    nodes = { notice, explanation, reviews };
    pendingSummaryNodes.set(target, nodes);
  }
  // New receipts update copy and event rows only. The focused summary and retry
  // stay attached so a late response cannot consume a keyboard or pointer action.
  const { explanation, reviews } = nodes;
  if (failureDetails.failureKind === "permission" && ids.length && events.every(event => event.failureKind === "permission")) {
    explanation.textContent = `העדכונים שמורים במכשיר הזה. בדקו הרשאות עם ${ids.length > 1 ? "מנהלי האירועים" : "מנהל האירוע"}.`;
  } else {
    explanation.textContent = [message, "העדכונים הממתינים שמורים במכשיר הזה."].filter(Boolean).join(" ");
  }
  const failureCopy = event => event.failureKind
    ? event.failureKind === "permission" ? " — השמירה נחסמה בגלל הרשאה" : " — נדרש לבדוק את העדכון"
    : "";
  const updateReview = (row, event) => {
    if (row.review.textContent !== event.name) row.review.textContent = event.name;
    row.review.setAttribute("aria-label", `פתיחת האירוע ${event.name} לבדיקת העדכון הממתין`);
    row.failure.textContent = failureCopy(event);
  };
  // A new receipt changes attribution, not the user's pending inventory. Keep
  // both the summary and event buttons attached until their destinations change;
  // replacing them between pointerdown and click consumes native activation.
  const reviewStructureKey = JSON.stringify(events.map(event => [event.id, Boolean(event.name)]));
  if (nodes.reviewStructureKey === reviewStructureKey) {
    for (const event of events) {
      const row = nodes.reviewRows.get(event.id);
      if (row) updateReview(row, event);
    }
    return;
  }
  nodes.reviewStructureKey = reviewStructureKey;
  nodes.reviewRows = new Map();
  reviews.replaceChildren();
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
    const row = { review, failure: document.createTextNode("") };
    updateReview(row, event);
    nodes.reviewRows.set(event.id, row);
    container.append(document.createTextNode(" "), review, row.failure);
  };
  if (events.length === 1) { addReview(reviews, events[0]); return; }
  if (!events.length) return;
  const details = document.createElement("details");
  details.dataset.syncEventDetails = "";
  details.open = detailsWereOpen;
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
  reviews.append(details);
}
