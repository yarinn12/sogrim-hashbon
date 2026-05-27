const STYLE_ID = "public-command-icon-layer-style";

const COMMAND_ICONS = {
  "new-event": `
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M12 8.5v7" />
      <path d="M8.5 12h7" />
    </svg>
  `,
  "create-event": `
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M12 8.5v7" />
      <path d="M8.5 12h7" />
    </svg>
  `,
  "join-event-screen": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 12h10" />
      <path d="m11 8 4 4-4 4" />
      <path d="M16 5h2.2A1.8 1.8 0 0 1 20 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H16" />
    </svg>
  `,
  "join-existing-event": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 12h10" />
      <path d="m11 8 4 4-4 4" />
      <path d="M16 5h2.2A1.8 1.8 0 0 1 20 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H16" />
    </svg>
  `,
  groups: `
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 19v-1.1c0-2.2 1.9-4 4.5-4s4.5 1.8 4.5 4V19" />
      <path d="M16.5 11.2a2.7 2.7 0 1 0 0-5.4" />
      <path d="M15.4 14.2c2.4.4 4.1 1.8 4.1 3.7V19" />
    </svg>
  `,
  "show-expense-form": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M8 4.5h8A2.5 2.5 0 0 1 18.5 7v13l-2.7-1.5L13.2 20 12 19.3 10.8 20l-2.6-1.5L5.5 20V7A2.5 2.5 0 0 1 8 4.5Z" />
      <path d="M9.5 9h5" />
      <path d="M9.5 13h5" />
      <path d="M9.5 17h3" />
    </svg>
  `,
  "open-event-participants": `
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 19v-1.1c0-2.2 1.9-4 4.5-4s4.5 1.8 4.5 4V19" />
      <path d="M16.5 11.2a2.7 2.7 0 1 0 0-5.4" />
      <path d="M15.4 14.2c2.4.4 4.1 1.8 4.1 3.7V19" />
    </svg>
  `,
  "open-event-share": `
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="6.5" cy="12" r="3" />
      <circle cx="17.5" cy="6.5" r="3" />
      <circle cx="17.5" cy="17.5" r="3" />
      <path d="m9.2 10.7 5.6-2.8" />
      <path d="m9.2 13.3 5.6 2.8" />
    </svg>
  `,
  "open-event-settings": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M4 7h16" />
      <circle cx="9" cy="7" r="2" />
      <path d="M4 12h16" />
      <circle cx="15" cy="12" r="2" />
      <path d="M4 17h16" />
      <circle cx="11" cy="17" r="2" />
    </svg>
  `,
  settle: `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 7h14" />
      <path d="M8 7 5.5 13h5L8 7Z" />
      <path d="M16 7 13.5 13h5L16 7Z" />
      <path d="M12 4.5v14" />
      <path d="M8.5 19.5h7" />
    </svg>
  `
};

const BUTTON_ICON_SELECTOR = [
  ".hero-actions button[data-action]",
  ".hero-actions button",
  ".personal-next-step button[data-action]",
  ".event-workspace-tab[data-action]",
  ".event-modal-header button[data-action]",
  ".settlement-hero-actions button[data-action]"
].join(",");

let scheduled = false;

setupCommandIconLayer();

function setupCommandIconLayer() {
  injectCommandIconStyles();
  enhanceCommandCards();

  const app = document.querySelector("#app");
  if (!app) return;

  new MutationObserver(scheduleEnhancement).observe(app, {
    childList: true,
    subtree: true
  });
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceCommandCards();
  });
}

function enhanceCommandCards() {
  hideDuplicateEventCard();
  enhanceActionButtons();

  document.querySelectorAll(".event-command-card").forEach((card) => {
    const action = card.getAttribute("data-action");
    const icon = COMMAND_ICONS[action];
    if (!icon) return;

    ensureCommandCopy(card);

    const existingIcon = card.querySelector(".command-card-icon");
    if (existingIcon) {
      existingIcon.innerHTML = icon;
      return;
    }

    const iconElement = document.createElement("span");
    iconElement.className = "command-card-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.innerHTML = icon;
    card.prepend(iconElement);
  });
}

function enhanceActionButtons() {
  document.querySelectorAll(BUTTON_ICON_SELECTOR).forEach((button) => {
    if (button.classList.contains("event-command-card")) return;

    const action = getButtonAction(button);
    const icon = COMMAND_ICONS[action];
    if (!icon) return;

    const existingIcon = button.querySelector(".button-action-icon");
    if (existingIcon) {
      existingIcon.innerHTML = icon;
      return;
    }

    const iconElement = document.createElement("span");
    iconElement.className = "button-action-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.innerHTML = icon;
    button.prepend(iconElement);
  });
}

function getButtonAction(button) {
  const action = button.getAttribute("data-action");
  if (action) return action;

  const label = button.textContent?.trim().replace(/\s+/g, " ") ?? "";
  if (label === "הצטרפות לאירוע") return "join-event-screen";
  if (label === "אירוע חדש") return "new-event";
  if (label === "קבוצות") return "groups";
  return "";
}

function hideDuplicateEventCard() {
  document.querySelectorAll('.event-command-card[data-action="duplicate-event"]').forEach((card) => {
    card.remove();
  });
}

function ensureCommandCopy(card) {
  if (card.querySelector(".event-command-copy")) return;

  const copy = document.createElement("span");
  copy.className = "event-command-copy";

  const title = card.querySelector(":scope > strong");
  const subtitle = card.querySelector(":scope > span:not(.command-card-icon)");
  if (title) copy.append(title);
  if (subtitle) copy.append(subtitle);
  if (copy.childNodes.length) card.append(copy);
}

function injectCommandIconStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .event-command-card[data-action="duplicate-event"] {
      display: none !important;
    }

    .event-command-card {
      display: grid !important;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      align-content: center;
      justify-items: stretch;
      gap: 12px;
    }

    .event-command-card .command-card-icon {
      position: relative;
      z-index: 1;
      width: 44px;
      height: 44px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(8, 123, 116, 0.18);
      border-radius: 10px;
      background:
        radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.82), transparent 34%),
        linear-gradient(145deg, rgba(8, 123, 116, 0.14), rgba(248, 224, 143, 0.22));
      color: var(--accent-strong, #07574e);
      box-shadow: 0 12px 24px rgba(7, 87, 78, 0.1);
    }

    .hero-actions button,
    .personal-next-step button[data-action],
    .event-workspace-tab[data-action],
    .settlement-hero-actions button[data-action] {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .button-action-icon {
      width: 22px;
      height: 22px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      color: currentColor;
    }

    .primary-button.event-command-card .command-card-icon {
      border-color: rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
      box-shadow: none;
    }

    .command-card-icon svg,
    .button-action-icon svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.85;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    html.product-v1 .event-command-card .command-card-icon,
    html.product-v1-live .event-command-card .command-card-icon {
      border-color: rgba(8, 123, 116, 0.18) !important;
      background:
        radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.8), transparent 38%),
        linear-gradient(145deg, rgba(8, 123, 116, 0.13), rgba(46, 111, 149, 0.08)) !important;
      box-shadow: 0 10px 22px rgba(7, 87, 78, 0.09) !important;
    }

    html.product-v1 .event-command-card[data-action="show-expense-form"],
    html.product-v1-live .event-command-card[data-action="show-expense-form"] {
      grid-column: span 2 !important;
    }

    html.product-v1 .primary-button.event-command-card .command-card-icon,
    html.product-v1-live .primary-button.event-command-card .command-card-icon {
      border-color: rgba(255, 255, 255, 0.26) !important;
      background: rgba(255, 255, 255, 0.16) !important;
      color: #ffffff !important;
      box-shadow: none !important;
    }

    html.product-v1 .button-action-icon svg,
    html.product-v1-live .button-action-icon svg,
    html.product-v1 .command-card-icon svg,
    html.product-v1-live .command-card-icon svg {
      stroke-width: 1.9 !important;
    }

    @media (max-width: 560px) {
      html.product-v1 .event-command-card[data-action="show-expense-form"],
      html.product-v1-live .event-command-card[data-action="show-expense-form"] {
        grid-column: span 1 !important;
      }
    }

    .event-command-card .event-command-copy {
      position: relative;
      z-index: 1;
      min-width: 0;
      display: grid;
      gap: 4px;
      color: inherit;
    }

    .event-command-card .event-command-copy > span,
    .product-v2 .event-command-card .event-command-copy > span {
      color: var(--muted, #6a756f);
      font-size: 0.82rem;
      font-weight: 800;
      line-height: 1.35;
    }

    .primary-button.event-command-card .event-command-copy > span,
    .product-v2 .primary-button.event-command-card .event-command-copy > span {
      color: rgba(255, 255, 255, 0.84);
    }
  `;
  document.head.append(style);
}
