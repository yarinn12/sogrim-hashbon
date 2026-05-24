const STYLE_ID = "public-command-icon-layer-style";

const COMMAND_ICONS = {
  "show-expense-form": `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 3h10v18l-2.5-1.6L12 21l-2.5-1.6L7 21V3Z" />
      <path d="M10 8h4" />
      <path d="M10 12h4" />
      <path d="M10 16h3" />
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
      <path d="M5 7h14" />
      <path d="M7 7l-2 5h6L9 7" />
      <path d="M17 7l-2 5h6l-2-5" />
      <path d="M12 4v16" />
      <path d="M8 20h8" />
    </svg>
  `
};

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

    .primary-button.event-command-card .command-card-icon {
      border-color: rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
      box-shadow: none;
    }

    .command-card-icon svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
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
