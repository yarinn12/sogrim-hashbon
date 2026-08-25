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
import { createQrSvg } from "./domain/qrCode.mjs";
import { iconSvg } from "./uiIcons.mjs";
import { runtimePublicOrigin } from "./domain/publicOrigin.mjs";

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
      referralStatus = await loadReferralStatusWithAccountRecovery();
      referralError = "";
    } catch {
      referralStatus = {
        ...referralStatus,
        status: "error"
      };
      referralError = referralStatus.referralCode
        ? "לא הצלחנו לעדכן את ספירת ההטבות כרגע. הקישור האישי שלך ממשיך לעבוד."
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

async function loadReferralStatusWithAccountRecovery() {
  runtimeConfig = await loadRuntimeConfig();
  try {
    return await loadReferralProgramStatus(runtimeConfig);
  } catch (error) {
    if (!isReferralSessionError(error)) throw error;

    const expectedUserId = String(
      runtimeConfig?.storage?.account?.userId ?? ""
    ).trim();
    const refreshedSession = await globalThis.SogrimAccountSession?.refresh?.();
    if (!expectedUserId || !refreshedSession?.access_token) throw error;

    const freshConfig = await loadRuntimeConfig();
    const freshUserId = String(
      freshConfig?.storage?.account?.userId ?? ""
    ).trim();
    if (freshUserId !== expectedUserId) throw error;

    runtimeConfig = freshConfig;
    return loadReferralProgramStatus(runtimeConfig);
  }
}

function isReferralSessionError(error) {
  return (
    Number(error?.status) === 401 ||
    String(error?.code ?? "").toUpperCase() === "PGRST301" ||
    /jwt.*(?:expired|invalid)|invalid.*jwt/i.test(String(error?.message ?? ""))
  );
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
  const homeBenefitActions = screen.matches('[data-screen-kind="home"]')
    ? screen.querySelector(":scope > .home-benefit-actions")
    : null;
  if (homeBenefitActions || homeSection) {
    syncReferralRewardCard(screen, "home", () => {
      if (homeBenefitActions) {
        homeBenefitActions.insertAdjacentHTML("afterbegin", referralRewardCard("home"));
      } else {
        homeSection.insertAdjacentHTML("beforebegin", referralRewardCard("home"));
      }
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
  const cardTag = isHome ? "button" : "section";
  const homeActionAttributes = isHome
    ? `data-open-referral-rewards data-referral-context="${context}" type="button" aria-label="${buttonAriaLabel}"`
    : "";
  return `
    <${cardTag} id="referral-reward-card-${context}" class="referral-reward-card is-${context}" data-referral-reward-card data-referral-context="${context}" aria-labelledby="referral-reward-title-${context}" ${homeActionAttributes}>
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
      ${
        isHome
          ? ""
          : `<button class="primary-button referral-reward-action" data-open-referral-rewards data-referral-context="${context}" type="button" aria-label="${buttonAriaLabel}">
              <span>${buttonLabel}</span>
            </button>`
      }
    </${cardTag}>
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
      'button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
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
    runtimePublicOrigin(runtimeConfig),
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
        <span class="referral-dialog-header-copy">
          <small>סוגרים חשבון · הטבת חברים</small>
          <h2 id="referral-dialog-title">המתנה שלך</h2>
          <p class="referral-dialog-lead">חודש שקט מפרסומות, בכל פעם שחבר חדש מצטרף ומשתמש.</p>
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
                  <section class="referral-gift-card" aria-label="המתנה שלך">
                    <section class="referral-benefit-card" aria-labelledby="referral-benefit-title">
                      <span class="referral-benefit-label">${active ? "ההטבה שלך פעילה" : "מתנה על כל חבר שמצטרף"}</span>
                      <strong id="referral-benefit-title"><span class="font-num">${referralStatus.rewardDays}</span><span>ימים בלי פרסומות</span></strong>
                      <p>החבר נרשם, נכנס לאירוע ומשלים פעולה — והחודש נפתח.</p>
                      ${
                        active
                          ? `<span class="referral-active-until">פעיל עד ${formatDate(referralStatus.adFreeUntil)}</span>`
                          : ""
                      }
                    </section>

                    <section class="referral-share-section" aria-labelledby="referral-share-title">
                      <span class="referral-section-heading">
                        <small>הזמנה אישית</small>
                        <h3 id="referral-share-title">נותנים לחבר לסרוק</h3>
                        <p>או שולחים לו את ההזמנה בלחיצה אחת.</p>
                      </span>
                      <div class="referral-share-workspace">
                        ${referralQrMarkup(inviteUrl)}
                        <div class="referral-share-controls">
                          <div class="referral-share-actions">
                            <button class="primary-button" data-referral-action="share" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                              ${shareIcon()}
                              <span>שתף את המתנה</span>
                            </button>
                            <button class="secondary-button" data-referral-action="copy" type="button" ${inviteUrl && !referralBusy ? "" : "disabled"} ${referralBusy ? 'aria-busy="true"' : ""}>
                              ${copyIcon()}
                              <span>העתק</span>
                            </button>
                          </div>
                          <details class="referral-link-details">
                            <summary>הצגת הקישור</summary>
                            <label class="referral-link-field">
                              <span>קישור לשיתוף</span>
                              <input value="${escapeAttribute(inviteUrl)}" readonly dir="ltr" />
                            </label>
                          </details>
                        </div>
                      </div>
                      ${referralNotice ? `<p class="referral-notice" role="status">${referralNotice}</p>` : ""}
                    </section>
                  </section>

                  <details class="referral-more-details">
                    <summary>
                      <span>
                        <strong>איך זה עובד ומה צברתי?</strong>
                        <small>${progress.rewarded} חברים השלימו שימוש · <span class="font-num">${referralStatus.daysEarned}</span> ימים נצברו</small>
                      </span>
                    </summary>
                    <div class="referral-more-details-content">
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
                        <li><span>1</span><strong>משתפים</strong><small>קישור או QR</small></li>
                        <li><span>2</span><strong>החבר מצטרף</strong><small>ונכנס לאירוע</small></li>
                        <li><span>3</span><strong>המתנה נפתחת</strong><small>אחרי שימוש אמיתי</small></li>
                      </ol>
                    </div>
                  </details>
                `
        }
      </div>
    </div>
  `;
}

function referralQrMarkup(inviteUrl) {
  if (!inviteUrl) return "";
  try {
    const qrSvg = createQrSvg(inviteUrl, {
      cellSize: 4,
      quietZone: 3,
      ariaLabel: "QR להזמנת חברים לסוגרים חשבון"
    });
    return `
      <figure class="referral-qr-card" data-referral-qr>
        <div class="referral-qr-code">${qrSvg}</div>
        <figcaption>
          <strong>סריקה מהירה</strong>
          <small>מכוונים את המצלמה לקוד</small>
        </figcaption>
      </figure>
    `;
  } catch {
    return "";
  }
}

async function copyReferralLink() {
  const inviteUrl = buildReferralInviteUrl(
    runtimePublicOrigin(runtimeConfig),
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
    runtimePublicOrigin(runtimeConfig),
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
      width: min(100%, 580px);
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
      gap: 12px;
      min-height: 92px;
      padding: 16px 18px 16px 72px;
      color: #102c25;
      border-block-end: 1px solid rgba(9, 77, 63, 0.08);
      background: rgba(255, 255, 255, 0.94);
    }

    .referral-dialog-header small {
      display: block;
      margin-block-end: 2px;
      color: #0b806a;
      font-size: 0.72rem;
      font-weight: 850;
    }

    .referral-dialog-lead {
      max-width: 44ch;
      margin: 3px 0 0;
      color: #61736e;
      font-size: 0.76rem;
      line-height: 1.4;
    }

    #public-referral-rewards-dialog .referral-dialog-header h2 {
      max-width: 430px;
      margin: 0;
      color: #102c25 !important;
      font-size: clamp(1.24rem, 4.8vw, 1.52rem);
      line-height: 1.12;
      letter-spacing: 0;
    }

    .referral-dialog-mark {
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(9, 77, 63, 0.1);
      border-radius: 14px;
      color: #0b584a;
      background: #e7f4f0;
    }

    .referral-dialog-mark svg {
      width: 24px;
      height: 24px;
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
      border: 1px solid rgba(9, 77, 63, 0.1);
      border-radius: 13px;
      color: #0b584a;
      background: #f0f6f4;
      cursor: pointer;
    }

    .referral-close-button:hover {
      background: #e5f1ed;
    }

    .referral-close-button:focus-visible {
      outline: 3px solid rgba(33, 170, 166, 0.34);
      outline-offset: 2px;
    }

    .referral-dialog-content {
      display: grid;
      grid-auto-rows: max-content;
      gap: 12px;
      padding: 14px;
    }

    .referral-gift-card,
    .referral-more-details,
    .referral-state-message {
      overflow: hidden;
      border: 1px solid rgba(20, 47, 40, 0.08);
      border-radius: 22px;
      background: #fff;
      box-shadow: 0 14px 34px rgba(12, 57, 47, 0.08);
    }

    .referral-gift-card {
      display: grid;
    }

    .referral-benefit-card {
      position: relative;
      display: grid;
      align-content: center;
      gap: 6px;
      min-height: 136px;
      overflow: hidden;
      padding: 20px;
      color: #fff;
      background: linear-gradient(136deg, #071f18 0%, #0b4a38 60%, #0f6b50 100%);
    }

    .referral-benefit-card::after {
      content: "";
      position: absolute;
      width: 124px;
      height: 124px;
      inset-block-start: -68px;
      inset-inline-end: -38px;
      border: 20px solid rgba(33, 170, 166, 0.16);
      border-radius: 50%;
      pointer-events: none;
    }

    .referral-benefit-card > * {
      position: relative;
      z-index: 1;
    }

    .referral-benefit-label {
      color: #9ce2d7;
      font-size: 0.74rem;
      font-weight: 850;
    }

    .referral-benefit-card > strong {
      display: flex;
      align-items: baseline;
      gap: 9px;
      color: #fff;
      font-size: 1.24rem;
      font-weight: 900;
    }

    .referral-benefit-card > strong .font-num {
      font-size: 3.15rem;
      line-height: 0.88;
    }

    .referral-benefit-card p,
    .referral-share-section p,
    .referral-progress-section p {
      margin: 0;
      color: #63736f;
      line-height: 1.5;
    }

    .referral-benefit-card p {
      max-width: 44ch;
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.78rem;
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

    .referral-share-section {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .referral-share-section h3,
    .referral-progress-section h3 {
      margin: 0 0 3px;
      color: #152722;
      font-size: 1rem;
      font-weight: 800;
    }

    .referral-section-heading {
      display: grid;
      gap: 3px;
    }

    .referral-section-heading > small {
      color: #0b806a;
      font-size: 0.72rem;
      font-weight: 850;
    }

    .referral-share-workspace {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      align-items: stretch;
      gap: 16px;
    }

    .referral-share-controls {
      min-width: 0;
      display: grid;
      align-content: center;
      gap: 12px;
    }

    .referral-link-field {
      min-width: 0;
      display: grid;
      gap: 6px;
      padding-block-start: 10px;
    }

    .referral-link-field > span {
      color: #53635f;
      font-size: 0.76rem;
      font-weight: 750;
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
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
    }

    .referral-share-actions button {
      gap: 8px;
      min-height: 48px;
      scale: 1;
      transition-property: background-color, border-color, box-shadow, color, scale;
      transition-duration: 180ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    .referral-share-actions .secondary-button {
      min-width: 104px;
    }

    .referral-share-actions button:active:not(:disabled) {
      scale: 0.96;
    }

    .referral-link-details {
      min-width: 0;
    }

    .referral-link-details summary {
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 0;
      color: #5e706b;
      font-size: 0.76rem;
      font-weight: 750;
      cursor: pointer;
      list-style: none;
    }

    .referral-link-details summary::-webkit-details-marker {
      display: none;
    }

    .referral-link-details summary::after {
      content: "";
      width: 7px;
      height: 7px;
      border-inline-end: 1.5px solid currentColor;
      border-block-end: 1.5px solid currentColor;
      rotate: 45deg;
      transition: rotate 180ms cubic-bezier(0.2, 0, 0, 1);
    }

    .referral-link-details[open] summary::after {
      rotate: 225deg;
    }

    .referral-link-details summary:focus-visible,
    .referral-more-details > summary:focus-visible {
      outline: 3px solid rgba(33, 170, 166, 0.3);
      outline-offset: 3px;
    }

    .referral-qr-card {
      min-width: 0;
      display: grid;
      justify-items: center;
      align-content: start;
      gap: 9px;
      margin: 0;
      padding: 10px;
      border-radius: 14px;
      color: #173c33;
      background: #e8f5f1;
      box-shadow: inset 0 0 0 1px rgba(9, 77, 63, 0.1);
      text-align: center;
    }

    .referral-qr-code {
      width: 100%;
      display: grid;
      place-items: center;
      padding: 6px;
      overflow: hidden;
      border-radius: 8px;
      background: #fff;
    }

    .referral-qr-code svg {
      width: 100%;
      height: auto;
      outline: 1px solid oklch(0 0 0 / 0.1);
      outline-offset: -1px;
    }

    .referral-qr-card figcaption {
      display: grid;
      gap: 2px;
    }

    .referral-qr-card figcaption strong {
      font-size: 0.8rem;
      font-weight: 850;
    }

    .referral-qr-card figcaption small {
      color: #61736e;
      font-size: 0.68rem;
      line-height: 1.35;
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

    .referral-more-details > summary {
      min-height: 64px;
      display: flex;
      align-items: center;
      padding: 12px 16px;
      color: #173c33;
      background: #fff;
      cursor: pointer;
      list-style: none;
    }

    .referral-more-details > summary::-webkit-details-marker {
      display: none;
    }

    .referral-more-details > summary::after {
      content: "+";
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      margin-inline-start: auto;
      border-radius: 10px;
      color: #0b6f5a;
      background: #e7f4f0;
      font-family: Inter, Rubik, sans-serif;
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1;
    }

    .referral-more-details[open] > summary::after {
      content: "−";
    }

    .referral-more-details > summary > span {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .referral-more-details > summary strong {
      font-size: 0.9rem;
      font-weight: 850;
    }

    .referral-more-details > summary small {
      color: #6d7c78;
      font-size: 0.74rem;
    }

    .referral-more-details-content {
      display: grid;
      gap: 14px;
      padding: 0 14px 14px;
      border-block-start: 1px solid rgba(20, 47, 40, 0.08);
      background: #fbfdfc;
    }

    .referral-progress-section {
      display: grid;
      gap: 12px;
      padding: 16px 2px 2px;
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

    .referral-steps li small {
      color: #74837f;
      font-size: 0.68rem;
      line-height: 1.3;
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
        min-height: calc(90px + env(safe-area-inset-top));
        padding: calc(12px + env(safe-area-inset-top)) 16px 12px 66px;
      }

      .referral-close-button {
        inset-block-start: calc(14px + env(safe-area-inset-top));
        inset-inline-end: 14px;
      }

      .referral-dialog-content {
        gap: 10px;
        padding: 10px 12px calc(22px + env(safe-area-inset-bottom));
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
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .referral-share-workspace {
        grid-template-columns: minmax(0, 1fr);
      }

      .referral-qr-card {
        width: min(100%, 176px);
        justify-self: center;
      }

      .referral-benefit-card {
        min-height: 128px;
        padding: 18px;
      }

      .referral-share-section {
        gap: 12px;
        padding: 14px;
      }

      .referral-share-controls {
        grid-row: 1;
        gap: 8px;
      }

      .referral-qr-card {
        grid-row: 2;
      }

      .referral-link-details summary {
        margin-inline: auto;
      }

      .referral-steps {
        grid-template-columns: 1fr;
      }

      .referral-steps li {
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto;
        align-items: center;
        justify-items: start;
        text-align: start;
      }

      .referral-steps li > span {
        grid-row: 1 / 3;
      }

      .referral-steps li > :is(strong, small) {
        grid-column: 2;
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
