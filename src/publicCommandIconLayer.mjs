const STYLE_ID = "public-command-icon-layer-style";

const COMMAND_ICONS = {
  "new-event": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  `,
  "create-event": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
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
      <path d="M8.5 12.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M3.8 19.2v-1.1c0-2.1 1.9-3.8 4.7-3.8s4.7 1.7 4.7 3.8v1.1" />
      <path d="M16.8 11.7a2.8 2.8 0 1 0 0-5.6" />
      <path d="M15.4 14.5c2.8.2 4.8 1.7 4.8 3.7v1" />
    </svg>
  `,
  "show-expense-form": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 4.5h10v15l-2.5-1.4L12 19.5l-2.5-1.4L7 19.5v-15Z" />
      <path d="M10 8.5h4" />
      <path d="M10 12h4" />
      <path d="M10 15.5h2.8" />
    </svg>
  `,
  "open-event-participants": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M16 20v-1.6c0-1.8-1.5-3.4-3.4-3.4H7.4C5.5 15 4 16.6 4 18.4V20" />
      <path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M20 20v-1.5c0-1.5-.9-2.8-2.2-3.4" />
      <path d="M15.7 5.2a3 3 0 0 1 0 5.6" />
    </svg>
  `,
  "open-event-share": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M18 8a3 3 0 1 0-2.8-4" />
      <path d="M6 15a3 3 0 1 0 2.8 4" />
      <path d="M8.7 9.1 15.3 6" />
      <path d="M8.7 14.9 15.3 18" />
      <path d="M6 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </svg>
  `,
  "open-event-settings": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.1l-1 .6a1.7 1.7 0 0 0-.8 1.6v.3h-3.8v-.3a1.7 1.7 0 0 0-.8-1.6l-1-.6a1.7 1.7 0 0 0-1.9.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15v-1.1a1.7 1.7 0 0 0-1.1-1.5l-.2-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9.1l1-.6a1.7 1.7 0 0 0 .8-1.6v-.3h3.8v.3a1.7 1.7 0 0 0 .8 1.6l1 .6a1.7 1.7 0 0 0 1.9-.1l.2-.1 2 3.4-.2.1a1.7 1.7 0 0 0-1.1 1.5V15Z" />
    </svg>
  `,
  settle: `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 12h9.5" />
      <path d="m11 8 4 4-4 4" />
      <path d="M17 6.5c1.6 1.2 2.5 3.1 2.5 5.5 0 4.1-3.4 7.5-7.5 7.5-2.2 0-4.2-1-5.5-2.5" />
      <path d="M7 17.5 6.5 14 10 14.5" />
    </svg>
  `
};

const BUTTON_ICON_SELECTOR = [
  ".hero-actions button[data-action]",
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
    if (!icon || card.querySelector(".command-card-icon")) return;

    ensureCommandCopy(card);

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

    const action = button.getAttribute("data-action");
    const icon = COMMAND_ICONS[action];
    if (!icon || button.querySelector(".button-action-icon")) return;

    const iconElement = document.createElement("span");
    iconElement.className = "button-action-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.innerHTML = icon;
    button.prepend(iconElement);
  });
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
      width: 42px;
      height: 42px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(8, 123, 116, 0.18);
      border-radius: 8px;
      background: linear-gradient(145deg, rgba(8, 123, 116, 0.14), rgba(248, 224, 143, 0.24));
      color: var(--accent-strong, #07574e);
      box-shadow: 0 10px 22px rgba(7, 87, 78, 0.12);
    }

    .hero-actions button[data-action],
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
      stroke-width: 1.9;
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
      stroke-width: 2.05 !important;
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
