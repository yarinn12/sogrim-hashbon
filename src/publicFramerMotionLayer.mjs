const STYLE_ID = "public-motion-polish-layer-style";
const ROOT_CLASS = "motion-polish-v2";
const ROW_SELECTOR = [
  ".event-row",
  ".expense-row[data-expense-id]",
  ".transfer-row",
  ".group-row",
  ".event-participant-roster-row",
  ".event-participant-link-candidate"
].join(",");
const DIALOG_SELECTOR = [
  ".expense-modal-backdrop",
  ".event-modal-backdrop",
  ".important-action-dialog-backdrop",
  ".event-removal-menu-backdrop"
].join(",");

const CSS = `
  html.motion-polish-v2 {
    --motion-fast: 110ms;
    --motion-state: 190ms;
    --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --motion-accent: #21aaa6;
    --motion-focus: rgba(33, 170, 166, 0.18);
  }

  html.motion-polish-v2 :where(
    button,
    .primary-button,
    .secondary-button,
    .icon-button,
    .event-row,
    .group-row,
    .event-workspace-tab,
    .product-nav-button
  ) {
    transition-property: color, background-color, border-color, box-shadow, opacity, transform;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2 :where(
    button,
    .primary-button,
    .secondary-button,
    .icon-button,
    .event-row,
    .group-row
  ):active:not(:disabled) {
    transform: translateY(1px) scale(0.96) !important;
    transition-duration: var(--motion-fast) !important;
  }

  html.motion-polish-v2 :where(input, select, textarea) {
    transition-property: color, background-color, border-color, box-shadow;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2 :where(input, select, textarea):focus {
    box-shadow: 0 0 0 3px var(--motion-focus) !important;
  }

  html.motion-polish-v2 .product-nav-button {
    position: relative !important;
    isolation: isolate;
  }

  html.motion-polish-v2 .product-nav-button::after {
    content: "" !important;
    position: absolute !important;
    inset-inline-start: 50% !important;
    inset-block-end: 3px !important;
    width: 18px !important;
    height: 2px !important;
    border-radius: 999px !important;
    background: var(--motion-accent) !important;
    opacity: 0;
    transform: translateX(50%) scaleX(0);
    transform-origin: center;
    transition-property: opacity, transform;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2
    .product-nav-button:is(.is-active, [aria-current="page"])::after {
    opacity: 1;
    transform: translateX(50%) scaleX(1);
  }

  html.motion-polish-v2 .product-nav-button svg,
  html.motion-polish-v2 .event-workspace-tab svg {
    transition-property: opacity, transform, filter;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2
    .product-nav-button:is(.is-active, [aria-current="page"])
    svg,
  html.motion-polish-v2
    .event-workspace-tab:is(.is-active, [aria-current="page"])
    svg {
    filter: drop-shadow(0 3px 5px rgba(33, 170, 166, 0.22));
    transform: scale(1.08);
  }

  html.motion-polish-v2 .event-workspace-tab::after {
    opacity: 0;
    transform: scaleX(0);
    transform-origin: center;
    transition-property: opacity, transform, background-color;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2
    .event-workspace-tab:is(.is-active, [aria-current="page"])::after {
    opacity: 1;
    transform: scaleX(1);
  }

  html.motion-polish-v2 :where(.amount, .summary-value, [data-money]) {
    font-variant-numeric: tabular-nums;
  }

  html.motion-polish-v2 .motion-row-added {
    animation: motion-row-settle 520ms var(--motion-ease);
  }

  @keyframes motion-row-settle {
    0% {
      background-color: rgba(33, 170, 166, 0.16);
      box-shadow: 0 0 0 1px rgba(33, 170, 166, 0.22);
    }
    100% {
      background-color: transparent;
      box-shadow: 0 0 0 1px transparent;
    }
  }

  @media (hover: hover) {
    html.motion-polish-v2 :where(.primary-button, .secondary-button):hover:not(:disabled) {
      transform: translateY(-1px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html.motion-polish-v2 *,
    html.motion-polish-v2 *::before,
    html.motion-polish-v2 *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }
  }
`;

let framerMotionScheduled = false;
let lastScreenKey = "";
let activeDialogSignature = "";
let rowStateReady = false;
let lastNoticeSignature = "";
let lastParticipantDetailSignature = "";
let lastParticipantAddSignature = "";
const animatedHomeHeroes = new WeakSet();
const animatedFallbackRows = new WeakSet();

activateMotionPolish();

new MutationObserver(scheduleFramerMotionEnhancement).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "aria-current"]
});
scheduleFramerMotionEnhancement();

function activateMotionPolish() {
  document.documentElement.classList.add(ROOT_CLASS);
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.append(document.createTextNode(CSS));
  document.head.append(style);
}

function scheduleFramerMotionEnhancement() {
  if (framerMotionScheduled) return;
  framerMotionScheduled = true;

  requestAnimationFrame(() => {
    framerMotionScheduled = false;
    if (document.querySelector("#app-splash")) return;
    animateHomeHero();
    animateScreenChange();
    animateDialogOpen();
    animateParticipantDetail();
    animateParticipantAdd();
    animateNewRows();
    animateNotice();
  });
}

async function animateHomeHero() {
  const target = document.querySelector(".product-home-screen .top");
  if (!target || animatedHomeHeroes.has(target) || prefersReducedMotion()) return;

  animatedHomeHeroes.add(target);
  const motion = globalThis.Motion;
  if (!motion?.animate || !document.contains(target)) return;

  motion.animate(
    target,
    {
      opacity: [0, 1],
      y: [12, 0]
    },
    {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  );
}

function animateScreenChange() {
  const screen = document.querySelector("#app > .screen");
  if (!screen) return;

  const nextKey = [
    screen.getAttribute("data-screen-kind") || "profile",
    screen.getAttribute("data-event-id") || "",
    screen.getAttribute("data-event-creation-step") || ""
  ].join(":");

  if (!lastScreenKey) {
    lastScreenKey = nextKey;
    return;
  }
  if (nextKey === lastScreenKey) return;
  lastScreenKey = nextKey;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;

  const sections = [...screen.children]
    .filter(
      (element) =>
        !element.matches(
          ".product-app-identity, .product-app-nav, .event-action-dock, " +
            DIALOG_SELECTOR
        )
    )
    .slice(0, 5);

  sections.forEach((section, index) => {
    motion.animate(
      section,
      {
        opacity: [0.78, 1],
        x: [12, 0]
      },
      {
        duration: 0.28,
        delay: Math.min(index * 0.035, 0.14),
        ease: [0.22, 1, 0.36, 1]
      }
    );
  });
}

function animateDialogOpen() {
  const backdrop = document.querySelector(DIALOG_SELECTOR);
  if (!backdrop) {
    activeDialogSignature = "";
    return;
  }

  const signature = [
    backdrop.className,
    backdrop.getAttribute("aria-label") || "",
    backdrop.querySelector("[data-event-id]")?.getAttribute("data-event-id") || ""
  ].join(":");
  if (signature === activeDialogSignature) return;
  activeDialogSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  const panel = backdrop.querySelector(
    ".expense-modal, .event-modal, .important-action-dialog, .event-removal-menu"
  );
  if (!motion?.animate || !panel) return;

  motion.animate(backdrop, { opacity: [0, 1] }, { duration: 0.18, ease: [0.25, 1, 0.5, 1] });
  motion.animate(
    panel,
    {
      opacity: [0.88, 1],
      y: [18, 0],
      scale: [0.985, 1]
    },
    {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  );
}

function animateNewRows() {
  const rows = [...document.querySelectorAll(ROW_SELECTOR)].slice(0, 40);
  if (!rowStateReady) {
    rows.forEach(rememberRow);
    rowStateReady = true;
    return;
  }

  const newRows = rows.filter((row) => !rowWasRemembered(row)).slice(0, 6);
  newRows.forEach(rememberRow);
  if (!newRows.length || prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;

  newRows.forEach((row, index) => {
    row.classList.add("motion-row-added");
    motion.animate(
      row,
      {
        opacity: [0.72, 1],
        y: [8, 0],
        scale: [0.99, 1]
      },
      {
        duration: 0.26,
        delay: Math.min(index * 0.04, 0.2),
        ease: [0.22, 1, 0.36, 1]
      }
    );
    window.setTimeout(() => row.classList.remove("motion-row-added"), 560);
  });
}

function animateParticipantDetail() {
  const detail = document.querySelector("[data-participant-detail-view]");
  if (!detail) {
    lastParticipantDetailSignature = "";
    return;
  }

  const signature = [
    detail.getAttribute("data-participant-detail-view") || "",
    detail.getAttribute("data-participant-id") || ""
  ].join(":");
  if (!signature || signature === lastParticipantDetailSignature) return;
  lastParticipantDetailSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  [...detail.children].slice(0, 6).forEach((element, index) => {
    motion.animate(
      element,
      {
        opacity: [0, 1],
        y: [6, 0]
      },
      {
        duration: 0.24,
        delay: Math.min(index * 0.035, 0.14),
        ease: [0.22, 1, 0.36, 1]
      }
    );
  });
}

function animateParticipantAdd() {
  const view = document.querySelector("[data-participant-add-view]");
  if (!view) {
    lastParticipantAddSignature = "";
    return;
  }

  const signature = view.closest(".event-modal")?.querySelector("h2")?.textContent?.trim() || "participant-add";
  if (signature === lastParticipantAddSignature) return;
  lastParticipantAddSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  const choices = view.querySelectorAll(
    ".event-participant-add-options > *, .participant-add-privacy-note"
  );
  choices.forEach((element, index) => {
    motion.animate(
      element,
      {
        opacity: [0, 1],
        y: [8, 0]
      },
      {
        duration: 0.28,
        delay: Math.min(index * 0.045, 0.16),
        ease: [0.22, 1, 0.36, 1]
      }
    );
  });
}

function animateNotice() {
  const notice = document.querySelector(
    "#app .notice[role='status'], #app [role='status'].sync-status"
  );
  if (!notice) {
    lastNoticeSignature = "";
    return;
  }

  const signature = `${notice.className}:${notice.textContent?.trim() || ""}`;
  if (!signature.trim() || signature === lastNoticeSignature) return;
  lastNoticeSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  motion.animate(
    notice,
    {
      opacity: [0.55, 1],
      y: [4, 0]
    },
    {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1]
    }
  );
}

const rememberedRowKeys = new Set();

function rowKey(row) {
  const id =
    row.getAttribute("data-expense-id") ||
    row.getAttribute("data-event-id") ||
    row.getAttribute("data-transfer-id") ||
    row.getAttribute("data-group-id") ||
    row.getAttribute("data-participant-id") ||
    row.getAttribute("data-target-participant-id") ||
    row.querySelector("[data-expense-id], [data-event-id], [data-transfer-id], [data-group-id]")
      ?.getAttribute("data-expense-id") ||
    row.querySelector("[data-event-id]")?.getAttribute("data-event-id") ||
    row.querySelector("[data-transfer-id]")?.getAttribute("data-transfer-id") ||
    row.querySelector("[data-group-id]")?.getAttribute("data-group-id") ||
    row.querySelector("[data-participant-id]")?.getAttribute("data-participant-id");
  const type = [...row.classList].find((name) => name.endsWith("-row")) || "row";
  return id ? `${type}:${id}` : "";
}

function rememberRow(row) {
  const key = rowKey(row);
  if (key) rememberedRowKeys.add(key);
  else animatedFallbackRows.add(row);
}

function rowWasRemembered(row) {
  const key = rowKey(row);
  return key ? rememberedRowKeys.has(key) : animatedFallbackRows.has(row);
}

function prefersReducedMotion() {
  return Boolean(
    document.documentElement.classList.contains("accessibility-reduced-motion") ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}
