import { loadRuntimeConfig } from "./data/localStore.mjs";
import { runAfterFirstInteractiveScreen } from "./data/startupScheduler.mjs";
import {
  buildReferralInviteUrl,
  claimReferral,
  loadReferralProgramStatus,
  qualifyReferral,
  referralCodeFromUrl,
  normalizeReferralCode,
  referralProgramAvailable,
  withoutReferralAttribution
} from "./data/referralStore.mjs";
import {
  adFreeDaysRemaining,
  emptyReferralProgramStatus,
  isAdFreeActive,
  referralAnnualProgress
} from "./domain/entitlements.mjs";
import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-referral-rewards-style";
const DIALOG_ID = "public-referral-rewards-dialog";
const ACTIVITY_EVENT = "settle-friends:qualifying-activity";
const ENTITLEMENT_EVENT = "settle-friends:entitlements-changed";
const STATUS_REFRESH_INTERVAL_MS = 60_000;
const PENDING_REFERRAL_CODE_KEY = "settle-friends-pending-referral-code";
const PENDING_REFERRAL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

let runtimeConfig = null;
let referralStatus = emptyReferralProgramStatus();
let referralBusy = false;
let referralError = "";
let referralNotice = "";
let dialogReturnFocus = null;
let dialogReturnContext = "";
let referralDialogOpen = false;
let refreshRequest = null;
let lastStatusRefreshAt = 0;

setupReferralRewards();

function setupReferralRewards() {
  injectReferralStyles();
  document.addEventListener("settle-friends:screen-rendered", enhanceReferralEntryPoints);
  document.addEventListener(ACTIVITY_EVENT, handleQualifyingActivity);
  document.addEventListener("click", handleReferralAction);
  window.addEventListener("popstate", handleReferralHistory);
  window.addEventListener("settle-friends:native-back", handleNativeBack);
  window.addEventListener("online", recoverReferralAfterReconnect);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshReferralStatusIfStale();
  });
  document.addEventListener("keydown", handleReferralKeydown);

  globalThis.SogrimMonetization = {
    status: referralStatus,
    refresh: () => refreshReferralStatus({ force: true }),
    openInvites: (trigger) => openReferralDialog(trigger)
  };

  runAfterFirstInteractiveScreen(() => {
    initializeReferralProgram().catch(() => {});
    enhanceReferralEntryPoints();
  });
}

async function initializeReferralProgram() {
  runtimeConfig = await loadRuntimeConfig();
  if (!referralProgramAvailable(runtimeConfig)) {
    referralStatus = emptyReferralProgramStatus("signed-out");
    publishEntitlementStatus();
    enhanceReferralEntryPoints();
    return;
  }

  const referralCodeFromCurrentUrl = referralCodeFromUrl(window.location.href);
  if (referralCodeFromCurrentUrl) {
    savePendingReferralCode(referralCodeFromCurrentUrl);
  }
  const incomingCode =
    referralCodeFromCurrentUrl || loadPendingReferralCode();
  if (incomingCode) {
    try {
      const claim = await claimReferral(runtimeConfig, incomingCode);
      clearPendingReferralCode();
      referralNotice = claim?.claimed
        ? "ההזמנה נשמרה. כשהשימוש הראשון יושלם, החבר שהזמין אותך יקבל את ההטבה."
        : "";
    } catch (error) {
      referralNotice = friendlyClaimMessage(error);
      if (isTerminalReferralClaimError(error)) clearPendingReferralCode();
    } finally {
      if (referralCodeFromCurrentUrl) {
        const cleanedUrl = withoutReferralAttribution(window.location.href);
        window.history.replaceState(window.history.state, "", cleanedUrl);
      }
    }
  }

  await refreshReferralStatus({ force: true });
}

async function refreshReferralStatus({ force = false } = {}) {
  if (refreshRequest) return refreshRequest;
  if (
    !force &&
    referralStatus.status === "ready" &&
    Date.now() - lastStatusRefreshAt < STATUS_REFRESH_INTERVAL_MS
  ) {
    return referralStatus;
  }

  refreshRequest = (async () => {
    try {
      runtimeConfig ??= await loadRuntimeConfig();
      referralStatus = await loadReferralProgramStatus(runtimeConfig);
      referralError = "";
    } catch {
      referralStatus = {
        ...referralStatus,
        status: "error"
      };
      referralError = referralStatus.referralCode
        ? "לא הצלחנו לרענן כרגע. הקישור השמור שלך עדיין זמין."
        : "לא הצלחנו לטעון את מצב ההטבה כרגע. אפשר לנסות שוב.";
    } finally {
      lastStatusRefreshAt = Date.now();
      refreshRequest = null;
      publishEntitlementStatus();
      enhanceReferralEntryPoints();
      if (referralDialogOpen) renderReferralDialog();
    }
    return referralStatus;
  })();

  return refreshRequest;
}

function refreshReferralStatusIfStale() {
  if (!referralProgramAvailable(runtimeConfig)) return;
  if (Date.now() - lastStatusRefreshAt < STATUS_REFRESH_INTERVAL_MS) return;
  refreshReferralStatus({ force: true });
}

function recoverReferralAfterReconnect() {
  if (loadPendingReferralCode()) {
    initializeReferralProgram().catch(() => {});
    return;
  }
  refreshReferralStatusIfStale();
}

function savePendingReferralCode(code) {
  try {
    const normalizedCode = normalizeReferralCode(code);
    if (!normalizedCode) return;
    localStorage.setItem(
      PENDING_REFERRAL_CODE_KEY,
      JSON.stringify({
        code: normalizedCode,
        savedAt: Date.now()
      })
    );
  } catch {}
}

function loadPendingReferralCode() {
  try {
    const rawValue = localStorage.getItem(PENDING_REFERRAL_CODE_KEY);
    if (!rawValue) return "";

    const savedReferral = JSON.parse(rawValue);
    const code = normalizeReferralCode(savedReferral?.code);
    const savedAt = Number(savedReferral?.savedAt);
    if (
      !code ||
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > PENDING_REFERRAL_MAX_AGE_MS
    ) {
      clearPendingReferralCode();
      return "";
    }
    return code;
  } catch {
    clearPendingReferralCode();
    return "";
  }
}

function clearPendingReferralCode() {
  try {
    localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
  } catch {}
}

async function handleQualifyingActivity(event) {
  const eventId = String(event.detail?.eventId ?? "").trim();
  if (!eventId) return;

  try {
    runtimeConfig ??= await loadRuntimeConfig();
    const result = await qualifyReferral(runtimeConfig, eventId);
    if (result?.status === "rewarded") {
      referralNotice = "הפעילות אושרה וההטבה נפתחה אצל החבר שהזמין אותך.";
    }
    if (!["not_claimed", "unavailable"].includes(result?.status)) {
      await refreshReferralStatus({ force: true });
    }
  } catch {
    // Qualification is retried after the next eligible activity.
  }
}

function publishEntitlementStatus() {
  if (globalThis.SogrimMonetization) {
    globalThis.SogrimMonetization.status = referralStatus;
  }
  document.dispatchEvent(
    new CustomEvent(ENTITLEMENT_EVENT, {
      detail: { status: referralStatus }
    })
  );
}

function enhanceReferralEntryPoints() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;

  const homeSection =
    screen.matches('[data-screen-kind="home"]')
      ? screen.querySelector(":scope > .section")
      : null;
  if (homeSection) {
    syncReferralRewardCard(screen, "home", () => {
      homeSection.insertAdjacentHTML("beforebegin", referralRewardCard("home"));
    });
  }

  screen
    .querySelector('[data-referral-reward-card][data-referral-context="friends"]')
    ?.remove();

  const profilePanel = screen.matches(".profile-edit-screen")
    ? screen.querySelector(".profile-setup-panel")
    : null;
  if (profilePanel) {
    syncReferralRewardCard(screen, "profile", () => {
      const accountControls = profilePanel.querySelector("[data-account-controls]");
      if (accountControls) {
        accountControls.insertAdjacentHTML(
          "beforebegin",
          referralRewardCard("profile")
        );
      } else {
        profilePanel.insertAdjacentHTML("beforeend", referralRewardCard("profile"));
      }
    });
  }
}

function syncReferralRewardCard(screen, context, insertCard) {
  const selector =
    `[data-referral-reward-card][data-referral-context="${context}"]`;
  const existing = screen.querySelector(selector);
  if (!existing) {
    insertCard();
    return;
  }

  const restoreFocus = existing.contains(document.activeElement);
  existing.outerHTML = referralRewardCard(context);
  if (!restoreFocus) return;
  requestAnimationFrame(() => {
    screen.querySelector(`${selector} [data-open-referral-rewards]`)?.focus({
      preventScroll: true
    });
  });
}

function referralRewardCard(context = "friends") {
  const active = isAdFreeActive(referralStatus);
  const daysRemaining = adFreeDaysRemaining(referralStatus);
  const isHome = context === "home";
  const isProfile = context === "profile";
  const helper = active
    ? `ללא פרסומות עד ${formatDate(referralStatus.adFreeUntil)}`
    : isProfile
      ? `הזמנת חבר חדש פותחת ${referralStatus.rewardDays} ימים ללא פרסומות.`
      : "על כל חבר חדש שמצטרף ומשלים שימוש אמיתי.";
  const title = isHome
    ? "חודש ללא פרסומות"
    : isProfile
      ? "פרסומות והטבות"
      : "מזמינים חברים";
  const buttonLabel = isHome
    ? "הזמנת חברים"
    : isProfile && active
      ? "להארכת ההטבה"
      : isProfile
        ? "הזמנת חברים"
        : "להזמנה";
  const eyebrow = isProfile ? "המצב שלך" : "הטבת חברים";
  const buttonAriaLabel = active
    ? `${buttonLabel}: ${daysRemaining} ימים ללא פרסומות נותרו`
    : `${buttonLabel}: חודש ללא פרסומות`;
  return `
    <section id="referral-reward-card-${context}" class="referral-reward-card is-${context}" data-referral-reward-card data-referral-context="${context}" aria-labelledby="referral-reward-title-${context}">
      <span class="referral-reward-icon" aria-hidden="true">${giftIcon()}</span>
      <span class="referral-reward-copy">
        <small class="referral-reward-eyebrow">${eyebrow}</small>
        <strong id="referral-reward-title-${context}">${title}</strong>
        <small class="referral-reward-detail">${helper}</small>
        ${
          active
            ? `<span class="referral-reward-status"><span class="font-num">${daysRemaining}</span> ימים נותרו</span>`
            : isProfile
              ? `<span class="referral-reward-status is-inactive">ההטבה לא פעילה</span>`
              : ""
        }
      </span>
      <button class="primary-button referral-reward-action" data-open-referral-rewards data-referral-context="${context}" type="button" aria-label="${buttonAriaLabel}">
        ${isHome ? shareIcon() : ""}
        <span>${buttonLabel}</span>
      </button>
    </section>
  `;
}

function handleReferralAction(event) {
  if (!(event.target instanceof Element)) return;
  const openButton = event.target.closest("[data-open-referral-rewards]");
  if (openButton) {
    event.preventDefault();
    event.stopPropagation();
    openReferralDialog(openButton);
    return;
  }

  const actionButton = event.target.closest("[data-referral-action]");
  if (!actionButton) return;
  event.preventDefault();
  event.stopPropagation();

  const action = actionButton.dataset.referralAction;
  if (referralBusy && ["copy", "share"].includes(action)) return;
  if (action === "close") {
    closeReferralDialog();
  } else if (action === "copy") {
    copyReferralLink();
  } else if (action === "share") {
    shareReferralLink();
  } else if (action === "retry") {
    referralError = "";
    renderReferralDialog();
    refreshReferralStatus({ force: true });
  } else if (action === "profile") {
    const profileButton = document.querySelector('[data-action="edit-profile"]');
    closeReferralDialog();
    window.setTimeout(() => profileButton?.click(), 260);
  }
}

function openReferralDialog(trigger) {
  if (referralDialogOpen) return;
  dialogReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
  dialogReturnContext = String(trigger?.dataset?.referralContext ?? "");
  referralDialogOpen = true;
  document.body.classList.add("referral-dialog-open");
  setReferralBackgroundInert(true);
  renderReferralDialog();
  refreshReferralStatus();
  window.history.pushState(
    { ...(window.history.state ?? {}), referralRewards: true },
    "",
    window.location.href
  );
  requestAnimationFrame(() => {
    document.querySelector(`#${DIALOG_ID} [data-referral-action="close"]`)?.focus();
  });
}

function closeReferralDialog({ fromHistory = false } = {}) {
  if (!referralDialogOpen) return;
  if (!fromHistory && window.history.state?.referralRewards) {
    window.history.back();
    return;
  }

  referralDialogOpen = false;
  referralBusy = false;
  document.body.classList.remove("referral-dialog-open");
  setReferralBackgroundInert(false);
  document.getElementById(DIALOG_ID)?.remove();
  window.setTimeout(() => {
    const fallbackSelector = dialogReturnContext
      ? `[data-open-referral-rewards][data-referral-context="${dialogReturnContext}"]`
      : "[data-open-referral-rewards]";
    const focusTarget = dialogReturnFocus?.isConnected
      ? dialogReturnFocus
      : document.querySelector(fallbackSelector);
    focusTarget?.focus?.({ preventScroll: true });
  }, 220);
}

function handleReferralHistory() {
  if (referralDialogOpen && !window.history.state?.referralRewards) {
    closeReferralDialog({ fromHistory: true });
  }
}

function handleNativeBack(event) {
  if (!referralDialogOpen) return;
  event.preventDefault();
  closeReferralDialog();
}

function handleReferralKeydown(event) {
  if (!referralDialogOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeReferralDialog();
    return;
  }
  if (event.key === "Tab") trapReferralDialogFocus(event);
}

function renderReferralDialog() {
  const previousAction = document.activeElement?.closest?.("[data-referral-action]")
    ?.dataset?.referralAction;
  document.getElementById(DIALOG_ID)?.remove();
  const dialog = document.createElement("section");
  dialog.id = DIALOG_ID;
  dialog.className = "referral-dialog-backdrop font-hebrew";
  dialog.tabIndex = -1;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "referral-dialog-title");
  dialog.innerHTML = referralDialogMarkup();
  document.body.append(dialog);
  setReferralBackgroundInert(true);
  if (previousAction) {
    requestAnimationFrame(() => {
      const nextAction = dialog.querySelector(
        `[data-referral-action="${previousAction}"]:not(:disabled)`
      );
      (nextAction ?? dialog).focus({ preventScroll: true });
    });
  }
}

function setReferralBackgroundInert(value) {
  const app = document.querySelector("#app");
  if (!app) return;
  if (value) {
    app.setAttribute("inert", "");
  } else {
    app.removeAttribute("inert");
  }
}

function trapReferralDialogFocus(event) {
  const dialog = document.getElementById(DIALOG_ID);
  if (!dialog) return;
  const focusable = Array.from(
    dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  } else if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function referralDialogMarkup() {
  const progress = referralAnnualProgress(referralStatus);
  const inviteUrl = buildReferralInviteUrl(
    runtimeConfig?.publicUrl || window.location.origin,
    referralStatus.referralCode
  );
  const active = isAdFreeActive(referralStatus);
  const loading = referralStatus.status === "loading";
  const signedOut = referralStatus.status === "signed-out";
  const blockingError = Boolean(referralError && !referralStatus.referralCode);

  return `
    <div class="referral-dialog-shell">
      <header class="referral-dialog-header">
        <button
          class="referral-close-button"
          data-referral-action="close"
          type="button"
          aria-label="סגירת מסך הזמנת חברים"
        >${closeIcon()}</button>
        <span class="referral-dialog-mark" aria-hidden="true">${giftIcon()}</span>
        <span>
          <small>הטבה לחברים</small>
          <h2 id="referral-dialog-title">מזמינים חברים. סוגרים בלי פרסומות.</h2>
        </span>
      </header>

      <div class="referral-dialog-content">
        ${
          loading
            ? referralLoadingMarkup()
            : signedOut
              ? `
                <div class="referral-state-message is-signin">
                  <strong>הקישור האישי מחכה לך</strong>
                  <span>מתחברים לחשבון כדי להזמין חברים ולשמור את החודש ללא פרסומות.</span>
                  <button class="primary-button" data-referral-action="profile" type="button">לפרופיל ולהתחברות</button>
                </div>
              `
              : blockingError
                ? `
                  <div class="referral-state-message is-error" role="status">
                    <span>${referralError}</span>
                    <button class="secondary-button" data-referral-action="retry" type="button">נסה שוב</button>
                  </div>
                `
                : `
                  ${
                    referralError
                      ? `
                        <div class="referral-state-message is-stale" role="status">
                          <span>${referralError}</span>
                          <button class="secondary-button" data-referral-action="retry" type="button">רענון</button>
                        </div>
                      `
                      : ""
                  }
                  <section class="referral-benefit-card">
                    <span class="referral-benefit-label">${active ? "ההטבה שלך פעילה" : "התגמול שלך"}</span>
                    <strong><span class="font-num">${referralStatus.rewardDays}</span> ימים ללא פרסומות</strong>
                    <p>על כל חבר חדש שנרשם מהקישור ומשלים פעולה אמיתית באירוע.</p>
                    ${
                      active
                        ? `<span class="referral-active-until">פעיל עד ${formatDate(referralStatus.adFreeUntil)}</span>`
                        : ""
                    }
                  </section>

                  <section class="referral-share-section" aria-labelledby="referral-share-title">
                    <span>
                      <h3 id="referral-share-title">הקישור האישי שלך</h3>
                      <p>הקישור גם שולח בקשת חברות, בלי לחשוף כתובת מייל.</p>
                    </span>
                    <label class="referral-link-field">
                      <span class="visually-hidden">קישור הפניה אישי</span>
                      <input value="${escapeAttribute(inviteUrl)}" readonly dir="ltr" />
                    </label>
                    <div class="referral-share-actions">
                      <button class="primary-button" data-referral-action="share" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                        ${shareIcon()}
                        <span>שתף הזמנה</span>
                      </button>
                      <button class="secondary-button" data-referral-action="copy" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                        ${copyIcon()}
                        <span>העתק קישור</span>
                      </button>
                    </div>
                    ${referralNotice ? `<p class="referral-notice" role="status">${referralNotice}</p>` : ""}
                  </section>

                  <section class="referral-progress-section" aria-labelledby="referral-progress-title">
                    <div class="referral-progress-heading">
                      <span>
                        <h3 id="referral-progress-title">ההתקדמות שלך השנה</h3>
                        <p>${progress.rewarded} חברים השלימו שימוש${referralStatus.pendingReferrals ? ` · ${referralStatus.pendingReferrals} בדרך` : ""}</p>
                      </span>
                      <strong><span class="font-num">${referralStatus.daysEarned}</span> ימים</strong>
                    </div>
                    <div
                      class="referral-progress-track"
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax="${progress.limit}"
                      aria-valuenow="${progress.rewarded}"
                      aria-label="מספר ההטבות שנצברו השנה"
                    >
                      <span style="width:${progress.percentage}%"></span>
                    </div>
                    <small>${progress.remaining} הטבות נוספות זמינות ב-12 החודשים הקרובים.</small>
                  </section>

                  <ol class="referral-steps">
                    <li><span>1</span><strong>משתפים את הקישור</strong></li>
                    <li><span>2</span><strong>החבר נרשם ומאמת מייל</strong></li>
                    <li><span>3</span><strong>הוא משתמש באירוע אמיתי</strong></li>
                  </ol>
                `
        }
      </div>
    </div>
  `;
}

async function copyReferralLink() {
  const inviteUrl = buildReferralInviteUrl(
    runtimeConfig?.publicUrl || window.location.origin,
    referralStatus.referralCode
  );
  if (!inviteUrl || referralBusy) return;
  referralBusy = true;
  referralNotice = "";
  renderReferralDialog();
  try {
    await navigator.clipboard.writeText(inviteUrl);
    referralNotice = "הקישור הועתק.";
  } catch {
    referralNotice = "לא הצלחנו להעתיק אוטומטית. אפשר לסמן ולהעתיק את הקישור.";
  } finally {
    referralBusy = false;
    if (referralDialogOpen) renderReferralDialog();
  }
}

async function shareReferralLink() {
  const inviteUrl = buildReferralInviteUrl(
    runtimeConfig?.publicUrl || window.location.origin,
    referralStatus.referralCode
  );
  if (!inviteUrl || referralBusy) return;

  const shareData = {
    title: "סוגרים חשבון",
    text: "מצטרפים אליי לסוגרים חשבון? אחרי ההרשמה נוכל לנהל יחד הוצאות ואירועים.",
    url: inviteUrl,
    dialogTitle: "הזמנת חברים"
  };

  referralBusy = true;
  referralNotice = "";
  renderReferralDialog();
  try {
    if (globalThis.SogrimNative?.share) {
      await globalThis.SogrimNative.share(shareData);
    } else if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      referralNotice = "הקישור הועתק.";
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      referralNotice = "לא הצלחנו לפתוח את השיתוף. אפשר להעתיק את הקישור.";
    }
  } finally {
    referralBusy = false;
    if (referralDialogOpen) renderReferralDialog();
  }
}

function friendlyClaimMessage(error) {
  const message = String(error?.message ?? "");
  if (/new accounts only/i.test(message)) {
    return "הקישור נשמר כחברות, אבל הטבת ההזמנה מיועדת לחשבונות חדשים.";
  }
  if (/refer yourself/i.test(message)) {
    return "אי אפשר לקבל תגמול מהקישור האישי של עצמך.";
  }
  if (/already has a referral/i.test(message)) {
    return "כבר נשמרה הזמנה אחרת בחשבון הזה.";
  }
  return "";
}

function isTerminalReferralClaimError(error) {
  return /new accounts only|refer yourself|already has a referral/i.test(
    String(error?.message ?? "")
  );
}

function referralLoadingMarkup() {
  return `
    <div class="referral-loading" aria-label="טוענים את מצב ההטבה">
      <span></span><span></span><span></span>
    </div>
  `;
}

function formatDate(value) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function giftIcon() {
  return iconSvg("gift");
}

function shareIcon() {
  return iconSvg("share");
}

function copyIcon() {
  return iconSvg("copy");
}

function closeIcon() {
  return iconSvg("x");
}

function injectReferralStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .referral-entry-button {
      gap: 8px;
    }

    .referral-entry-button svg,
    .referral-reward-icon svg,
    .referral-dialog-mark svg,
    .referral-share-actions svg,
    .referral-close-button svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .referral-reward-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      margin-block-end: 22px;
      padding: 18px;
      border: 1px solid rgba(9, 77, 63, 0.1);
      border-radius: 24px;
      background: #f8fcfb;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.9) inset,
        0 16px 38px rgba(16, 77, 62, 0.1);
    }

    .referral-reward-card.is-home {
      position: relative;
      overflow: hidden;
      isolation: isolate;
      border-color: rgba(12, 83, 69, 0.12);
    }

    .referral-reward-card.is-home::before {
      content: "";
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      width: 4px;
      background: #1aa896;
    }

    .referral-reward-card.is-home:hover {
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.95) inset,
        0 20px 46px rgba(16, 77, 62, 0.14);
    }

    .referral-reward-card.is-profile {
      margin: 4px 0 0;
      padding: 18px 0;
      border: 0;
      border-block: 1px solid rgba(9, 77, 63, 0.1);
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .referral-reward-card.is-profile .referral-reward-icon {
      width: 46px;
      height: 46px;
      border-radius: 14px;
    }

    .referral-reward-icon {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border-radius: 16px;
      color: #fff;
      background: #0b584a;
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.18) inset,
        0 10px 22px rgba(9, 76, 62, 0.18);
    }

    .referral-reward-copy {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .referral-reward-copy strong {
      color: #102c25;
      font-size: 1.12rem;
      font-weight: 900;
      line-height: 1.22;
    }

    .referral-reward-eyebrow {
      color: #0b7b68;
      font-size: 0.76rem;
      font-weight: 850;
      line-height: 1.25;
    }

    .referral-reward-detail {
      color: #61736e;
      font-size: 0.86rem;
      line-height: 1.4;
    }

    .referral-reward-status {
      width: fit-content;
      margin-block-start: 5px;
      padding: 5px 9px;
      border-radius: 999px;
      color: #075b4c;
      background: #ddf3ed;
      font-size: 0.76rem;
      font-weight: 850;
      line-height: 1.2;
    }

    .referral-reward-status.is-inactive {
      color: #5e6d69;
      background: #edf2f0;
    }

    .referral-reward-action.primary-button {
      min-width: 142px;
      min-height: 48px;
      gap: 8px;
      border: 0;
      border-radius: 14px;
      color: #fff !important;
      background: #0b584a;
      box-shadow: 0 10px 22px rgba(8, 75, 61, 0.18);
      transition-property: transform, box-shadow, background-color;
      transition-duration: 180ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .referral-reward-action.primary-button:hover:not(:disabled) {
      background: #094c40;
      box-shadow: 0 13px 26px rgba(8, 75, 61, 0.22);
    }

    .referral-reward-action.primary-button:active:not(:disabled) {
      transform: scale(0.96);
    }

    .referral-reward-action svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    body.referral-dialog-open {
      overflow: hidden;
    }

    .referral-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(10, 26, 22, 0.5);
      backdrop-filter: blur(10px);
      animation: referral-fade-in 180ms ease-out both;
    }

    .referral-dialog-shell {
      width: min(100%, 620px);
      max-height: min(88dvh, 820px);
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 24px;
      background: #f7faf9;
      box-shadow: 0 30px 90px rgba(8, 44, 35, 0.28);
      animation: referral-rise-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .referral-dialog-header {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      padding: 28px 28px 24px 72px;
      color: #fff;
      background:
        linear-gradient(135deg, rgba(33, 189, 173, 0.12), transparent 48%),
        #0a4f40;
    }

    .referral-dialog-header small {
      display: block;
      margin-block-end: 4px;
      color: #a9ddd2;
      font-weight: 700;
    }

    #public-referral-rewards-dialog .referral-dialog-header h2 {
      max-width: 430px;
      margin: 0;
      color: #fff !important;
      font-size: clamp(1.45rem, 4.8vw, 2rem);
      line-height: 1.15;
      letter-spacing: 0;
    }

    .referral-dialog-mark {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 17px;
      background: rgba(255, 255, 255, 0.1);
    }

    .referral-dialog-mark svg {
      width: 28px;
      height: 28px;
    }

    .referral-close-button {
      position: absolute;
      inset-block-start: 18px;
      inset-inline-end: 18px;
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
    }

    .referral-close-button:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .referral-close-button:focus-visible {
      outline: 3px solid rgba(133, 225, 214, 0.5);
      outline-offset: 2px;
    }

    .referral-dialog-content {
      display: grid;
      gap: 18px;
      padding: 22px;
    }

    .referral-benefit-card,
    .referral-share-section,
    .referral-progress-section {
      border: 1px solid rgba(20, 47, 40, 0.1);
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 10px 28px rgba(12, 57, 47, 0.06);
    }

    .referral-benefit-card {
      display: grid;
      gap: 7px;
      padding: 22px;
    }

    .referral-benefit-label {
      color: #0b806a;
      font-size: 0.8rem;
      font-weight: 800;
    }

    .referral-benefit-card > strong {
      color: #10221e;
      font-size: 1.55rem;
      font-weight: 900;
    }

    .referral-benefit-card p,
    .referral-share-section p,
    .referral-progress-section p {
      margin: 0;
      color: #63736f;
      line-height: 1.5;
    }

    .referral-active-until {
      width: fit-content;
      margin-block-start: 4px;
      padding: 6px 10px;
      border-radius: 999px;
      color: #08604f;
      background: #e2f4ef;
      font-size: 0.82rem;
      font-weight: 800;
    }

    .referral-share-section,
    .referral-progress-section {
      display: grid;
      gap: 14px;
      padding: 18px;
    }

    .referral-share-section h3,
    .referral-progress-section h3 {
      margin: 0 0 3px;
      color: #152722;
      font-size: 1rem;
      font-weight: 800;
    }

    .referral-link-field input {
      width: 100%;
      min-height: 48px;
      padding-inline: 13px;
      border: 1px solid rgba(20, 47, 40, 0.13);
      border-radius: 12px;
      color: #42514e;
      background: #f4f7f6;
      font-family: Inter, Rubik, sans-serif;
      font-size: 0.82rem;
      text-align: left;
    }

    .referral-share-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .referral-share-actions button {
      gap: 8px;
    }

    .referral-notice {
      margin: 0;
      color: #0b6f5a;
      font-size: 0.88rem;
      font-weight: 700;
    }

    .referral-progress-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .referral-progress-heading > strong {
      flex: 0 0 auto;
      color: #0b806a;
      font-weight: 900;
    }

    .referral-progress-track {
      height: 9px;
      overflow: hidden;
      border-radius: 999px;
      background: #e8efed;
    }

    .referral-progress-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: #17a38d;
      transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .referral-progress-section > small {
      color: #7a8985;
    }

    .referral-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .referral-steps li {
      min-width: 0;
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 13px 8px;
      border: 1px solid rgba(20, 47, 40, 0.08);
      border-radius: 14px;
      color: #42514e;
      background: rgba(255, 255, 255, 0.72);
      text-align: center;
    }

    .referral-steps li span {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: #fff;
      background: #0b6f5a;
      font-family: Inter, Rubik, sans-serif;
      font-size: 0.76rem;
      font-weight: 900;
    }

    .referral-steps li strong {
      font-size: 0.78rem;
      line-height: 1.35;
    }

    .referral-state-message {
      display: grid;
      justify-items: start;
      gap: 12px;
      padding: 24px;
      border: 1px solid rgba(20, 47, 40, 0.1);
      border-radius: 18px;
      color: #53635f;
      background: #fff;
    }

    .referral-state-message.is-error {
      color: #803d35;
      border-color: rgba(160, 62, 49, 0.18);
    }

    .referral-state-message.is-stale {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      padding: 12px 14px;
      color: #4c5e59;
      background: #f7faf9;
    }

    .referral-state-message.is-stale .secondary-button {
      min-height: 40px;
      padding-inline: 14px;
    }

    .referral-state-message.is-signin {
      gap: 8px;
    }

    .referral-state-message.is-signin strong {
      color: #173c33;
      font-size: 1.05rem;
    }

    .referral-state-message.is-signin .primary-button {
      width: 100%;
      min-height: 48px;
      margin-block-start: 6px;
    }

    .referral-loading {
      display: grid;
      gap: 12px;
    }

    .referral-loading span {
      height: 90px;
      border-radius: 18px;
      background: linear-gradient(90deg, #edf2f0 20%, #f8faf9 50%, #edf2f0 80%);
      background-size: 220% 100%;
      animation: referral-shimmer 1.3s linear infinite;
    }

    @keyframes referral-fade-in {
      from { opacity: 0; }
    }

    @keyframes referral-rise-in {
      from { opacity: 0; transform: translateY(14px) scale(0.985); }
    }

    @keyframes referral-shimmer {
      to { background-position: -220% 0; }
    }

    @media (max-width: 640px) {
      .referral-dialog-backdrop {
        place-items: stretch;
        padding: 0;
        background: #f7faf9;
      }

      .referral-dialog-shell {
        width: 100%;
        max-height: 100dvh;
        min-height: 100dvh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .referral-dialog-header {
        min-height: 164px;
        padding: calc(24px + env(safe-area-inset-top)) 20px 24px 68px;
      }

      .referral-close-button {
        inset-block-start: calc(18px + env(safe-area-inset-top));
        inset-inline-end: 16px;
      }

      .referral-dialog-content {
        padding: 16px 14px calc(28px + env(safe-area-inset-bottom));
      }

      .referral-reward-card {
        grid-template-columns: auto minmax(0, 1fr);
        gap: 12px;
        padding: 16px;
        border-radius: 22px;
      }

      .referral-reward-card > button {
        grid-column: 1 / -1;
        width: 100%;
      }

      .referral-reward-icon {
        width: 48px;
        height: 48px;
        border-radius: 14px;
      }

      .referral-reward-action.primary-button {
        min-width: 0;
      }

      .referral-share-actions {
        grid-template-columns: 1fr;
      }

      .referral-steps {
        grid-template-columns: 1fr;
      }

      .referral-steps li {
        grid-template-columns: auto 1fr;
        justify-items: start;
        text-align: start;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .referral-dialog-backdrop,
      .referral-dialog-shell,
      .referral-loading span {
        animation: none;
      }

      .referral-progress-track span {
        transition: none;
      }
    }
  `;
  document.head.append(style);
}
