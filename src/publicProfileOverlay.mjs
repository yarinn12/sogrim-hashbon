import {
  loadLocalProfile,
  loadSharedState,
  saveLocalProfile,
  saveSharedState
} from "./data/localStore.mjs";
import { parseInviteEventId } from "./domain/inviteLinks.mjs";
import {
  ensureNamedParticipant,
  normalizeProfileName
} from "./domain/userProfile.mjs";

const app = document.querySelector("#app");
const STYLE_ID = "public-profile-overlay-style";

injectStyle();
document.addEventListener("click", handlePublicClick);
setupPublicProfile();
watchRenderedApp();

async function setupPublicProfile() {
  const profile = loadLocalProfile();
  if (!profile) {
    renderProfileGate();
    return;
  }

  await syncInvitedEvent(profile);
  cleanPublicUi();
}

function watchRenderedApp() {
  if (!app) return;
  const observer = new MutationObserver(() => cleanPublicUi());
  observer.observe(app, { childList: true, subtree: true });
}

function cleanPublicUi() {
  const profile = loadLocalProfile();

  document.documentElement.classList.add("product-v2");
  document.querySelectorAll(".network-panel, .launch-panel, .backup-panel").forEach((item) => item.remove());
  document.querySelectorAll('[data-action="reset"]').forEach((item) => item.remove());

  enhanceProfilePanel(profile);
  enhanceNavigationClarity(profile);
  enhanceHomeScreen(profile);
  enhanceEventScreen(profile);
}

function handlePublicClick(event) {
  const target = event.target.closest("[data-public-click]");
  if (!target) return;

  event.preventDefault();
  goToNativeAction(target.dataset.publicClick);
}

function goToNativeAction(action) {
  const target = document.querySelector(`[data-action="${action}"]:not([disabled])`);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.click();
}

function enhanceProfilePanel(profile) {
  const selector = document.querySelector('[data-action="current-participant"]');
  const panel = selector?.closest(".profile-panel");
  if (!panel || !profile) return;

  panel.innerHTML = `
    <div class="public-profile-card">
      <span class="public-profile-avatar">${escapeHtml(initials(profile.displayName))}</span>
      <div>
        <span>אתה נכנס בתור</span>
        <strong>${escapeHtml(profile.displayName)}</strong>
      </div>
      <button class="secondary-button" type="button" data-public-action="edit-profile">החלף שם</button>
    </div>
  `;

  document.querySelector('[data-public-action="edit-profile"]')?.addEventListener("click", () => {
    renderProfileGate(profile.displayName);
  }, { once: true });
}

function enhanceHomeScreen(profile) {
  const screen = document.querySelector(".screen");
  if (!screen || !screen.querySelector('[data-action="new-event"]')) return;

  screen.classList.add("product-home-screen");

  const brand = screen.querySelector(".brand");
  const greeting = profile?.displayName ? `שלום ${escapeHtml(profile.displayName)}` : "שלום";
  if (brand && !brand.querySelector(".product-hero-note")) {
    brand.insertAdjacentHTML(
      "beforeend",
      `<div class="product-hero-note">${greeting}. פתח אירוע, הוסף הוצאות, וקבל העברות מינימליות בלי כאב ראש.</div>`
    );
  }

  const actions = screen.querySelector(".hero-actions");
  if (actions && !screen.querySelector(".product-home-kicker")) {
    actions.insertAdjacentHTML(
      "afterend",
      `<section class="product-home-kicker" aria-label="פעולה חכמה">
        <div>
          <span>פעולה חכמה</span>
          <strong>סגור את היציאה הבאה בשלושה צעדים</strong>
        </div>
        <ol>
          <li>יוצרים אירוע</li>
          <li>מסמנים מי השתתף בכל תשלום</li>
          <li>מקבלים בדיוק מי מעביר למי</li>
        </ol>
      </section>`
    );
  }
}

function enhanceNavigationClarity(profile) {
  const screen = document.querySelector(".screen");
  if (!screen || screen.querySelector(".product-context-bar")) return;

  const context = getScreenContext(screen, profile);
  if (!context) return;

  const top = screen.querySelector(".top");
  const html = `
    <nav class="product-context-bar" aria-label="איפה אני">
      <div class="product-context-copy">
        <span>איפה אני</span>
        <strong>${escapeHtml(context.title)}</strong>
        <small>${escapeHtml(context.helper)}</small>
      </div>
      <div class="product-context-actions" aria-label="מה עושים עכשיו">
        <span>מה עושים עכשיו</span>
        ${context.actions
          .map(
            (action) => `
              <button class="${action.primary ? "primary-button" : "secondary-button"}" type="button" data-public-click="${action.action}">
                ${escapeHtml(action.label)}
              </button>
            `
          )
          .join("")}
      </div>
    </nav>
  `;

  if (top) {
    top.insertAdjacentHTML("afterend", html);
    return;
  }

  screen.insertAdjacentHTML("afterbegin", html);
}

function getScreenContext(screen, profile) {
  if (screen.querySelector('[data-action="new-event"]')) {
    return {
      title: profile?.displayName ? `בית של ${profile.displayName}` : "בית",
      helper: "מכאן פותחים יציאה חדשה או נכנסים לאירוע קיים.",
      actions: [
        { label: "אירוע חדש", action: "new-event", primary: true },
        { label: "קבוצות", action: "groups" }
      ]
    };
  }

  if (screen.querySelector('[data-action="show-expense-form"]')) {
    const eventName = getScreenTitle(screen) || "אירוע";
    return {
      title: eventName,
      helper: "זה מסך האירוע. כאן מוסיפים תשלומים, משתתפים וקישור לחברים.",
      actions: [
        { label: "הוסף הוצאה", action: "show-expense-form", primary: true },
        { label: "שתף קישור", action: "copy-invite" },
        { label: "סגור חשבון", action: "settle" }
      ]
    };
  }

  if (screen.querySelector('[data-action="create-event"]')) {
    return {
      title: "אירוע חדש",
      helper: "בוחרים שם, קבוצה ומשתתפים. מי שלא הגיע פשוט לא מסומן.",
      actions: [
        { label: "צור אירוע", action: "create-event", primary: true },
        { label: "חזרה", action: "home" }
      ]
    };
  }

  if (screen.querySelector('[data-action="create-group"]')) {
    return {
      title: "קבוצות קבועות",
      helper: "שומרים חברים קבועים כדי לפתוח יציאה שבועית מהר יותר.",
      actions: [
        { label: "שמור קבוצה", action: "create-group", primary: true },
        { label: "חזרה", action: "home" }
      ]
    };
  }

  if (screen.querySelector('[data-action="copy-settlement"]')) {
    return {
      title: "סגירת חשבון",
      helper: "כאן רואים מי מעביר למי, עם כמה שפחות העברות מיותרות.",
      actions: [
        { label: "העתק סיכום", action: "copy-settlement", primary: true },
        { label: "דוח מלא", action: "copy-event-report" },
        { label: "חזרה לאירוע", action: "back-to-event" }
      ]
    };
  }

  return null;
}

function enhanceEventScreen() {
  const screen = document.querySelector(".screen");
  if (!screen || !screen.querySelector('[data-action="show-expense-form"]')) return;

  screen.classList.add("product-event-screen");

  const summary = screen.querySelector(".summary-strip");
  if (summary && !screen.querySelector(".product-event-command")) {
    const eventName = getScreenTitle(screen) || "האירוע הזה";
    summary.insertAdjacentHTML(
      "afterend",
      `<section class="product-event-command" aria-label="מה עושים עכשיו">
        <div class="product-event-command-copy">
          <span>מה עושים עכשיו</span>
          <h2>כאן מכניסים הוצאות</h2>
          <p>אתה בתוך ${escapeHtml(eventName)}. מוסיפים מי שילם, כמה כל אחד שילם, ומי באמת שותף לכל תשלום.</p>
        </div>
        <div class="product-command-actions">
          <button class="primary-button" type="button" data-public-click="show-expense-form">הוסף הוצאה</button>
          <button class="secondary-button" type="button" data-public-click="copy-invite">שתף קישור</button>
          <button class="secondary-button" type="button" data-public-click="settle">סגור חשבון</button>
        </div>
      </section>`
    );
  }

  if (!screen.querySelector(".product-sticky-actions")) {
    screen.insertAdjacentHTML(
      "beforeend",
      `<div class="product-sticky-actions" aria-label="פעולות מהירות">
        <button class="primary-button" type="button" data-public-click="show-expense-form">הוסף הוצאה</button>
        <button class="secondary-button" type="button" data-public-click="copy-invite">שתף קישור</button>
        <button class="secondary-button" type="button" data-public-click="settle">סגור חשבון</button>
      </div>`
    );
  }

  enhanceExpenseFormHint(screen);
}

function enhanceExpenseFormHint(screen) {
  const expenseName = screen.querySelector('[data-action="expense-name"]');
  const panel = expenseName?.closest(".panel");
  if (!panel || panel.querySelector(".product-form-helper")) return;

  panel.insertAdjacentHTML(
    "afterbegin",
    `<div class="product-form-helper">
      <strong>ממלאים הוצאה אחת בכל פעם</strong>
      <span>שם, סכום, מי שילם וכמה, ואז מי היה שותף. מי שלא שתה או לא נסע פשוט לא מסומן בתשלום הזה.</span>
    </div>`
  );
}

function getScreenTitle(screen) {
  return screen.querySelector(".brand h1")?.textContent?.trim() ?? "";
}

function renderProfileGate(defaultName = "") {
  const shell = document.createElement("section");
  shell.className = "public-profile-gate";
  shell.innerHTML = `
    <form class="public-profile-modal" data-public-profile-form>
      <section class="public-profile-hero" aria-label="סוגרים חשבון">
        <p class="eyebrow">סוגרים חשבון</p>
        <h1>ארנק קבוצתי לחברים שיוצאים ביחד</h1>
        <p>כל חבר נכנס בשם שלו, מוסיף מה שילם, והאפליקציה מחשבת העברות חכמות בלי שכל אחד יעביר לכולם.</p>
        <div class="public-profile-proof">
          <span><strong>1</strong> אירוע</span>
          <span><strong>∞</strong> תשלומים</span>
          <span><strong>מעט</strong> העברות</span>
        </div>
      </section>

      <section class="public-profile-form">
        <p class="eyebrow">כניסה מהירה</p>
        <h2>איך קוראים לך?</h2>
        <p class="muted">נשמור את השם במכשיר הזה כדי שהמסך שלך יהיה אישי. בהמשך נחבר גם Google.</p>
        <label class="field">
          <span>השם שלך</span>
          <input name="displayName" value="${escapeAttribute(defaultName)}" placeholder="השם שיופיע לחברים" autocomplete="name" autofocus />
        </label>
        <p class="field-error" data-public-profile-error hidden></p>
        <button class="primary-button" type="submit">התחל לסגור חשבון</button>
        <p class="public-profile-privacy">אין הרשמה כבדה כרגע. רק שם מקומי כדי שכל חבר יקבל מסך משלו.</p>
      </section>
    </form>
  `;

  document.querySelector(".public-profile-gate")?.remove();
  document.body.append(shell);
  shell.querySelector("input")?.focus();
  shell.querySelector("form")?.addEventListener("submit", saveProfile);
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = form.querySelector("[data-public-profile-error]");
  const displayName = normalizeProfileName(new FormData(form).get("displayName"));

  if (!displayName) {
    error.hidden = false;
    error.textContent = "צריך להזין שם כדי להמשיך.";
    return;
  }

  const invitedEventId = parseInviteEventId(window.location.href);
  const previous = loadLocalProfile();
  const nextState = ensureNamedParticipant(
    await loadSharedState(),
    {
      id: previous?.participantId ?? makeUserId(),
      displayName
    },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? displayName
  });
  await saveSharedState(nextState);
  window.location.reload();
}

async function syncInvitedEvent(profile) {
  const invitedEventId = parseInviteEventId(window.location.href);
  if (!invitedEventId) return;

  const state = await loadSharedState();
  const event = state.events.find((item) => item.id === invitedEventId);
  if (!event || event.participantIds.includes(profile.participantId)) return;

  const nextState = ensureNamedParticipant(
    state,
    { id: profile.participantId, displayName: profile.displayName },
    invitedEventId
  );
  const participant = nextState.participants.find(
    (item) => item.id === nextState.currentParticipantId
  );

  saveLocalProfile({
    participantId: nextState.currentParticipantId,
    displayName: participant?.displayName ?? profile.displayName
  });
  await saveSharedState(nextState);
  window.location.reload();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  document.documentElement.classList.add("product-v2");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root.product-v2 {
      --bg: #f4f6f2;
      --panel: #fffdf8;
      --panel-soft: #eef6f3;
      --text: #171d1a;
      --muted: #69756f;
      --line: #dfe6dd;
      --line-strong: #bbc7bf;
      --accent: #0a7d6f;
      --accent-strong: #07574e;
      --accent-soft: #dbf0ea;
      --accent-ink: #063d37;
      --warm: #c7563d;
      --warm-soft: #ffe7de;
      --gold: #a57521;
      --gold-soft: #fff0bf;
      --shadow: 0 18px 42px rgba(23, 29, 26, 0.08);
      --shadow-lift: 0 28px 64px rgba(23, 29, 26, 0.16);
      --shadow-soft: 0 10px 28px rgba(23, 29, 26, 0.07);
    }

    .product-v2 body {
      background:
        linear-gradient(180deg, #edf4f0 0, #f7f4ea 330px, #f4f6f2 680px),
        linear-gradient(110deg, rgba(10, 125, 111, 0.12), rgba(199, 86, 61, 0.06) 48%, rgba(165, 117, 33, 0.1));
    }

    .product-v2 .screen {
      width: min(100%, 1120px);
      padding: clamp(18px, 4vw, 40px);
    }

    .product-v2 .top {
      align-items: stretch;
      margin: 0 0 18px;
      padding: clamp(18px, 4vw, 30px);
      min-height: 238px;
      color: white;
      background:
        linear-gradient(135deg, #0d352f 0%, #0a6f63 52%, #c65a3f 140%);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      box-shadow: var(--shadow-lift);
      overflow: hidden;
    }

    .product-v2 .top .muted,
    .product-v2 .top .eyebrow {
      color: rgba(255, 255, 255, 0.82);
    }

    .product-v2 .brand {
      width: min(100%, 680px);
      padding-inline-start: 70px;
    }

    .product-v2 .brand::before {
      background: #fffdf8;
      color: #07574e;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.16);
    }

    .product-v2 h1 {
      max-width: 15ch;
      font-size: clamp(32px, 5vw, 58px);
      letter-spacing: 0;
    }

    .product-hero-note {
      width: min(100%, 520px);
      margin-top: 14px;
      color: rgba(255, 255, 255, 0.88);
      font-weight: 700;
      line-height: 1.6;
    }

    .product-v2 .hero-actions {
      position: sticky;
      top: 0;
      z-index: 3;
      padding: 10px 0 14px;
      background: linear-gradient(180deg, rgba(244, 246, 242, 0.94), rgba(244, 246, 242, 0));
      backdrop-filter: blur(10px);
    }

    .product-context-bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin: 0 0 16px;
      padding: 14px;
      background: rgba(255, 253, 248, 0.94);
      border: 1px solid rgba(23, 29, 26, 0.09);
      border-radius: 8px;
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(14px);
    }

    .product-context-copy span,
    .product-context-actions > span,
    .product-event-command-copy span {
      display: block;
      color: var(--warm);
      font-size: 0.8rem;
      font-weight: 950;
    }

    .product-context-copy strong {
      display: block;
      margin-top: 3px;
      font-size: clamp(18px, 2vw, 24px);
      line-height: 1.15;
    }

    .product-context-copy small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-weight: 750;
      line-height: 1.5;
    }

    .product-context-actions,
    .product-command-actions,
    .product-sticky-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .product-context-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: 520px;
    }

    .product-context-actions > span {
      width: 100%;
      text-align: end;
      color: var(--accent);
    }

    .product-context-actions .primary-button,
    .product-context-actions .secondary-button,
    .product-command-actions .primary-button,
    .product-command-actions .secondary-button {
      min-height: 42px;
      padding-inline: 14px;
      white-space: nowrap;
    }

    .product-event-screen {
      padding-bottom: 116px;
    }

    .product-event-command {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 18px;
      align-items: center;
      margin: 16px 0;
      padding: clamp(18px, 3vw, 26px);
      color: white;
      background:
        linear-gradient(135deg, #171d1a 0%, #0d352f 56%, #8d3d2d 142%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      box-shadow: var(--shadow-lift);
    }

    .product-event-command-copy {
      max-width: 720px;
    }

    .product-event-command-copy span {
      color: #fff0bf;
    }

    .product-event-command h2 {
      margin: 4px 0 8px;
      font-size: clamp(26px, 4vw, 42px);
      line-height: 1.08;
    }

    .product-event-command p {
      margin: 0;
      color: rgba(255, 255, 255, 0.82);
      font-weight: 750;
      line-height: 1.65;
    }

    .product-event-command .secondary-button {
      color: #171d1a;
      border-color: rgba(255, 255, 255, 0.28);
    }

    .product-sticky-actions {
      position: fixed;
      display: grid;
      grid-template-columns: 1.12fr 1fr 1fr;
      right: 50%;
      bottom: 16px;
      z-index: 30;
      width: min(calc(100% - 24px), 720px);
      transform: translateX(50%);
      padding: 10px;
      background: rgba(255, 253, 248, 0.94);
      border: 1px solid rgba(23, 29, 26, 0.12);
      border-radius: 8px;
      box-shadow: 0 20px 48px rgba(23, 29, 26, 0.18);
      backdrop-filter: blur(16px);
    }

    .product-sticky-actions button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 44px;
      padding-inline: 10px;
    }

    .product-form-helper {
      display: grid;
      gap: 5px;
      margin: 0 0 16px;
      padding: 14px;
      color: #4b4030;
      background: #fff8ea;
      border: 1px solid #e5ded2;
      border-radius: 8px;
    }

    .product-form-helper strong {
      font-size: 1.04rem;
    }

    .product-form-helper span {
      color: #6f6250;
      font-weight: 750;
      line-height: 1.55;
    }

    .product-v2 .primary-button,
    .product-v2 .secondary-button,
    .product-v2 .icon-button {
      border-radius: 8px;
      min-height: 48px;
      font-weight: 900;
    }

    .product-v2 .primary-button {
      background: linear-gradient(135deg, #0a7d6f, #07574e);
      box-shadow: 0 14px 28px rgba(10, 125, 111, 0.24);
    }

    .product-v2 .secondary-button {
      background: #fffdf8;
      border-color: #d8dfd7;
    }

    .product-v2 .panel,
    .product-v2 .event-row,
    .product-v2 .expense-row,
    .product-v2 .group-row,
    .product-v2 .transfer-row,
    .product-v2 .balance-row,
    .product-v2 .summary-strip,
    .product-home-kicker {
      border-radius: 8px;
      border-color: rgba(23, 29, 26, 0.09);
      box-shadow: var(--shadow);
    }

    .product-home-kicker {
      display: grid;
      grid-template-columns: minmax(0, 0.92fr) minmax(280px, 1fr);
      gap: 16px;
      align-items: center;
      margin: 2px 0 16px;
      padding: 18px;
      background: #fffdf8;
    }

    .product-home-kicker span {
      display: block;
      color: var(--warm);
      font-size: 0.88rem;
      font-weight: 900;
    }

    .product-home-kicker strong {
      display: block;
      margin-top: 4px;
      font-size: clamp(20px, 3vw, 28px);
      line-height: 1.18;
    }

    .product-home-kicker ol {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: steps;
    }

    .product-home-kicker li {
      counter-increment: steps;
      min-height: 86px;
      padding: 14px;
      border: 1px solid #e5ded2;
      border-radius: 8px;
      background: #fff8ea;
      color: #4b4030;
      font-weight: 850;
    }

    .product-home-kicker li::before {
      content: counter(steps);
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      margin-inline-end: 8px;
      border-radius: 50%;
      background: #171d1a;
      color: white;
      font-size: 0.82rem;
    }

    .product-v2 .summary-strip {
      gap: 1px;
      padding: 0;
      overflow: hidden;
      background: #171d1a;
      border-color: #171d1a;
    }

    .product-v2 .summary-item {
      min-height: 96px;
      padding: 18px;
      border: 0;
      background: #fffdf8;
    }

    .product-v2 .summary-item strong {
      font-size: 30px;
    }

    .product-v2 .event-row {
      min-height: 94px;
      background: #fffdf8;
    }

    .product-v2 .empty-state {
      min-height: 150px;
      display: grid;
      place-items: center;
      border: 1px dashed #cfd8d0;
      border-radius: 8px;
      background: rgba(255, 253, 248, 0.72);
      color: var(--muted);
      font-weight: 850;
    }

    .public-profile-gate {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 18px;
      background:
        linear-gradient(180deg, rgba(239, 245, 241, 0.96), rgba(248, 244, 234, 0.96)),
        #f4f6f2;
      backdrop-filter: blur(14px);
    }

    .public-profile-modal {
      width: min(100%, 920px);
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(340px, 0.92fr);
      overflow: hidden;
      background: #fffdf8;
      border: 1px solid #dce4dc;
      border-radius: 8px;
      box-shadow: 0 30px 80px rgba(23, 29, 26, 0.2);
    }

    .public-profile-hero,
    .public-profile-form {
      padding: clamp(24px, 4vw, 38px);
    }

    .public-profile-hero {
      display: grid;
      align-content: space-between;
      min-height: 520px;
      color: white;
      background:
        linear-gradient(150deg, rgba(9, 49, 44, 0.98), rgba(10, 125, 111, 0.94) 64%, rgba(199, 86, 61, 0.78)),
        #0d352f;
    }

    .public-profile-hero .eyebrow {
      color: rgba(255, 255, 255, 0.74);
    }

    .public-profile-hero h1 {
      max-width: 13ch;
      margin: 0 0 14px;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 1.02;
    }

    .public-profile-hero p {
      color: rgba(255, 255, 255, 0.84);
      font-weight: 700;
      line-height: 1.65;
    }

    .public-profile-proof {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 28px;
    }

    .public-profile-proof span {
      min-height: 76px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
      font-weight: 800;
    }

    .public-profile-proof strong {
      display: block;
      color: #fff8dc;
      font-size: 1.38rem;
    }

    .public-profile-form {
      display: grid;
      align-content: center;
    }

    .public-profile-form h2 {
      margin-bottom: 8px;
      font-size: clamp(28px, 4vw, 40px);
    }

    .public-profile-form .primary-button {
      width: 100%;
      margin-top: 4px;
    }

    .public-profile-privacy {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.55;
    }

    .public-profile-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .public-profile-card span:not(.public-profile-avatar) {
      display: block;
      color: #69756f;
      font-size: 0.9rem;
    }

    .public-profile-card strong {
      display: block;
      margin-top: 2px;
    }

    .public-profile-avatar {
      width: 42px;
      height: 42px;
      display: inline-grid;
      place-items: center;
      border-radius: 50%;
      background: #dbf0ea;
      border: 1px solid #afd7ce;
      color: #063d37;
      font-weight: 900;
    }

    @media (max-width: 760px) {
      .product-v2 .top {
        min-height: 0;
      }

      .product-v2 .brand {
        padding-inline-start: 58px;
      }

      .product-v2 .brand::before {
        width: 44px;
        height: 44px;
      }

      .product-home-kicker {
        grid-template-columns: 1fr;
      }

      .product-context-bar,
      .product-event-command {
        grid-template-columns: 1fr;
      }

      .product-context-actions,
      .product-command-actions {
        justify-content: stretch;
      }

      .product-context-actions > span {
        text-align: start;
      }

      .product-context-actions button,
      .product-command-actions button {
        flex: 1 1 0;
      }

      .product-home-kicker ol,
      .product-v2 .summary-strip {
        grid-template-columns: 1fr;
      }

      .product-home-kicker li {
        min-height: auto;
      }

      .public-profile-modal {
        grid-template-columns: 1fr;
      }

      .public-profile-hero {
        min-height: 320px;
      }
    }

    @media (max-width: 440px) {
      .public-profile-card {
        grid-template-columns: auto 1fr;
      }

      .public-profile-card button {
        grid-column: 1 / -1;
      }

      .public-profile-proof {
        grid-template-columns: 1fr;
      }

      .product-sticky-actions {
        grid-template-columns: 1fr;
      }

      .product-sticky-actions button {
        font-size: 0.92rem;
      }
    }
  `;
  document.head.append(style);
}

function makeUserId() {
  if (crypto.randomUUID) return `user-${crypto.randomUUID()}`;
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("") || "?";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
