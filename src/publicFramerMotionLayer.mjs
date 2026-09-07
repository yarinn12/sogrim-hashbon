const STYLE_ID = "public-motion-polish-layer-style";
const ROOT_CLASS = "motion-polish-v2";
const ROW_SELECTOR = [
  ".event-row",
  ".expense-row[data-expense-id]",
  ".transfer-row",
  ".group-row",
  ".friend-row",
  ".notification-inbox-item",
  ".event-note-row",
  ".event-participant-candidate-row",
  ".personal-action-card",
  ".event-participant-roster-row",
  ".event-participant-link-candidate"
].join(",");
const DIALOG_SELECTOR = [
  ".expense-modal-backdrop",
  ".event-modal-backdrop",
  ".important-action-dialog-backdrop",
  ".event-removal-menu-backdrop",
  ".event-status-menu-backdrop",
  ".settlement-close-confirmation-backdrop",
  ".settlement-celebration-backdrop",
  ".accessibility-center-backdrop",
  ".install-app-backdrop",
  ".app-choice-picker-backdrop",
  "[data-account-delete-dialog]"
].join(",");
const MONEY_SELECTOR = [
  ".amount",
  ".summary-value",
  "[data-money]",
  "[data-motion-money]",
  ".transfer-amount",
  ".expense-row-amount",
  ".personal-action-amount",
  ".relationship-scorecard-value"
].join(",");
const SELECTION_SELECTOR = [
  "[role='radio']",
  "[role='checkbox']",
  "[role='switch']",
  "[aria-pressed]",
  "[aria-selected]",
  ".event-management-option",
  ".event-type-option",
  ".friend-add-mode-button",
  ".friends-hub-tab",
  ".event-note-pin-toggle"
].join(",");

const CSS = `
  html.motion-polish-v2 {
    --motion-fast: 110ms;
    --motion-state: 190ms;
    --motion-layout: 220ms;
    --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --motion-accent: var(--app-accent, var(--accent, #087b74));
    --motion-focus: rgba(8, 123, 116, 0.18);
  }

  html.motion-polish-v2 :where(
    button,
    summary,
    [role="button"],
    .primary-button,
    .secondary-button,
    .icon-button,
    .event-row,
    .group-row,
    .event-workspace-tab,
    .product-nav-button,
    .friends-hub-tab,
    .friend-add-mode-button,
    .event-management-option,
    .event-type-option,
    .event-note-pin-toggle,
    [role="radio"],
    [role="checkbox"],
    [role="switch"],
    [aria-pressed],
    [aria-selected]
  ) {
    transition-property: color, background-color, border-color, box-shadow, opacity, transform;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
  }

  html.motion-polish-v2 :where(
    button,
    summary,
    [role="button"],
    .primary-button,
    .secondary-button,
    .icon-button
  ):active:not(:disabled):not([aria-disabled="true"]):not([data-motion-static]) {
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

  html.motion-polish-v2 :where(
    [role="radio"],
    [role="checkbox"],
    [role="switch"],
    [aria-pressed],
    [aria-selected],
    .event-management-option,
    .event-type-option,
    .friend-add-mode-button,
    .friends-hub-tab,
    .event-note-pin-toggle
  ) :where(svg, .command-card-icon, .event-management-option-icon) {
    transition-property: color, opacity, transform;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
    transform-origin: center;
  }

  html.motion-polish-v2 :where(
    [aria-checked="true"],
    [aria-pressed="true"],
    [aria-selected="true"],
    .is-selected,
    .is-active
  ) :where(svg, .command-card-icon, .event-management-option-icon) {
    transform: scale(1.06);
  }

  html.motion-polish-v2 :where(
    [aria-expanded] [class*="chevron"],
    details > summary [class*="chevron"]
  ) {
    transition-property: opacity, transform;
    transition-duration: var(--motion-state);
    transition-timing-function: var(--motion-ease);
    transform-origin: center;
  }

  html.motion-polish-v2 :where(
    [aria-expanded="true"] [class*="chevron"],
    details[open] > summary [class*="chevron"]
  ) {
    transform: rotate(-90deg);
  }

  html.motion-polish-v2 .motion-control-busy {
    animation: motion-control-busy 920ms ease-in-out infinite alternate;
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
    animation: motion-row-settle 320ms var(--motion-ease);
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

  @keyframes motion-control-busy {
    from {
      opacity: 0.72;
    }
    to {
      opacity: 1;
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
let lastRowScreenKey = "";
let lastNoticeSignature = "";
let lastParticipantDetailSignature = "";
let lastParticipantAddSignature = "";
let lastExpenseStepSignature = "";
let lastAnimatedHomeHeroSignature = "";
let lastValidationSignature = "";
const animatedFallbackRows = new WeakSet();
const selectionStates = new WeakMap();
const disclosureStates = new WeakMap();
let moneyValues = new Map();
let moneyStateReady = false;
const activeMotionAnimations = new Map();

function animateProductMotion(target, keyframes, options) {
  const motion = globalThis.Motion;
  if (!motion?.animate || !document.contains(target) || document.hidden || prefersReducedMotion()) return;
  // Each element has one motion owner. Completing an old reveal leaves its
  // content visible, rather than freezing it halfway through a transition.
  const previous = activeMotionAnimations.get(target);
  if (previous) {
    activeMotionAnimations.delete(target);
    previous.complete();
  }
  const animation = motion.animate(target, keyframes, options);
  activeMotionAnimations.set(target, animation);
  const release = () => {
    if (activeMotionAnimations.get(target) === animation) activeMotionAnimations.delete(target);
  };
  Promise.resolve(animation).then(release, release);
  return animation;
}

function finishInactiveMotion() {
  const settleAll = document.hidden || prefersReducedMotion();
  for (const [target, animation] of activeMotionAnimations) {
    if (!settleAll && document.contains(target)) continue;
    activeMotionAnimations.delete(target);
    animation.complete();
  }
}

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
    finishInactiveMotion();
    if (document.hidden) return;
    if (document.querySelector("#app-splash")) return;
    animateHomeHero();
    animateScreenChange();
    animateDialogOpen();
    animateExpenseStep();
    animateParticipantDetail();
    animateParticipantAdd();
    animateNewRows();
    animateNotice();
    animateSelectionChanges();
    animateDisclosureChanges();
    animateValidationChange();
    animateMoneyChanges();
    syncBusyStates();
  });
}

async function animateHomeHero() {
  const target = document.querySelector(".product-home-screen .top");
  if (!target) return;

  const signature = [
    target.querySelector("h1")?.textContent?.trim() ?? "",
    ...[...target.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "")
  ].join("|");
  if (signature === lastAnimatedHomeHeroSignature) return;
  const initialContent = !lastAnimatedHomeHeroSignature;
  lastAnimatedHomeHeroSignature = signature;
  if (initialContent || prefersReducedMotion()) return;
  const motion = globalThis.Motion;
  if (!motion?.animate || !document.contains(target)) return;

  animateProductMotion(
    target,
    {
      opacity: [0.88, 1],
      y: [4, 0]
    },
    {
      duration: 0.22,
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
    animateProductMotion(
      section,
      {
        opacity: [0.78, 1],
        x: [8, 0]
      },
      {
        duration: 0.22,
        delay: Math.min(index * 0.02, 0.06),
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
    '[role="dialog"], [role="alertdialog"], .expense-modal, .event-modal, .important-action-dialog, .event-removal-menu'
  );
  if (!motion?.animate || !panel) return;

  animateProductMotion(backdrop, { opacity: [0.85, 1] }, { duration: 0.14, ease: [0.25, 1, 0.5, 1] });
  animateProductMotion(
    panel,
    {
      opacity: [0.94, 1],
      y: [12, 0],
      scale: [0.99, 1]
    },
    {
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1]
    }
  );
}

function animateNewRows() {
  const rows = [...document.querySelectorAll(ROW_SELECTOR)].slice(0, 40);
  const screenKey = currentMotionScreenKey();
  if (!rowStateReady || lastRowScreenKey !== screenKey) {
    rows.forEach(rememberRow);
    rowStateReady = true;
    lastRowScreenKey = screenKey;
    return;
  }

  const newRows = rows.filter((row) => !rowWasRemembered(row)).slice(0, 6);
  // Remember the entire visible batch, not just the animated subset. Otherwise
  // our own class changes keep animating the next six rows on every frame.
  rows.forEach(rememberRow);
  if (!newRows.length || prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;

  newRows.forEach((row, index) => {
    row.classList.add("motion-row-added");
    animateProductMotion(
      row,
      {
        opacity: [0.72, 1],
        y: [8, 0],
        scale: [0.99, 1]
      },
      {
        duration: 0.22,
        delay: Math.min(index * 0.016, 0.08),
        ease: [0.22, 1, 0.36, 1]
      }
    );
    window.setTimeout(() => row.classList.remove("motion-row-added"), 340);
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
    animateProductMotion(
      element,
      {
        opacity: [0.9, 1],
        y: [6, 0]
      },
      {
        duration: 0.22,
        delay: Math.min(index * 0.02, 0.06),
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
    animateProductMotion(
      element,
      {
        opacity: [0.9, 1],
        y: [8, 0]
      },
      {
        duration: 0.22,
        delay: Math.min(index * 0.02, 0.06),
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
  animateProductMotion(
    notice,
    {
      opacity: [0.55, 1],
      y: [4, 0]
    },
    {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1]
    }
  );
}

const rememberedRowKeys = new Set();

function rowKey(row) {
  const id =
    row.getAttribute("data-note-id") ||
    row.getAttribute("data-notification-id") ||
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
  if (key) {
    rememberedRowKeys.add(key);
    if (rememberedRowKeys.size > 1024) rememberedRowKeys.delete(rememberedRowKeys.values().next().value);
  }
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

function animateExpenseStep() {
  const dialog = document.querySelector(".expense-step-modal[data-expense-step]");
  if (!dialog) {
    lastExpenseStepSignature = "";
    return;
  }

  const signature = [
    dialog.getAttribute("data-event-id") || "",
    dialog.getAttribute("data-expense-step") || ""
  ].join(":");
  if (!signature || signature === lastExpenseStepSignature) return;
  lastExpenseStepSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  const body = dialog.querySelector(".expense-flow-body");
  if (!motion?.animate || !body) return;

  animateProductMotion(
    body,
    { opacity: [0.9, 1], y: [7, 0] },
    { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
  );
}

function selectedState(control) {
  return Boolean(
    control.matches(
      '[aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], [aria-current="page"], .is-selected, .is-active'
    )
  );
}

function animateSelectionChanges() {
  const controls = [...document.querySelectorAll(SELECTION_SELECTOR)].slice(0, 140);
  const motion = globalThis.Motion;

  controls.forEach((control) => {
    const selected = selectedState(control);
    const previous = selectionStates.get(control);
    selectionStates.set(control, selected);
    if (previous === undefined || previous === selected || !selected) return;
    if (prefersReducedMotion() || !motion?.animate) return;

    animateProductMotion(
      control,
      { scale: [0.98, 1] },
      { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
    );
  });
}

function animateDisclosureChanges() {
  const disclosures = [...document.querySelectorAll("details")].slice(0, 80);
  disclosures.forEach((disclosure) => {
    const open = disclosure.open;
    const previous = disclosureStates.get(disclosure);
    disclosureStates.set(disclosure, open);
    if (previous === undefined || previous === open || !open) return;
    animateDisclosurePanel(disclosure);
  });

  const expandedControls = [...document.querySelectorAll('[aria-expanded][aria-controls]')].slice(0, 40);
  expandedControls.forEach((control) => {
    const expanded = control.getAttribute("aria-expanded") === "true";
    const previous = disclosureStates.get(control);
    disclosureStates.set(control, expanded);
    if (previous === undefined || previous === expanded || !expanded) return;
    const panelId = control.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) animateDisclosureElements([panel]);
  });
}

function animateDisclosurePanel(disclosure) {
  const elements = [...disclosure.children]
    .filter((element) => !element.matches("summary"))
    .slice(0, 4);
  animateDisclosureElements(elements);
}

function animateDisclosureElements(elements) {
  if (!elements.length || prefersReducedMotion()) return;
  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  elements.forEach((element, index) => {
    animateProductMotion(
      element,
      { opacity: [0.82, 1], y: [6, 0] },
      {
        duration: 0.2,
        delay: Math.min(index * 0.015, 0.045),
        ease: [0.22, 1, 0.36, 1]
      }
    );
  });
}

function animateValidationChange() {
  const invalid = document.querySelector('#app [aria-invalid="true"]');
  if (!invalid) {
    lastValidationSignature = "";
    return;
  }

  const descriptionId = invalid.getAttribute("aria-describedby") || "";
  const description = descriptionId
    ? document.getElementById(descriptionId)?.textContent?.trim() || ""
    : "";
  const signature = [
    currentMotionScreenKey(),
    invalid.getAttribute("name") || invalid.id || invalid.getAttribute("data-action") || "field",
    description
  ].join(":");
  if (signature === lastValidationSignature) return;
  lastValidationSignature = signature;
  if (prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  animateProductMotion(
    invalid,
    { x: [0, -4, 3, -2, 0] },
    { duration: 0.24, ease: [0.25, 1, 0.5, 1] }
  );
}

function currentMotionScreenKey() {
  const screen = document.querySelector("#app > .screen");
  if (!screen) return "app";
  return [
    screen.getAttribute("data-screen-kind") || "screen",
    screen.getAttribute("data-event-id") || "",
    screen.getAttribute("data-event-creation-step") || ""
  ].join(":");
}

function moneyMotionKey(element, index, screenKey = currentMotionScreenKey()) {
  const scope = element.closest(
    "[data-expense-id], [data-transfer-id], [data-event-id], [data-participant-id], [data-group-id]"
  );
  const scopeKey = scope
    ? [
        scope.getAttribute("data-expense-id") || "",
        scope.getAttribute("data-transfer-id") || "",
        scope.getAttribute("data-event-id") || "",
        scope.getAttribute("data-participant-id") || "",
        scope.getAttribute("data-group-id") || ""
      ].join(":")
    : `position-${index}`;
  const classKey = [...element.classList].slice(0, 3).join(".") || element.tagName.toLowerCase();
  return `${screenKey}|${scopeKey}|${classKey}|${index}`;
}

function animateMoneyChanges() {
  const elements = [...document.querySelectorAll(MONEY_SELECTOR)].slice(0, 120);
  const nextValues = new Map();
  const changed = [];
  const screenKey = currentMotionScreenKey();

  elements.forEach((element, index) => {
    const key = moneyMotionKey(element, index, screenKey);
    const value = element.textContent?.replace(/\s+/g, " ").trim() || "";
    nextValues.set(key, value);
    if (moneyStateReady && moneyValues.has(key) && moneyValues.get(key) !== value) {
      changed.push(element);
    }
  });

  moneyValues = nextValues;
  if (!moneyStateReady) {
    moneyStateReady = true;
    return;
  }
  if (!changed.length || prefersReducedMotion()) return;

  const motion = globalThis.Motion;
  if (!motion?.animate) return;
  changed.slice(0, 10).forEach((element) => {
    animateProductMotion(
      element,
      { opacity: [0.68, 1], y: [-3, 0], scale: [0.985, 1] },
      { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
    );
  });
}

function syncBusyStates() {
  const busyText = /(?:טוענ|שומר|מחשב|מעלה|מעבד|מתחבר|שולח|מעדכן|יוצר|סוגר|loading|saving|sending|processing)/i;
  const candidates = [...document.querySelectorAll('#app [aria-busy], #app button[disabled]')]
    .slice(0, 120);
  const active = new Set();

  candidates.forEach((element) => {
    const isBusy =
      element.getAttribute("aria-busy") === "true" ||
      (element.matches("button:disabled") && busyText.test(element.textContent || ""));
    if (!isBusy) return;
    active.add(element);
    if (!element.classList.contains("motion-control-busy")) element.classList.add("motion-control-busy");
  });

  document.querySelectorAll(".motion-control-busy").forEach((element) => {
    if (!active.has(element)) element.classList.remove("motion-control-busy");
  });
}

function startMotionPolish() {
  activateMotionPolish();
  new MutationObserver(scheduleFramerMotionEnhancement).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "class",
      "aria-current",
      "aria-checked",
      "aria-pressed",
      "aria-selected",
      "aria-expanded",
      "aria-invalid",
      "aria-busy",
      "disabled",
      "open"
    ]
  });
  // CSS :active owns press/release feedback. The open-attribute observer owns
  // disclosures, avoiding a second reveal from a competing click callback.
  new MutationObserver(() => {
    finishInactiveMotion();
    scheduleFramerMotionEnhancement();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reducedMotion?.addEventListener) reducedMotion.addEventListener("change", finishInactiveMotion);
  else reducedMotion?.addListener?.(finishInactiveMotion);
  document.addEventListener("visibilitychange", () => {
    finishInactiveMotion();
    if (!document.hidden) scheduleFramerMotionEnhancement();
  });
  scheduleFramerMotionEnhancement();
}

// Keep all WebKit-visible side effects after every declaration and state
// container has initialized. This prevents Safari from running the first
// animation frame against a partially evaluated module during app startup.
startMotionPolish();
