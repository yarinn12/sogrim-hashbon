import { loadLocalProfile } from "./data/localStore.mjs";
import {
  avatarSourceForParticipant
} from "./domain/avatarPresets.mjs";
import { iconSvg } from "./uiIcons.mjs";
import { renderPrimaryNavigation } from "./primaryNavigation.mjs";

const STYLE_ID = "public-brand-layer-style";
const APP_NAME = "סוגרים חשבון";
const APP_TAGLINE = "חובות בין חברים, בלי כאב ראש";
let scheduledBranding = false;
let preferredHomeDestination = "home";

injectBrandStyle();
enhanceBranding();
watchBranding();
document.addEventListener("click", handlePrimaryNavigationIntent, true);
document.addEventListener("settle-friends:screen-rendered", enhanceBranding);
document.addEventListener(
  "settle-friends:notification-inbox-updated",
  scheduleBranding
);

function watchBranding() {
  if (!document.body) return;

  new MutationObserver(scheduleBranding).observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scheduleBranding() {
  if (scheduledBranding) return;
  scheduledBranding = true;

  requestAnimationFrame(() => {
    scheduledBranding = false;
    enhanceBranding();
  });
}

function enhanceBranding() {
  enhanceAppScreenBrand();
  enhanceProfileGateBrand();
  enhanceScreenHeroArtwork();
  syncHeaderNavState();
  simplifyEmptyHome();
}

function enhanceAppScreenBrand() {
  const screen = document.querySelector("#app .screen");
  if (!screen) return;
  const kind = detectBrandScreenKind(screen);
  const existingIdentity = screen.querySelector(":scope > .product-app-identity");
  if (existingIdentity) {
    syncHeaderIdentity(screen, existingIdentity, kind);
    return;
  }

  const html = `
    <header class="product-app-identity">
      ${renderBrandLockup("product-app-lockup")}
      ${shouldShowPrimaryNav(screen) ? renderHeaderNav() : ""}
    </header>
  `;

  const top = screen.querySelector(".top");
  if (top) {
    top.insertAdjacentHTML("beforebegin", html);
    syncHeaderIdentity(
      screen,
      screen.querySelector(":scope > .product-app-identity"),
      kind
    );
    return;
  }

  screen.insertAdjacentHTML("afterbegin", html);
  syncHeaderIdentity(
    screen,
    screen.querySelector(":scope > .product-app-identity"),
    kind
  );
}

function syncHeaderIdentity(screen, identity, kind) {
  if (!identity) return;

  const isHome = kind === "home";
  const usesHomeIdentityOrder = isHome || kind === "notifications";
  syncIdentityRouteControls(screen, identity);
  const profileIdentity = resolveHeaderProfileIdentity(screen);
  identity.classList.toggle("is-home-context", isHome);
  identity.classList.toggle("is-profile-first-context", usesHomeIdentityOrder);
  syncHeaderProfileAvatar(identity, profileIdentity.avatarSource);

  const subtitle = identity.querySelector(".product-brand-copy small");
  if (!subtitle) return;

  const firstName = profileIdentity.displayName
    .split(/\s+/)
    .filter(Boolean)[0];
  const greeting = firstName ? `היי, ${firstName}` : APP_TAGLINE;
  if (subtitle.textContent !== greeting) {
    subtitle.textContent = greeting;
  }
}

function resolveHeaderProfileIdentity(screen) {
  const profile = loadLocalProfile();
  const participantId = String(profile?.participantId ?? "").trim();
  const displayName = String(profile?.displayName ?? "").trim();
  if (!participantId || !displayName) {
    return { displayName: "", avatarSource: "" };
  }

  const avatarParticipant = {
    id: participantId,
    displayName,
    avatarPreset: profile?.avatarPreset,
    avatarImage: profile?.avatarImage
  };
  return {
    displayName,
    avatarSource:
      screen.dataset.profileAvatarSrc?.trim() ||
      avatarSourceForParticipant(avatarParticipant, participantId || displayName)
  };
}

function syncHeaderProfileAvatar(identity, avatarSource) {
  const existingAvatar = identity.querySelector(".product-header-profile-avatar");
  const lockup = identity.querySelector(".product-app-lockup");
  const brandCopy = lockup?.querySelector(".product-brand-copy");
  if (!avatarSource || !lockup || !brandCopy) {
    existingAvatar?.remove();
    return;
  }

  let avatar = existingAvatar;
  if (avatar && avatar.tagName !== "BUTTON") {
    const interactiveAvatar = document.createElement("button");
    avatar.replaceWith(interactiveAvatar);
    avatar = interactiveAvatar;
  }
  if (!avatar) {
    avatar = document.createElement("button");
    avatar.className = "product-header-profile-avatar";
    brandCopy.insertAdjacentElement("beforebegin", avatar);
  }
  avatar.type = "button";
  avatar.className = "product-header-profile-avatar";
  avatar.dataset.action = "edit-profile";
  avatar.setAttribute("aria-label", "פתיחת הפרופיל");
  avatar.setAttribute("title", "פרופיל");
  if (!avatar.querySelector("img")) {
    avatar.innerHTML =
      '<img alt="" width="96" height="96" loading="eager" decoding="async" />';
  }

  const image = avatar.querySelector("img");
  if (image && image.getAttribute("src") !== avatarSource) {
    image.setAttribute("src", avatarSource);
  }
}

function enhanceProfileGateBrand() {
  const hero = document.querySelector(".public-profile-hero");
  if (!hero || hero.querySelector(".product-gate-brand")) return;

  const legacyEyebrow = hero.querySelector(":scope > .eyebrow");
  if (legacyEyebrow?.textContent?.trim() === APP_NAME) {
    legacyEyebrow.remove();
  }

  hero.insertAdjacentHTML("afterbegin", renderBrandLockup("product-gate-brand"));
}

function renderBrandLockup(extraClass = "") {
  return `
    <div class="product-brand-lockup ${extraClass}">
      ${renderBrandMark()}
      <span class="product-brand-copy">
        <strong>${APP_NAME}</strong>
        <small>${APP_TAGLINE}</small>
      </span>
    </div>
  `;
}

function renderHeaderNav() {
  return renderPrimaryNavigation();
}

function syncHeaderNavState() {
  const screen = document.querySelector("#app .screen");
  const identity = screen?.querySelector(":scope > .product-app-identity");
  if (!screen || !identity) return;

  const kind = detectBrandScreenKind(screen);
  const showPrimaryNav = shouldShowPrimaryNav(screen);
  let nav = identity.querySelector(":scope > .product-app-nav");
  if (!showPrimaryNav) {
    nav?.remove();
    return;
  }
  if (!nav) {
    identity.insertAdjacentHTML("beforeend", renderHeaderNav());
    nav = identity.querySelector(":scope > .product-app-nav");
  }
  if (!nav) return;

  const eventDestinations = new Set(["event", "settlement", "join-event"]);
  const activeDestination =
    kind === "notifications"
      ? "notifications"
      : kind === "profile"
        ? "profile"
        : kind === "admin"
          ? "profile"
          : kind === "home"
            ? preferredHomeDestination
            : eventDestinations.has(kind)
              ? "events"
              : "";

  syncNotificationNavBadge(nav);
  setPrimaryNavigationActiveDestination(nav, activeDestination);
}

function syncIdentityRouteControls(screen, identity) {
  let controls = identity.querySelector(":scope > .product-route-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "product-route-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "ניווט מהיר");
    identity.append(controls);
  }

  let backButton = screen.querySelector('[data-action="go-back"]');
  if (!backButton) {
    backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "icon-button app-back-button";
    backButton.dataset.action = "go-back";
    backButton.setAttribute("aria-label", "חזרה למסך הקודם");
    backButton.title = "חזרה למסך הקודם";
    backButton.innerHTML = `<span class="app-back-button-glyph" aria-hidden="true">${iconSvg("chevron-left")}</span>`;
  }
  if (backButton.parentElement !== controls || controls.firstElementChild !== backButton) {
    controls.prepend(backButton);
  }
}

function shouldShowPrimaryNav(screen) {
  return Boolean(screen && !screen.classList.contains("profile-first-run-screen"));
}

function syncNotificationNavBadge(nav) {
  const button = nav?.querySelector('[data-nav-destination="notifications"]');
  const badge = button?.querySelector(".product-nav-badge");
  if (!button || !badge) return;

  const rawUnread = Number.parseInt(
    document.querySelector("#app")?.dataset.notificationUnreadCount ?? "0",
    10
  );
  const unread = Number.isFinite(rawUnread) ? Math.max(0, rawUnread) : 0;
  const nextHidden = unread === 0;
  const nextText = unread > 9 ? "9+" : String(unread);
  const nextLabel = unread
    ? `\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea, ${unread} \u05d7\u05d3\u05e9\u05d5\u05ea`
    : "\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea";
  if (badge.hidden !== nextHidden) badge.hidden = nextHidden;
  if (badge.textContent !== nextText) badge.textContent = nextText;
  if (button.getAttribute("aria-label") !== nextLabel) {
    button.setAttribute("aria-label", nextLabel);
  }
}

function setPrimaryNavigationActiveDestination(nav, activeDestination) {
  if (!nav) return;

  nav.querySelectorAll(".product-nav-button").forEach((button) => {
    const isActive = button.dataset.navDestination === activeDestination;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function handlePrimaryNavigationIntent(event) {
  const button = event.target.closest(".product-nav-button[data-nav-destination]");
  if (!button) return;

  const destination = button.dataset.navDestination;
  setPrimaryNavigationActiveDestination(
    button.closest(".product-app-nav"),
    destination
  );
  if (destination === "home") {
    preferredHomeDestination = "home";
    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
    });
    return;
  }

  if (destination === "events") {
    preferredHomeDestination = "events";
    requestAnimationFrame(focusHomeEvents);
  }
}

function focusHomeEvents() {
  const screen = document.querySelector('#app .screen[data-screen-kind="home"]');
  const section =
    screen?.querySelector(".event-list")?.closest(".section") ??
    screen?.querySelector(".home-empty-events");
  if (!section) return;

  const heading = section.querySelector("h2");
  if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  section.scrollIntoView({
    block: "start",
    behavior: prefersReducedMotion() ? "auto" : "smooth"
  });
  heading?.focus({ preventScroll: true });
  syncHeaderNavState();
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function renderBrandMark() {
  return `
    <span class="product-brand-mark" aria-hidden="true">
      <img class="product-brand-image" src="./icon-192.png" alt="" width="192" height="192" />
    </span>
  `;
}

function hasDirectChild(parent, className) {
  return Array.from(parent.children).some((child) => child.classList.contains(className));
}

function enhanceScreenHeroArtwork() {
  const screen = document.querySelector("#app .screen");
  const top = screen?.querySelector(":scope > .top");
  if (!screen || !top || screen.matches(".profile-setup-screen")) return;

  const kind = detectBrandScreenKind(screen);
  const existing = top.querySelector(".product-hero-artwork");
  if (existing?.dataset.kind === kind) return;

  existing?.remove();
  top.insertAdjacentHTML("beforeend", renderHeroArtwork(kind));
}

function detectBrandScreenKind(screen) {
  const explicitKind = screen.dataset.screenKind;
  if (explicitKind === "event-notes") return "event";
  if (["home", "event", "settlement", "join-event", "new-event", "groups", "notifications"].includes(explicitKind)) {
    return explicitKind;
  }
  if (explicitKind === "admin") return explicitKind;
  if (["group-create", "group-edit", "people"].includes(explicitKind)) {
    return "group-workflow";
  }

  if (screen.matches(".profile-setup-screen") || screen.querySelector('[data-action="save-profile"]')) return "profile";
  if (screen.matches('[data-screen-kind="new-event"]') || screen.querySelector('[data-action="create-event"]')) return "new-event";
  if (screen.querySelector('[data-action="join-existing-event"]')) return "join-event";
  if (screen.querySelector('[data-action="create-group"]')) return "groups";
  if (screen.querySelector('[data-action="copy-settlement"]')) return "settlement";
  if (screen.querySelector(".event-workspace-nav, .event-command-grid, .event-insight-panel")) return "event";
  if (screen.querySelector('[data-action="new-event"]')) return "home";
  return "general";
}

function simplifyEmptyHome() {
  const screen = document.querySelector("#app .screen");
  if (!screen || !screen.querySelector('[data-action="new-event"]')) return;

  const hasEventRows = Boolean(screen.querySelector(".event-row"));
  const hasRecentEvent = Boolean(screen.querySelector(".recent-event-shortcut"));
  const hasStoredEvents = Boolean(
    screen.querySelector('[data-action="event-status-filter"]')
  );
  const shouldSimplify = !hasEventRows && !hasRecentEvent && !hasStoredEvents;
  const dashboard = screen.querySelector(".personal-dashboard");
  const personalActions = screen.querySelector(".personal-actions-section, .public-personal-actions");
  const eventSection =
    screen.querySelector(".event-list")?.closest(".section") ??
    screen.querySelector(".home-empty-events");
  const advancedEventFilter = screen.querySelector(".advanced-event-filter");
  const contextBar = screen.querySelector(".product-context-bar");
  const profilePanel = screen.querySelector(".profile-panel");
  const quickGuide = screen.querySelector(".product-home-kicker");
  screen.classList.toggle("product-empty-home", shouldSimplify);
  enhanceScreenHeroArtwork();
  if (!shouldSimplify) syncEmptyEventIllustration(eventSection, false);
  setHidden(dashboard, shouldSimplify);
  setHidden(personalActions, shouldSimplify);
  setSuppressed(advancedEventFilter, shouldSimplify);
  setSuppressed(contextBar, shouldSimplify);
  setSuppressed(profilePanel, shouldSimplify);
  setSuppressed(quickGuide, shouldSimplify);
  if (eventSection) eventSection.classList.toggle("home-empty-events", shouldSimplify);

  screen.querySelectorAll('[data-action="event-status-filter"]').forEach((button) => {
    setHidden(button, shouldSimplify);
  });

  if (!shouldSimplify || !eventSection) return;

  const eventCopy = eventSection.querySelector(".section-title-row .muted");
  setTextIfChanged(eventCopy, "פתח אירוע חדש. הזמנה שקיבלת נפתחת ישירות מהקישור.");

  const emptyState = eventSection.querySelector(".empty-state");
  const emptyLabel = emptyState?.querySelector("strong") ?? emptyState;
  setTextIfChanged(emptyLabel, "אין אירועים שלך עדיין");
  syncEmptyEventIllustration(eventSection, true);

  eventSection.querySelectorAll(".empty-state").forEach((node, index) => {
    setSuppressed(node, index > 0);
  });
}

function syncEmptyEventIllustration(eventSection, shouldShow) {
  const emptyState = eventSection?.querySelector(".empty-state");
  const existing = emptyState?.querySelector(".product-empty-icon");
  const productImage = emptyState?.querySelector("img");

  if (!emptyState) return;

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (productImage) {
    existing?.remove();
    return;
  }

  if (existing) return;
  emptyState.insertAdjacentHTML("afterbegin", renderEmptyEventArtwork());
}

function renderHeroArtwork(kind) {
  const className = kind === "home"
    ? "product-hero-artwork product-home-artwork"
    : `product-hero-artwork product-hero-artwork-${kind}`;

  return `
    <aside class="${className}" data-kind="${kind}" aria-hidden="true">
      ${renderHeroArtworkSvg(kind)}
    </aside>
  `;
}

function renderHeroArtworkSvg(kind) {
  if (kind === "home") return renderHomeArtwork();
  if (kind === "new-event") return renderCalendarArtwork();
  if (kind === "join-event") return renderJoinArtwork();
  if (kind === "groups") return renderGroupsArtwork();
  if (kind === "settlement") return renderSettlementArtwork();
  if (kind === "event") return renderReceiptArtwork();
  return renderGeneralArtwork();
}

function renderHomeArtwork() {
  return `
      <svg viewBox="0 0 260 220" focusable="false">
        <defs>
          <linearGradient id="home-art-green" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#0f8b7e" />
            <stop offset="1" stop-color="#06413d" />
          </linearGradient>
          <linearGradient id="home-art-aqua" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#a8ecee" />
            <stop offset="1" stop-color="#2bb8c2" />
          </linearGradient>
        </defs>
        <path class="home-art-loop" d="M34 98c30-48 74-48 96 0 22 48 66 48 96 0" />
        <circle class="home-art-orbit" cx="208" cy="54" r="8" />
        <circle class="home-art-face" cx="84" cy="76" r="24" />
        <path class="home-art-smile" d="M74 78c7 8 14 8 21 0" />
        <path class="home-art-body" d="M52 162c8-42 18-62 33-62 18 0 38 22 53 62" />
        <circle class="home-art-coin" cx="168" cy="132" r="42" />
        <path class="home-art-shekel" d="M159 110v44m0-32h18c10 0 15 5 15 14v18m-33-18h-13" />
        <path class="home-art-hand" d="M91 151c28 21 54 25 86 8 13-7 22-7 29-1" />
      </svg>
  `;
}

function renderCalendarArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <rect class="art-card art-card-main" x="54" y="44" width="142" height="126" rx="20" />
      <path class="art-line" d="M54 78h142M86 34v28M164 34v28" />
      <path class="art-line art-line-soft" d="M84 104h28M136 104h28M84 132h28M136 132h28" />
      <circle class="art-coin" cx="188" cy="144" r="38" />
      <path class="art-shekel" d="M178 122v42m0-30h17c9 0 14 5 14 13v17m-31-17h-12" />
      <circle class="art-dot art-dot-one" cx="54" cy="36" r="8" />
      <circle class="art-dot art-dot-two" cx="212" cy="74" r="6" />
    </svg>
  `;
}

function renderJoinArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <rect class="art-card art-card-main" x="62" y="38" width="136" height="144" rx="22" />
      <rect class="art-qr" x="88" y="64" width="22" height="22" rx="4" />
      <rect class="art-qr" x="150" y="64" width="22" height="22" rx="4" />
      <rect class="art-qr" x="88" y="126" width="22" height="22" rx="4" />
      <path class="art-line" d="M124 70h12M124 84h30M96 102h32M146 102h24M124 132h20M158 132h12M124 148h46" />
      <path class="art-arrow" d="M44 112h48m-16-17 17 17-17 17" />
      <circle class="art-coin" cx="190" cy="154" r="30" />
      <path class="art-check" d="m178 154 9 9 18-22" />
    </svg>
  `;
}

function renderGroupsArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <circle class="art-person art-person-main" cx="132" cy="82" r="30" />
      <circle class="art-person" cx="78" cy="98" r="24" />
      <circle class="art-person" cx="186" cy="98" r="24" />
      <path class="art-body art-body-main" d="M78 178c12-44 30-66 54-66s42 22 54 66" />
      <path class="art-body" d="M34 174c10-34 24-52 44-52 15 0 27 10 36 30" />
      <path class="art-body" d="M146 152c9-20 22-30 40-30 20 0 34 18 44 52" />
      <path class="art-loop" d="M48 54c28-24 54-24 78 0 24 24 50 24 78 0" />
      <circle class="art-coin" cx="204" cy="60" r="20" />
    </svg>
  `;
}

function renderReceiptArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <path class="art-receipt" d="M76 32h108a16 16 0 0 1 16 16v136l-18-10-18 10-18-10-18 10-18-10-18 10-18-10V48a16 16 0 0 1 16-16Z" />
      <path class="art-line" d="M104 72h66M104 102h52M104 132h72" />
      <circle class="art-coin" cx="76" cy="150" r="34" />
      <path class="art-shekel" d="M67 130v36m0-26h15c8 0 12 4 12 12v14m-27-14H56" />
      <path class="art-check" d="m156 156 12 12 28-36" />
    </svg>
  `;
}

function renderSettlementArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <circle class="art-coin art-coin-large" cx="130" cy="108" r="50" />
      <path class="art-shekel art-shekel-large" d="M118 78v62m0-42h26c14 0 21 7 21 20v22m-47-22H98" />
      <path class="art-arrow" d="M34 78h58m-18-18 18 18-18 18" />
      <path class="art-arrow art-arrow-reverse" d="M226 142h-58m18-18-18 18 18 18" />
      <rect class="art-card" x="40" y="128" width="62" height="42" rx="14" />
      <rect class="art-card" x="158" y="50" width="62" height="42" rx="14" />
      <path class="art-check" d="m110 166 12 12 28-38" />
    </svg>
  `;
}

function renderGeneralArtwork() {
  return `
    <svg viewBox="0 0 260 220" focusable="false">
      <rect class="art-card art-card-main" x="56" y="50" width="148" height="112" rx="24" />
      <path class="art-line" d="M84 86h92M84 116h64M84 146h84" />
      <circle class="art-coin" cx="188" cy="148" r="34" />
    </svg>
  `;
}

function renderEmptyEventArtwork() {
  return `
    <span class="product-empty-icon" aria-hidden="true">
      <svg viewBox="0 0 74 62" focusable="false">
        <rect x="14" y="13" width="46" height="38" rx="7" />
        <path d="M14 25h46" />
        <path d="M25 9v10M49 9v10" />
        <path d="M27 35h6M41 35h6M27 44h6M41 44h6" />
        <path class="empty-icon-spark" d="M8 18l5-5M7 40l6 3M63 14l5-5" />
      </svg>
    </span>
  `;
}

function setHidden(node, value) {
  if (!node || node.hidden === value) return;
  node.hidden = value;
}

function setSuppressed(node, value) {
  if (!node) return;
  setHidden(node, value);

  if (value) {
    node.style.setProperty("display", "none", "important");
    return;
  }

  node.style.removeProperty("display");
}

function setTextIfChanged(node, text) {
  if (!node || node.textContent === text) return;
  node.textContent = text;
}

function injectBrandStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .product-brand-lockup,
    .product-app-identity {
      display: flex;
      align-items: center;
    }

    .product-brand-lockup {
      gap: 12px;
      min-width: 0;
    }

    .product-header-profile-avatar {
      width: 44px;
      min-width: 44px;
      height: 44px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.96);
      border-radius: 50%;
      background: #e8f2ef;
      box-shadow: 0 7px 18px rgba(11, 74, 56, 0.16);
      cursor: pointer;
      transition:
        transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 180ms ease;
    }

    .product-header-profile-avatar > img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .product-header-profile-avatar:hover {
      transform: translateY(-1px);
      box-shadow: 0 9px 20px rgba(11, 74, 56, 0.2);
    }

    .product-header-profile-avatar:active {
      transform: translateY(0) scale(0.96);
    }

    .product-header-profile-avatar:focus-visible {
      outline: 3px solid rgba(33, 170, 166, 0.32);
      outline-offset: 3px;
    }

    .product-app-nav {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-inline-start: auto;
      min-width: 0;
    }

    .product-app-nav[hidden] {
      display: none !important;
    }

    .product-nav-button {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 12px;
      border: 1px solid rgba(18, 29, 27, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.76);
      color: #20302d;
      box-shadow: 0 8px 22px rgba(18, 29, 27, 0.06);
      font: inherit;
      font-size: 0.86rem;
      font-weight: 850;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    }

    .product-nav-button svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .product-nav-button:hover {
      transform: translateY(-1px);
      border-color: rgba(8, 123, 116, 0.22);
      background: #fff;
      box-shadow: 0 12px 28px rgba(18, 29, 27, 0.09);
    }

    .product-nav-button.is-active {
      border-color: rgba(8, 123, 116, 0.28);
      background: #e5f4f1;
      color: #07574e;
      box-shadow: inset 0 0 0 1px rgba(8, 123, 116, 0.08);
    }

    .product-brand-mark {
      position: relative;
      width: 54px;
      height: 54px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 8px;
      background:
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.28), transparent 36%),
        linear-gradient(145deg, #082f2b 0%, #087b74 56%, #0d9488 132%);
      color: #fffdf8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 16px 30px rgba(8, 123, 116, 0.22);
      font-size: 30px;
      font-weight: 950;
      line-height: 1;
    }

    .product-brand-mark::after {
      content: none;
    }

    .product-brand-symbol {
      position: relative;
      z-index: 1;
      width: 34px;
      height: 34px;
      display: block;
      overflow: visible;
    }

    .brand-symbol-loop,
    .brand-symbol-bridge,
    .brand-symbol-shekel {
      fill: none;
      stroke: currentColor;
      stroke-width: 5.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-symbol-loop-a {
      opacity: 0.94;
    }

    .brand-symbol-loop-b {
      opacity: 0.56;
    }

    .brand-symbol-coin {
      fill: #a8ecee;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 2.3;
    }

    .brand-symbol-shekel {
      stroke: #07574e;
      stroke-width: 2.8;
    }

    .brand-symbol-bridge {
      stroke: #71d9de;
      stroke-width: 4.4;
    }

    .product-brand-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
      line-height: 1.08;
    }

    .product-brand-copy strong {
      display: block;
      color: #121d1b;
      font-size: clamp(26px, 4vw, 40px);
      font-weight: 950;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .product-brand-copy small {
      color: #63756f;
      font-size: 0.94rem;
      font-weight: 850;
      white-space: nowrap;
    }

    .product-app-identity {
      justify-content: space-between;
      gap: 14px;
      margin: 0 0 14px;
      padding: 12px 14px;
      background: rgba(255, 254, 253, 0.88);
      border: 1px solid rgba(18, 29, 27, 0.08);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(18, 29, 27, 0.08);
      backdrop-filter: blur(14px);
    }

    .product-hero-artwork {
      position: absolute;
      inset-inline-start: clamp(14px, 3vw, 38px);
      bottom: -18px;
      width: min(28vw, 250px);
      min-width: 170px;
      pointer-events: none;
      opacity: 0.98;
      filter: drop-shadow(0 26px 44px rgba(0, 0, 0, 0.22));
    }

    .product-hero-artwork svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
    }

    .product-hero-artwork:not(.product-home-artwork) {
      width: min(24vw, 220px);
      min-width: 150px;
      opacity: 0.82;
    }

    .art-card,
    .art-card-main,
    .art-receipt {
      fill: rgba(255, 255, 255, 0.13);
      stroke: rgba(255, 255, 255, 0.34);
      stroke-width: 3;
    }

    .art-line,
    .art-arrow,
    .art-check,
    .art-shekel,
    .art-loop {
      fill: none;
      stroke: rgba(255, 253, 248, 0.9);
      stroke-width: 8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .art-line-soft {
      stroke-width: 6;
      opacity: 0.72;
    }

    .art-arrow {
      stroke: rgba(255, 224, 163, 0.88);
    }

    .art-arrow-reverse {
      opacity: 0.82;
    }

    .art-coin {
      fill: #f2c888;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 4;
    }

    .art-coin-large {
      stroke-width: 5;
    }

    .art-shekel,
    .art-shekel-large {
      stroke: #07574e;
    }

    .art-check {
      stroke: #bdecee;
    }

    .art-qr {
      fill: rgba(255, 253, 248, 0.84);
    }

    .art-person {
      fill: #f2c888;
      stroke: rgba(255, 255, 255, 0.56);
      stroke-width: 3;
    }

    .art-person-main {
      fill: #bdecee;
    }

    .art-body {
      fill: #087b74;
      stroke: rgba(255, 255, 255, 0.24);
      stroke-width: 3;
    }

    .art-body-main {
      opacity: 0.98;
    }

    .art-dot {
      fill: #71d9de;
    }

    .art-dot-two {
      fill: #f0a078;
    }

    .home-art-loop {
      fill: none;
      stroke: rgba(113, 217, 222, 0.82);
      stroke-width: 10;
      stroke-linecap: round;
    }

    .home-art-orbit {
      fill: #71d9de;
    }

    .home-art-face {
      fill: #f2c888;
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 3;
    }

    .home-art-smile,
    .home-art-shekel,
    .home-art-hand {
      fill: none;
      stroke: #fffdf8;
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .home-art-body {
      fill: url(#home-art-green);
      stroke: rgba(255, 255, 255, 0.24);
      stroke-width: 3;
    }

    .home-art-coin {
      fill: url(#home-art-aqua);
      stroke: rgba(255, 255, 255, 0.72);
      stroke-width: 5;
    }

    .home-art-shekel {
      stroke: #07574e;
      stroke-width: 8;
    }

    .home-art-hand {
      stroke-width: 9;
    }

    .product-empty-icon {
      width: 74px;
      height: 62px;
      display: inline-grid;
      place-items: center;
      margin-bottom: 10px;
      color: #6b7974;
      opacity: 0.9;
    }

    .product-empty-icon svg {
      width: 74px;
      height: 62px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .product-empty-icon rect {
      fill: rgba(255, 255, 255, 0.74);
    }

    .empty-icon-spark {
      stroke: rgba(8, 123, 116, 0.42);
    }

    .product-app-badge {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border: 1px solid #d7e2de;
      border-radius: 8px;
      background: #ecf7f4;
      color: #055c56;
      font-size: 0.84rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .product-gate-brand {
      align-self: start;
      margin-bottom: clamp(22px, 5vw, 54px);
    }

    .product-gate-brand .product-brand-mark {
      width: 64px;
      height: 64px;
      background:
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.42), transparent 34%),
        linear-gradient(145deg, #fffdf8 0%, #dff3ef 58%, #d9f2ed 132%);
      color: #07574e;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.68),
        0 18px 36px rgba(0, 0, 0, 0.18);
    }

    .product-gate-brand .product-brand-symbol {
      width: 40px;
      height: 40px;
    }

    .product-gate-brand .brand-symbol-panel {
      fill: rgba(8, 123, 116, 0.08);
      stroke: rgba(8, 123, 116, 0.18);
    }

    .product-gate-brand .brand-symbol-dot {
      fill: #cf5d3f;
      stroke: #fffdf8;
    }

    .product-gate-brand .product-brand-copy strong {
      color: #fffdf8;
      font-size: clamp(34px, 5vw, 56px);
    }

    .product-gate-brand .product-brand-copy small {
      color: rgba(255, 255, 255, 0.82);
      font-size: clamp(1rem, 2vw, 1.14rem);
    }

    @media (max-width: 560px) {
      .product-app-identity {
        align-items: flex-start;
        flex-direction: column;
      }

      .product-brand-copy strong {
        font-size: 28px;
        white-space: normal;
      }

      .product-brand-copy small {
        white-space: normal;
      }

      .product-app-badge {
        align-self: stretch;
      }

      .product-gate-brand .product-brand-mark {
        width: 56px;
        height: 56px;
      }
    }

    html.product-v1,
    html.product-v1-live {
      --brand-mark-bg:
        radial-gradient(circle at 26% 20%, rgba(255, 255, 255, 0.24), transparent 34%),
        linear-gradient(145deg, #092f2b 0%, #087b74 58%, #0e9388 132%);
    }

    html.product-v1 .product-app-identity .product-brand-mark,
    html.product-v1-live .product-app-identity .product-brand-mark,
    html.product-v1 .public-profile-hero .product-brand-mark,
    html.product-v1-live .public-profile-hero .product-brand-mark {
      background: var(--brand-mark-bg) !important;
      color: #fffdf8 !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        0 12px 26px rgba(8, 123, 116, 0.18) !important;
    }

    html.product-v1 .product-brand-mark::after,
    html.product-v1-live .product-brand-mark::after {
      content: none !important;
      display: none !important;
    }

    html.product-v1 .screen[data-product-screen="home"] .app-back-button,
    html.product-v1-live .screen[data-product-screen="home"] .app-back-button,
    html.product-v1 .screen[data-product-screen="home"] .product-home-button,
    html.product-v1-live .screen[data-product-screen="home"] .product-home-button {
      display: none !important;
    }

    html.product-v1 .screen[data-product-screen="home"] > .top .brand,
    html.product-v1-live .screen[data-product-screen="home"] > .top .brand {
      grid-column: 1 / -1 !important;
    }

    html.product-v1 .screen.product-empty-home,
    html.product-v1-live .screen.product-empty-home {
      max-width: 1080px !important;
      gap: 18px !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity,
    html.product-v1-live .screen.product-empty-home .product-app-identity {
      margin: 0 0 10px !important;
      padding: 4px 2px !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity .product-brand-mark,
    html.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-mark {
      width: 60px !important;
      height: 60px !important;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.26),
        0 18px 34px rgba(8, 123, 116, 0.2) !important;
    }

    html.product-v1 .screen.product-empty-home .product-app-identity .product-brand-copy strong,
    html.product-v1-live .screen.product-empty-home .product-app-identity .product-brand-copy strong {
      font-size: clamp(30px, 3.2vw, 42px) !important;
      letter-spacing: 0 !important;
    }

      html.product-v1 .screen.product-empty-home > .top,
      html.product-v1-live .screen.product-empty-home > .top {
      position: relative !important;
      min-height: clamp(260px, 34vw, 350px) !important;
      display: grid !important;
      place-items: center !important;
      padding: clamp(30px, 5vw, 54px) clamp(26px, 5vw, 60px) !important;
      text-align: center !important;
      overflow: hidden !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 8px !important;
      background:
        linear-gradient(120deg, rgba(255, 224, 163, 0.18), transparent 34%),
        linear-gradient(145deg, #061d1b 0%, #083d38 45%, #076b64 100%) !important;
      box-shadow:
        0 34px 70px rgba(8, 35, 32, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.16) !important;
    }

    html.product-v1 .screen.product-empty-home > .top::before,
    html.product-v1-live .screen.product-empty-home > .top::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: linear-gradient(90deg, transparent 0%, black 22%, black 100%);
      opacity: 0.56;
    }

    html.product-v1 .screen.product-empty-home > .top::after,
    html.product-v1-live .screen.product-empty-home > .top::after {
      content: "";
      position: absolute;
      inset-inline: 36px;
      bottom: 0;
      height: 4px;
      pointer-events: none;
      background: linear-gradient(90deg, #2bb8c2, #71d9de, #f46f61);
      border-radius: 8px 8px 0 0;
    }

    html.product-v1 .screen.product-empty-home > .top .brand,
    html.product-v1-live .screen.product-empty-home > .top .brand {
      position: relative !important;
      z-index: 1 !important;
      max-width: 780px !important;
      margin: 0 auto !important;
      padding-inline: clamp(0px, 17vw, 150px) !important;
    }

    html.product-v1 .screen.product-empty-home > .top .eyebrow,
    html.product-v1-live .screen.product-empty-home > .top .eyebrow {
      color: #71d9de !important;
      font-size: 0.88rem !important;
      font-weight: 900 !important;
    }

    html.product-v1 .screen.product-empty-home > .top h1,
    html.product-v1-live .screen.product-empty-home > .top h1 {
      max-width: 760px !important;
      color: #fffdf8 !important;
      font-size: clamp(38px, 6vw, 70px) !important;
      line-height: 0.98 !important;
      text-wrap: balance;
      text-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
    }

    html.product-v1 .screen.product-empty-home > .top .muted,
    html.product-v1-live .screen.product-empty-home > .top .muted {
      color: rgba(255, 255, 255, 0.78) !important;
      font-size: clamp(1rem, 1.8vw, 1.18rem) !important;
      font-weight: 800 !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions,
    html.product-v1-live .screen.product-empty-home .hero-actions {
      position: relative !important;
      z-index: 2 !important;
      width: min(620px, calc(100% - 36px)) !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 14px !important;
      margin: -72px auto 22px !important;
      padding: 0 !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions button,
    html.product-v1-live .screen.product-empty-home .hero-actions button {
      min-height: 72px !important;
      border-radius: 8px !important;
      font-size: 1.05rem !important;
      font-weight: 950 !important;
      box-shadow: 0 18px 44px rgba(8, 35, 32, 0.14) !important;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease !important;
    }

    html.product-v1 .screen.product-empty-home .hero-actions button:hover,
    html.product-v1-live .screen.product-empty-home .hero-actions button:hover {
      transform: translateY(-2px);
      box-shadow: 0 24px 56px rgba(8, 35, 32, 0.18) !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events,
    html.product-v1-live .screen.product-empty-home .home-empty-events {
      margin: 0 auto !important;
      width: min(680px, 100%) !important;
      background: rgba(255, 254, 250, 0.72) !important;
      border: 1px dashed rgba(8, 123, 116, 0.2) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events .section-title-row,
    html.product-v1-live .screen.product-empty-home .home-empty-events .section-title-row {
      display: none !important;
    }

    html.product-v1 .screen.product-empty-home .home-empty-events .empty-state,
    html.product-v1-live .screen.product-empty-home .home-empty-events .empty-state {
      min-height: 154px !important;
      display: grid !important;
      place-items: center !important;
      border: 0 !important;
      background: transparent !important;
      color: #43524e !important;
      font-weight: 900 !important;
    }

    @media (max-width: 700px) {
      html.product-v1 .screen.product-empty-home > .top,
      html.product-v1-live .screen.product-empty-home > .top {
        min-height: 260px !important;
        padding: 26px 22px !important;
      }

      .product-app-nav {
        width: 100%;
        justify-content: space-between;
        order: 2;
      }

      .product-nav-button {
        flex: 1 1 0;
        min-width: 0;
        padding-inline: 8px;
      }

      .product-hero-artwork {
        width: 156px;
        min-width: 0;
        bottom: -10px;
        opacity: 0.36;
      }

      html.product-v1 .screen.product-empty-home > .top .brand,
      html.product-v1-live .screen.product-empty-home > .top .brand {
        padding-inline: 0 !important;
      }

      html.product-v1 .screen.product-empty-home .hero-actions,
      html.product-v1-live .screen.product-empty-home .hero-actions {
        width: 100% !important;
        grid-template-columns: 1fr !important;
        margin: -28px auto 16px !important;
      }

      html.product-v1 .screen.product-empty-home .hero-actions button,
      html.product-v1-live .screen.product-empty-home .hero-actions button {
        min-height: 64px !important;
      }
    }
  `;
  document.head.append(style);
}
