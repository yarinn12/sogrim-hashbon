import {
  ACCOUNT_RETURN_URL_STORAGE_KEY,
  accountAuthErrorMessage,
  appleOAuthUrl,
  authCallbackType,
  accountProfileFromUser,
  clearAccountSession,
  deleteAccount,
  ensureAccountWorkspace,
  googleOAuthUrl,
  loadAccountUser,
  loadStoredAccountSession,
  refreshAccountSession,
  requestPasswordReset,
  saveAccountSession,
  sessionFromOAuthHash,
  signInWithPassword,
  signOutAccount,
  signUpWithPassword,
  updateAccountPassword
} from "./data/accountAuth.mjs";
import {
  clearLocalAccountData,
  loadLocalProfile,
  loadRuntimeConfig,
  loadSharedState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import {
  clearPendingInviteUrl,
  pendingInviteUrl,
  rememberPendingInviteUrl
} from "./data/pendingInvite.mjs";
import {
  mergeInviteSnapshotIntoState,
  parseInviteEventId,
  parseInviteSnapshot
} from "./domain/inviteLinks.mjs";
import { parseInviteSpaceId, parseInviteSpaceKey } from "./domain/cloudSpace.mjs";
import {
  mergeSharedEventIntoState,
  readSharedEventState
} from "./data/sharedEventStore.mjs";
import {
  ensureNamedParticipant,
  isFullProfileName,
  normalizeProfileName
} from "./domain/userProfile.mjs";

const GATE_ID = "public-account-auth-gate";
const STYLE_ID = "public-account-auth-style";
const AUTH_CHANGED_MARKER = "settle-friends-account-ready";
const ACCOUNT_DELETED_MARKER = "settle-friends-account-deleted";

let runtimeConfig = null;
let accountSession = null;
let googleEnabled = false;
let appleEnabled = false;
let authBusy = false;
let emailAuthExpanded = false;
let accountDeleteReturnFocus = null;

rememberPendingInviteUrl();
injectStyle();
document.documentElement.classList.add("account-auth-locked");
renderAccountBootGate();
setupAccountAuth().catch(() => {
  if (runtimeConfig?.storage?.mode === "supabase") {
    clearAccountSession();
    accountSession = null;
    renderAccountGate({
      error: "לא הצלחנו להתחבר לשירות החשבון כרגע. כדאי לבדוק את החיבור ולנסות שוב."
    });
    return;
  }
  unlockAccountGate();
});
document.addEventListener("click", handleAccountClick);
document.addEventListener("change", handleAccountChange);
document.addEventListener("keydown", handleAccountDeletionKeydown);

async function setupAccountAuth() {
  runtimeConfig = await loadRuntimeConfig();
  if (runtimeConfig.storage?.mode !== "supabase") {
    unlockAccountGate();
    return;
  }

  const callbackType = authCallbackType(window.location.hash);
  const callbackSession = sessionFromOAuthHash(window.location.hash);
  if (callbackSession) {
    accountSession = saveAccountSession(callbackSession);
    cleanAuthHash();
  } else {
    accountSession = loadStoredAccountSession();
  }

  if (accountSession) {
    try {
      accountSession = await restoreAccountSession(accountSession);
      if (callbackType === "recovery") {
        renderPasswordResetGate();
        return;
      }
      await connectAccountToApp(accountSession, {
        forceReload: Boolean(callbackSession) || !sessionValue(AUTH_CHANGED_MARKER)
      });
      watchAccountControls();
      enhanceAccountControls();
      return;
    } catch (error) {
      if (canResumeOffline(accountSession, error)) {
        await connectAccountToApp(accountSession);
        watchAccountControls();
        enhanceAccountControls();
        return;
      }
      clearAccountSession();
      accountSession = null;
    }
  }

  removeSessionValue(AUTH_CHANGED_MARKER);
  const accountDeleted = sessionValue(ACCOUNT_DELETED_MARKER) === "1";
  removeSessionValue(ACCOUNT_DELETED_MARKER);
  [googleEnabled, appleEnabled] = await Promise.all([
    providerEnabled("google"),
    providerEnabled("apple")
  ]);
  emailAuthExpanded = !googleEnabled && !appleEnabled;
  renderAccountGate({
    message: accountDeleted ? "החשבון והמידע האישי שלך נמחקו." : ""
  });
}

async function restoreAccountSession(session) {
  let nextSession = session;
  if (isExpiring(session)) {
    nextSession = await refreshAccountSession(runtimeConfig, session);
  }
  if (!nextSession?.user) {
    const user = await loadAccountUser(runtimeConfig, nextSession);
    nextSession = { ...nextSession, user };
  }
  nextSession = await ensureAccountWorkspace(runtimeConfig, nextSession);
  return saveAccountSession(nextSession);
}

async function connectAccountToApp(session, { forceReload = false } = {}) {
  const accountProfile = accountProfileFromUser(session.user);
  const previousProfile = loadLocalProfile();
  const displayName = normalizeProfileName(
    accountProfile?.displayName || previousProfile?.displayName
  );
  if (!accountProfile || !isFullProfileName(displayName)) {
    throw new Error("Account profile needs a full name");
  }

  const inviteUrl = pendingInviteUrl(window.location.href);
  const invitedEventId = parseInviteEventId(inviteUrl);
  const inviteSnapshot = parseInviteSnapshot(inviteUrl);
  let sharedState = mergeInviteSnapshotIntoState(
    await loadSharedState(),
    inviteSnapshot
  );
  const inviteSpaceId = parseInviteSpaceId(inviteUrl);
  const inviteSpaceKey = parseInviteSpaceKey(inviteUrl);
  if (invitedEventId && inviteSpaceId && inviteSpaceKey) {
    try {
      const remoteEvent = await readSharedEventState(
        runtimeConfig,
        { id: inviteSpaceId, key: inviteSpaceKey },
        invitedEventId
      );
      if (remoteEvent) {
        sharedState = mergeSharedEventIntoState(
          sharedState,
          remoteEvent,
          { id: inviteSpaceId, key: inviteSpaceKey }
        );
      }
    } catch {
      // A copied invite still carries a safe event preview for temporary network failures.
    }
  }
  const nextState = ensureNamedParticipant(
    sharedState,
    {
      id: accountProfile.participantId,
      displayName,
      authProvider: accountProfile.authProvider,
      authSubject: accountProfile.authSubject,
      email: accountProfile.email
    },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? displayName,
    authProvider: accountProfile.authProvider,
    authSubject: accountProfile.authSubject,
    email: accountProfile.email
  });
  await saveSharedState(nextState);
  const invitedEventWasDeleted = nextState.deletedEvents?.some(
    (item) => item.id === invitedEventId
  );
  if (
    !invitedEventId ||
    invitedEventWasDeleted ||
    nextState.events.some((event) => event.id === invitedEventId)
  ) {
    clearPendingInviteUrl();
  }
  document.getElementById(GATE_ID)?.remove();
  document.querySelector(".public-profile-gate")?.remove();
  document.documentElement.classList.remove("account-auth-locked");
  document.querySelector("#app")?.removeAttribute("inert");

  const profileChanged =
    previousProfile?.authSubject !== accountProfile.authSubject ||
    previousProfile?.authProvider !== accountProfile.authProvider;
  if (forceReload || profileChanged) {
    setSessionValue(AUTH_CHANGED_MARKER, "1");
    window.location.reload();
  }
}

function renderAccountBootGate() {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate account-auth-boot";
  gate.setAttribute("role", "main");
  gate.setAttribute("aria-busy", "true");
  gate.setAttribute("aria-label", "טוען את החשבון");
  gate.innerHTML = `
    <div class="account-auth-boot-card">
      <span class="account-auth-mark" aria-hidden="true"><img src="./brand-mark-v3.png" alt="" width="50" height="50" /></span>
      <strong>סוגרים חשבון</strong>
      <span class="account-auth-loader" aria-hidden="true"></span>
    </div>
  `;
  document.body.append(gate);
}

function unlockAccountGate() {
  document.getElementById(GATE_ID)?.remove();
  document.documentElement.classList.remove("account-auth-locked");
  document.querySelector("#app")?.removeAttribute("inert");
}

function renderAccountGate({
  mode = "login",
  message = "",
  error = "",
  values = {}
} = {}) {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const previousProfile = loadLocalProfile();
  const inviteMarkup = accountInviteMarkup();
  const providerAvailable = googleEnabled || appleEnabled;
  const showEmailAuth =
    emailAuthExpanded ||
    !providerAvailable ||
    mode === "signup" ||
    Boolean(message) ||
    Boolean(error);
  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./brand-mark-v3.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>כל החשבונות שלך, בכל מכשיר</h1>
          <p>האירועים, הקבוצות וההוצאות נשמרים בחשבון האישי שלך ומחכים לך גם בטלפון הבא.</p>
        </div>
        <ul>
          <li>היסטוריה אישית שנשמרת בענן</li>
          <li>כניסה מאובטחת ושמירת מידע בענן</li>
          <li>קישורי הצטרפות ממשיכים לעבוד כרגיל</li>
        </ul>
      </section>

      <section class="account-auth-form-panel">
        <div class="account-auth-logo-lockup" role="img" aria-label="סוגרים חשבון - ניהול הוצאות משותפות">
          <img src="./sogrim-logo-lockup.png" alt="" width="967" height="417" />
        </div>
        ${inviteMarkup}
        <div class="account-auth-heading">
          <h2>${mode === "signup" ? "יוצרים חשבון אישי" : "נכנסים וממשיכים"}</h2>
          <p>${mode === "signup" ? "המידע שכבר נמצא במכשיר יחובר לחשבון החדש." : "האירועים וההוצאות שלך מחכים בדיוק במקום שבו עצרת."}</p>
        </div>

        <div class="account-google-slot" data-google-auth-slot>
          ${providerOptionsMarkup()}
        </div>

        ${
          providerAvailable && mode === "login"
            ? `<button
                class="account-email-toggle"
                type="button"
                data-account-action="toggle-email"
                aria-expanded="${showEmailAuth}"
                aria-controls="account-email-auth"
              >${showEmailAuth ? "הסתר כניסה עם אימייל" : "כניסה עם אימייל"}</button>`
            : ""
        }

        <div id="account-email-auth" class="account-email-auth" ${showEmailAuth ? "" : "hidden"}>
          <div class="account-auth-tabs" role="tablist" aria-label="כניסה או הרשמה">
            <button type="button" role="tab" data-account-mode="login" aria-selected="${mode === "login"}" class="${mode === "login" ? "is-active" : ""}">התחברות</button>
            <button type="button" role="tab" data-account-mode="signup" aria-selected="${mode === "signup"}" class="${mode === "signup" ? "is-active" : ""}">הרשמה</button>
          </div>

          <form class="account-auth-form" data-account-form data-mode="${mode}">
            ${
              mode === "signup"
                ? `<label>
                    <span>שם פרטי ושם משפחה</span>
                    <input name="displayName" autocomplete="name" value="${escapeAttribute(values.displayName ?? previousProfile?.displayName ?? "")}" required />
                  </label>`
                : ""
            }
            <label>
              <span>אימייל</span>
              <input name="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" value="${escapeAttribute(values.email ?? "")}" required />
            </label>
            <label>
              <span>סיסמה</span>
              <input name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" required />
            </label>
            ${
              mode === "login"
                ? `<button class="account-forgot-button" type="button" data-account-action="forgot-password">שכחתי סיסמה</button>`
                : ""
            }
            ${message ? `<p class="account-auth-message" role="status">${escapeHtml(message)}</p>` : ""}
            ${error ? `<p class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
            <button class="primary-button account-auth-submit" type="submit">
              ${mode === "signup" ? "צור חשבון" : "התחבר"}
            </button>
          </form>
        </div>
        <p class="account-auth-legal">בהמשך השימוש אתה מאשר את <a href="./terms.html">תנאי השימוש</a> ואת <a href="./privacy.html">מדיניות הפרטיות</a>.</p>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("form")?.addEventListener("submit", handleAccountSubmit);
  if (showEmailAuth) focusAccountInputOnDesktop(gate);
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  if (authBusy) return;

  const form = event.currentTarget;
  const mode = form.dataset.mode ?? "login";
  const values = new FormData(form);
  const email = String(values.get("email") ?? "").trim().toLowerCase();
  const password = String(values.get("password") ?? "");

  setAuthBusy(true);
  try {
    if (mode === "reset-password") {
      const confirmation = String(values.get("passwordConfirmation") ?? "");
      if (password.length < 8 || password !== confirmation) {
        throw new Error("password confirmation");
      }
      accountSession = saveAccountSession(
        await updateAccountPassword(runtimeConfig, accountSession, password)
      );
    } else if (mode === "signup") {
      const displayName = normalizeProfileName(values.get("displayName"));
      if (!isFullProfileName(displayName)) {
        throw new Error("full name required");
      }
      rememberAccountReturnUrl();
      const result = await signUpWithPassword(runtimeConfig, {
        email,
        password,
        displayName,
        redirectTo: authRedirectUrl()
      });
      if (!result.session) {
        renderAccountGate({
          mode: "login",
          message: "שלחנו אליך קישור לאישור המייל. אחרי האישור אפשר להתחבר.",
          values: { email }
        });
        return;
      }
      accountSession = saveAccountSession(result.session);
    } else {
      accountSession = saveAccountSession(
        await signInWithPassword(runtimeConfig, { email, password })
      );
    }

    accountSession = await restoreAccountSession(accountSession);
    await connectAccountToApp(accountSession, { forceReload: true });
  } catch (error) {
    const fullNameError = String(error?.message ?? "").includes("full name");
    const confirmationError = String(error?.message ?? "").includes("password confirmation");
    if (mode === "reset-password") {
      renderPasswordResetGate(
        confirmationError
          ? "הסיסמאות אינן זהות או קצרות מדי."
          : accountAuthErrorMessage(error)
      );
      return;
    }
    renderAccountGate({
      mode,
      values: {
        email,
        displayName: String(values.get("displayName") ?? "")
      },
      error: fullNameError
        ? "צריך להזין שם פרטי ושם משפחה."
        : confirmationError
          ? "הסיסמאות אינן זהות או קצרות מדי."
        : accountAuthErrorMessage(error, mode)
    });
  } finally {
    setAuthBusy(false);
  }
}

async function handleAccountClick(event) {
  const modeButton = event.target.closest("[data-account-mode]");
  if (modeButton) {
    emailAuthExpanded = true;
    renderAccountGate({
      mode: modeButton.dataset.accountMode,
      values: {
        email: document.querySelector('[data-account-form] input[name="email"]')?.value ?? "",
        displayName: document.querySelector('[data-account-form] input[name="displayName"]')?.value ?? ""
      }
    });
    return;
  }

  const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
  if (action === "toggle-email") {
    const currentForm = document.querySelector("[data-account-form]");
    const mode = currentForm?.dataset.mode ?? "login";
    const values = {
      email: currentForm?.querySelector('input[name="email"]')?.value ?? "",
      displayName: currentForm?.querySelector('input[name="displayName"]')?.value ?? ""
    };
    emailAuthExpanded = !emailAuthExpanded;
    renderAccountGate({ mode, values });
    return;
  }

  if (action === "google") {
    rememberAccountReturnUrl();
    await openOAuthUrl(googleOAuthUrl(runtimeConfig, authRedirectUrl()));
    return;
  }

  if (action === "apple") {
    rememberAccountReturnUrl();
    await openOAuthUrl(appleOAuthUrl(runtimeConfig, authRedirectUrl()));
    return;
  }

  if (action === "forgot-password") {
    const email = String(
      document.querySelector('[data-account-form] input[name="email"]')?.value ?? ""
    ).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      renderAccountGate({
        mode: "login",
        error: "צריך להזין אימייל כדי לשלוח קישור לאיפוס הסיסמה.",
        values: { email }
      });
      return;
    }
    setAuthBusy(true);
    try {
      rememberAccountReturnUrl();
      await requestPasswordReset(runtimeConfig, email, authRedirectUrl());
      renderAccountGate({
        mode: "login",
        message: "שלחנו קישור לאיפוס הסיסמה. כדאי לבדוק גם בתיקיית הספאם.",
        values: { email }
      });
    } catch (error) {
      renderAccountGate({
        mode: "login",
        error: accountAuthErrorMessage(error),
        values: { email }
      });
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (action === "signout") {
    const button = event.target.closest("[data-account-action]");
    button.disabled = true;
    clearLocalAccountData();
    await signOutAccount(runtimeConfig, accountSession);
    removeSessionValue(AUTH_CHANGED_MARKER);
    window.location.reload();
    return;
  }

  if (action === "delete-account-open") {
    renderAccountDeletionDialog();
    return;
  }

  if (action === "delete-account-cancel") {
    closeAccountDeletionDialog();
    return;
  }

  if (action === "delete-account-confirm") {
    const confirmation = document.querySelector("[data-account-delete-confirmation]");
    if (!confirmation?.checked || authBusy) return;
    const button = event.target.closest("[data-account-action]");
    setAccountDeletionBusy(true);
    try {
      await deleteAccount(runtimeConfig, accountSession);
      clearLocalAccountData();
      clearAccountSession();
      removeSessionValue(AUTH_CHANGED_MARKER);
      setSessionValue(ACCOUNT_DELETED_MARKER, "1");
      window.location.replace("/");
    } catch {
      const error = document.querySelector("[data-account-delete-error]");
      if (error) {
        error.hidden = false;
        error.textContent = "לא הצלחנו להשלים את המחיקה כרגע. אפשר לנסות שוב או לפנות לתמיכה.";
      }
      if (button) button.disabled = false;
      setAccountDeletionBusy(false);
    }
  }
}

function handleAccountChange(event) {
  if (!event.target.matches("[data-account-delete-confirmation]")) return;
  const button = document.querySelector('[data-account-action="delete-account-confirm"]');
  if (button) button.disabled = !event.target.checked;
}

function enhanceAccountControls() {
  if (!accountSession?.user) return;
  const host =
    document.querySelector(".profile-summary") ??
    document.querySelector(".public-profile-card") ??
    document.querySelector(".profile-setup-panel");
  if (!host || host.querySelector("[data-account-controls]")) return;

  const email = String(accountSession.user.email ?? "").trim();
  host.insertAdjacentHTML(
    "beforeend",
    `<div class="account-profile-controls" data-account-controls>
      <span>${escapeHtml(email)}</span>
      <nav class="account-data-links" aria-label="מידע על החשבון">
        <a href="./account-deletion" class="account-data-link">פרטיות ומחיקה</a>
        <a href="./support" class="account-data-link">תמיכה</a>
      </nav>
      <div class="account-profile-actions">
        <button class="secondary-button" type="button" data-account-action="signout">התנתק</button>
        <button class="secondary-button account-delete-button" type="button" data-account-action="delete-account-open">מחק חשבון</button>
      </div>
    </div>`
  );
}

function renderAccountDeletionDialog() {
  closeAccountDeletionDialog();
  accountDeleteReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const dialog = document.createElement("section");
  dialog.className = "account-delete-backdrop";
  dialog.dataset.accountDeleteDialog = "true";
  dialog.innerHTML = `
    <div class="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" aria-describedby="account-delete-description">
      <p class="eyebrow">חשבון ופרטיות</p>
      <h2 id="account-delete-title">למחוק את החשבון?</h2>
      <p id="account-delete-description">החשבון, סביבת הענן והמידע האישי יימחקו לצמיתות. ברישומי הוצאות משותפים השם שלך יוחלף ב"משתמש שנמחק", כדי לא לפגוע בחישובים של חברים אחרים.</p>
      <label class="account-delete-confirmation">
        <input type="checkbox" data-account-delete-confirmation />
        <span>אני מבין שהפעולה קבועה ואי אפשר לבטל אותה.</span>
      </label>
      <p class="account-delete-error" role="alert" data-account-delete-error hidden></p>
      <div class="account-delete-actions">
        <button class="secondary-button" type="button" data-account-action="delete-account-cancel">חזרה</button>
        <button class="primary-button account-delete-confirm" type="button" data-account-action="delete-account-confirm" disabled>מחק את החשבון</button>
      </div>
    </div>`;
  document.body.append(dialog);
  document.querySelector("#app")?.setAttribute("inert", "");
  document.documentElement.classList.add("account-delete-open");
  dialog.querySelector("[data-account-delete-confirmation]")?.focus();
}

function closeAccountDeletionDialog() {
  const dialog = document.querySelector("[data-account-delete-dialog]");
  if (!dialog) return;
  dialog.remove();
  document.querySelector("#app")?.removeAttribute("inert");
  document.documentElement.classList.remove("account-delete-open", "account-delete-busy");
  const returnTarget = accountDeleteReturnFocus;
  accountDeleteReturnFocus = null;
  requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus({ preventScroll: true }));
}

function handleAccountDeletionKeydown(event) {
  const dialog = document.querySelector('.account-delete-dialog[role="dialog"]');
  if (!dialog) return;

  if (event.key === "Escape" && !authBusy) {
    event.preventDefault();
    closeAccountDeletionDialog();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.offsetParent !== null);
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
  }
}

function setAccountDeletionBusy(value) {
  document.documentElement.classList.toggle("account-delete-busy", value);
  document.querySelectorAll("[data-account-delete-dialog] button, [data-account-delete-dialog] input")
    .forEach((element) => {
      element.disabled = value || (
        element.matches('[data-account-action="delete-account-confirm"]') &&
        !document.querySelector("[data-account-delete-confirmation]")?.checked
      );
    });
}

function renderPasswordResetGate(error = "") {
  document.querySelector(".public-profile-gate")?.remove();
  document.getElementById(GATE_ID)?.remove();
  document.querySelector("#app")?.setAttribute("inert", "");

  const gate = document.createElement("section");
  gate.id = GATE_ID;
  gate.className = "account-auth-gate";
  gate.setAttribute("role", "main");
  gate.innerHTML = `
    <div class="account-auth-shell account-auth-shell-compact">
      <section class="account-auth-brand">
        <span class="account-auth-mark" aria-hidden="true"><img src="./brand-mark-v3.png" alt="" width="50" height="50" /></span>
        <div>
          <p class="eyebrow">סוגרים חשבון</p>
          <h1>בוחרים סיסמה חדשה</h1>
          <p>אחרי השמירה נחזיר אותך ישר לחשבון שלך.</p>
        </div>
      </section>
      <section class="account-auth-form-panel">
        <div class="account-auth-logo-lockup" role="img" aria-label="סוגרים חשבון - ניהול הוצאות משותפות">
          <img src="./sogrim-logo-lockup.png" alt="" width="967" height="417" />
        </div>
        <div class="account-auth-heading">
          <h2>איפוס סיסמה</h2>
          <p>הסיסמה החדשה צריכה להכיל לפחות 8 תווים.</p>
        </div>
        <form class="account-auth-form" data-account-form data-mode="reset-password">
          <label>
            <span>סיסמה חדשה</span>
            <input name="password" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <label>
            <span>אימות סיסמה</span>
            <input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          ${error ? `<p class="account-auth-error" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="primary-button account-auth-submit" type="submit">שמור סיסמה</button>
        </form>
      </section>
    </div>
  `;
  document.body.append(gate);
  gate.querySelector("form")?.addEventListener("submit", handleAccountSubmit);
  focusAccountInputOnDesktop(gate);
}

function watchAccountControls() {
  const app = document.querySelector("#app");
  if (!app) return;
  const observer = new MutationObserver(() => enhanceAccountControls());
  observer.observe(app, { childList: true, subtree: true });
}

async function providerEnabled(provider) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${runtimeConfig.storage.url}/auth/v1/settings`, {
      headers: { apikey: runtimeConfig.storage.anonKey },
      signal: controller.signal
    });
    if (!response.ok) return false;
    const settings = await response.json();
    return Boolean(settings.external?.[provider]);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function enableProviderOptions() {
  const slot = document.querySelector("[data-google-auth-slot]");
  if (!slot) return;
  slot.innerHTML = providerOptionsMarkup();
}

function providerOptionsMarkup() {
  const buttons = [
    googleEnabled
      ? `<button class="account-google-button" type="button" data-account-action="google">
          ${googleIcon()}
          <span>המשך עם Google</span>
        </button>`
      : "",
    appleEnabled
      ? `<button class="account-google-button account-apple-button" type="button" data-account-action="apple">
          <span>המשך עם Apple</span>
        </button>`
      : ""
  ].filter(Boolean).join("");
  return buttons;
}

function canResumeOffline(session, error) {
  return Boolean(session?.user && !Number(error?.status));
}

function rememberAccountReturnUrl() {
  const inviteUrl = pendingInviteUrl(window.location.href);
  const returnUrl = new URL(inviteUrl || window.location.href, window.location.origin);
  localStorage.setItem(
    ACCOUNT_RETURN_URL_STORAGE_KEY,
    `${returnUrl.pathname}${returnUrl.search}`
  );
}

function accountInviteMarkup() {
  const inviteUrl = pendingInviteUrl(window.location.href);
  const eventId = parseInviteEventId(inviteUrl);
  if (!eventId) return "";

  const event = parseInviteSnapshot(inviteUrl)?.event;
  const eventName = event?.name ? escapeHtml(event.name) : "האירוע שקיבלת";
  const participantCount = event?.participantIds?.length ?? 0;
  const detail = participantCount
    ? `${participantCount} משתתפים כבר באירוע`
    : "אחרי הכניסה נחבר אותך ישר לאירוע";
  return `<section class="account-invite-preview" aria-label="הזמנה לאירוע">
    <span>קיבלת הזמנה</span>
    <strong>${eventName}</strong>
    <p>${escapeHtml(detail)}</p>
  </section>`;
}

function focusAccountInputOnDesktop(gate) {
  if (!window.matchMedia?.("(min-width: 761px)").matches) return;
  gate.querySelector("input")?.focus();
}

function authRedirectUrl() {
  if (globalThis.SogrimNative?.authCallbackUrl) {
    return globalThis.SogrimNative.authCallbackUrl;
  }
  return `${window.location.origin}${window.location.pathname}`;
}

async function openOAuthUrl(url) {
  if (await globalThis.SogrimNative?.openAuth?.(url)) return;
  location.assign(url);
}

function cleanAuthHash() {
  const returnPath = localStorage.getItem(ACCOUNT_RETURN_URL_STORAGE_KEY);
  localStorage.removeItem(ACCOUNT_RETURN_URL_STORAGE_KEY);
  history.replaceState(history.state, "", returnPath || `${location.pathname}${location.search}`);
}

function isExpiring(session) {
  return !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60;
}

function setAuthBusy(value) {
  authBusy = value;
  document.documentElement.classList.toggle("account-auth-busy", value);
  document.querySelectorAll("#public-account-auth-gate button, #public-account-auth-gate input")
    .forEach((element) => {
      element.disabled = value;
    });
}

function sessionValue(key) {
  try {
    return window.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setSessionValue(key, value) {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch {}
}

function removeSessionValue(key) {
  try {
    window.sessionStorage?.removeItem(key);
  } catch {}
}

function googleIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.19-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/>
    <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/>
    <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"/>
    <path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/>
  </svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .account-auth-gate {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: auto;
      color: #17201d;
      background: #f4f7f5;
    }

    html.account-auth-locked #app {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .account-auth-shell {
      width: min(100%, 940px);
      min-height: 590px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 0.88fr);
      overflow: hidden;
      border: 1px solid #dbe4df;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 28px 80px rgba(17, 43, 36, 0.16);
    }

    .account-auth-boot-card {
      min-width: 210px;
      display: grid;
      justify-items: center;
      gap: 14px;
      padding: 28px;
      border: 1px solid #dbe4df;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 20px 55px rgba(17, 43, 36, 0.14);
    }

    .account-auth-boot-card strong {
      font-size: 20px;
    }

    .account-auth-loader {
      width: 24px;
      height: 24px;
      border: 3px solid #d7e4df;
      border-top-color: #08766c;
      border-radius: 50%;
      animation: account-auth-spin 700ms linear infinite;
    }

    @keyframes account-auth-spin {
      to { transform: rotate(360deg); }
    }

    .account-auth-brand {
      display: grid;
      align-content: space-between;
      gap: 28px;
      padding: 44px;
      color: #ffffff;
      background: #0b3b38;
    }

    .account-auth-mark {
      width: 50px;
      height: 50px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 8px;
      color: #dff4f5;
      background: rgba(255,255,255,.1);
      font-size: 24px;
      font-weight: 900;
    }

    #public-account-auth-gate .account-auth-brand h1 {
      max-width: 13ch;
      margin: 8px 0 14px;
      color: #ffffff !important;
      font-size: clamp(32px, 5vw, 50px);
      line-height: 1.1;
    }

    #public-account-auth-gate .account-auth-brand .eyebrow {
      color: #71d9de !important;
    }

    #public-account-auth-gate .account-auth-brand p {
      margin: 0;
      color: rgba(255,255,255,.82) !important;
      font-size: 16px;
      line-height: 1.65;
    }

    .account-auth-brand ul {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: rgba(255,255,255,.88);
      font-weight: 650;
    }

    .account-auth-brand li::before {
      content: "✓";
      margin-inline-end: 9px;
      color: #71d9de;
    }

    .account-auth-form-panel {
      display: grid;
      align-content: center;
      gap: 20px;
      padding: 40px;
    }

    .account-invite-preview {
      display: grid;
      gap: 5px;
      padding: 14px 16px;
      border: 1px solid rgba(7, 95, 89, .18);
      border-radius: 8px;
      background: #edf7f4;
    }

    .account-invite-preview span {
      color: #08766c;
      font-size: 13px;
      font-weight: 850;
    }

    .account-invite-preview strong {
      color: #14201d;
      font-size: 18px;
    }

    .account-invite-preview p {
      margin: 0;
      color: #65736e;
      font-size: 14px;
    }

    .account-auth-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 4px;
      border: 1px solid #dce5e0;
      border-radius: 8px;
      background: #f4f7f5;
    }

    .account-auth-tabs button {
      min-height: 44px;
      border: 0;
      border-radius: 6px;
      color: #63716b;
      background: transparent;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .account-auth-tabs button.is-active {
      color: #075e55;
      background: #ffffff;
      box-shadow: 0 2px 9px rgba(19, 56, 46, .1);
    }

    .account-auth-heading h2 {
      margin: 0 0 6px;
      font-size: 28px;
    }

    .account-auth-heading p,
    .account-auth-legal {
      margin: 0;
      color: #68766f;
      line-height: 1.5;
    }

    .account-auth-legal a {
      color: #08766c;
      font-weight: 750;
    }

    .account-google-slot:empty {
      display: none;
    }

    .account-google-slot:not(:empty) {
      display: grid;
      gap: 20px;
    }

    .account-google-button {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border: 1px solid #cfdbd5;
      border-radius: 8px;
      color: #17201d;
      background: #ffffff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .account-google-button:hover {
      border-color: #aebfb7;
      box-shadow: 0 6px 16px rgba(20, 59, 49, .08);
      transform: translateY(-1px);
    }

    .account-google-button svg {
      width: 20px;
      height: 20px;
    }

    .account-apple-button {
      border-color: #171b19;
      color: #ffffff;
      background: #171b19;
    }

    .account-apple-button:hover {
      border-color: #000000;
      background: #000000;
    }

    .account-auth-divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
      color: #78867f;
      font-size: 13px;
      font-weight: 700;
    }

    .account-auth-divider::before,
    .account-auth-divider::after {
      content: "";
      height: 1px;
      background: #e0e7e3;
    }

    .account-auth-form {
      display: grid;
      gap: 14px;
    }

    .account-auth-form label {
      display: grid;
      gap: 7px;
      font-weight: 750;
    }

    .account-auth-form input {
      width: 100%;
      min-height: 48px;
      padding: 0 13px;
      border: 1px solid #cfdbd5;
      border-radius: 8px;
      color: #17201d;
      background: #ffffff;
      font: inherit;
      font-size: 16px;
      outline: none;
    }

    .account-auth-form input:focus-visible {
      border-color: #087c78;
      box-shadow: 0 0 0 1px #087c78;
      outline: 3px solid #087c78;
      outline-offset: 2px;
    }

    #public-account-auth-gate button:focus-visible,
    #public-account-auth-gate a:focus-visible {
      outline: 3px solid #087c78;
      outline-offset: 3px;
    }

    .account-auth-submit {
      width: 100%;
      min-height: 50px;
      margin-top: 4px;
    }

    .account-forgot-button {
      justify-self: start;
      min-height: 44px;
      padding: 0;
      border: 0;
      color: #08766c;
      background: transparent;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }

    .account-auth-message,
    .account-auth-error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
    }

    .account-auth-message {
      color: #075e55;
      background: #e7f5f1;
    }

    .account-auth-error {
      color: #9a3f2c;
      background: #fff0ec;
    }

    .account-auth-legal {
      font-size: 12px;
      text-align: center;
    }

    .account-auth-busy .account-auth-shell {
      opacity: .72;
      pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .account-auth-loader {
        animation: none;
        border-top-color: #d7e4df;
        background: #08766c;
      }

      .account-google-button {
        transition: none;
      }
    }

    .account-profile-controls {
      min-width: 0;
      display: grid;
      align-items: start;
      gap: 10px;
      width: 100%;
      margin-inline-start: auto;
    }

    .account-profile-controls > span {
      max-width: 220px;
      overflow: hidden;
      color: #6a7771;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .account-profile-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .account-data-links {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .account-data-link {
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #52605a;
      font-size: 13px;
      font-weight: 750;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .account-delete-button {
      color: #a33d32;
      border-color: rgba(163, 61, 50, .28);
    }

    .account-delete-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(18, 29, 27, .52);
      backdrop-filter: blur(8px);
    }

    html.account-delete-open,
    html.account-delete-open body {
      overflow: hidden;
    }

    .account-delete-dialog {
      width: min(480px, 100%);
      padding: 28px;
      border: 1px solid rgba(23, 32, 29, .12);
      border-radius: 12px;
      color: #17201d;
      background: #ffffff;
      box-shadow: 0 24px 64px rgba(18, 29, 27, .22);
    }

    .account-delete-dialog h2 {
      margin: 4px 0 10px;
      font-size: 28px;
      letter-spacing: 0;
    }

    .account-delete-dialog > p:not(.eyebrow) {
      margin: 0;
      color: #5f6c66;
      line-height: 1.65;
    }

    .account-delete-confirmation {
      min-height: 52px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 22px 0 0;
      padding: 14px;
      border: 1px solid #e2e7e4;
      border-radius: 8px;
      background: #f8faf9;
      cursor: pointer;
    }

    .account-delete-confirmation input {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      accent-color: #a33d32;
    }

    .account-delete-confirmation span {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.45;
    }

    .account-delete-error {
      margin-top: 14px !important;
      color: #a33d32 !important;
      font-weight: 750;
    }

    .account-delete-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 22px;
    }

    .account-delete-confirm {
      background: #a33d32;
      border-color: #a33d32;
    }

    .account-delete-confirm:hover:not(:disabled) {
      background: #873229;
      border-color: #873229;
    }

    .account-delete-busy .account-delete-dialog {
      opacity: .72;
      pointer-events: none;
    }

    @media (max-width: 760px) {
      .account-auth-gate {
        place-items: stretch;
        padding: 0;
        background: #ffffff;
      }

      .account-auth-shell {
        width: 100%;
        min-height: 100dvh;
        grid-template-columns: 1fr;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .account-auth-brand {
        min-height: 230px;
        align-content: start;
        gap: 18px;
        padding: calc(24px + env(safe-area-inset-top)) 24px 26px;
      }

      .account-auth-brand h1 {
        max-width: 16ch;
        margin-block: 4px 10px;
        font-size: 32px;
      }

      .account-auth-brand ul {
        display: none;
      }

      .account-auth-form-panel {
        align-content: start;
        padding: 24px 20px calc(28px + env(safe-area-inset-bottom));
      }

      .account-auth-heading h2 {
        font-size: 25px;
      }

      .account-profile-controls {
        width: 100%;
        align-items: flex-start;
        margin: 10px 0 0;
      }

      .account-data-links {
        width: 100%;
        gap: 12px;
        padding-top: 4px;
        border-top: 1px solid rgba(16, 35, 33, .1);
      }

      .account-profile-actions {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .account-profile-actions .secondary-button {
        width: 100%;
        min-width: 0;
      }

      .account-profile-actions .account-install-button {
        grid-column: 1 / -1;
      }

      .account-delete-backdrop {
        align-items: end;
        padding: 0;
      }

      .account-delete-dialog {
        width: 100%;
        max-height: 100dvh;
        overflow: auto;
        padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
        border-radius: 12px 12px 0 0;
      }

      .account-delete-actions {
        position: sticky;
        bottom: 0;
        padding-top: 14px;
        background: #ffffff;
      }
    }
  `;
  document.head.append(style);
}
