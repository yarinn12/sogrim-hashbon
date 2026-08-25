import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-command-icon-layer-style";

const ACTION_ICON_NAMES = {
  "new-event": "plus-square",
  "create-event": "plus-square",
  "join-event-screen": "log-in",
  "join-existing-event": "log-in",
  groups: "users",
  "new-group": "user-plus",
  "manage-people": "users-list",
  "show-expense-form": "receipt",
  "open-event-participants": "users",
  "open-event-share": "share",
  "open-event-settings": "sliders",
  settle: "transfers",
  "send-payment-reminder": "bell",
  "archive-group": "archive",
  "delete-event": "trash",
  "delete-expense": "trash",
  "leave-event": "log-out",
  "remove-event-participant": "user-minus",
  "remove-network-friend": "user-minus",
  "remove-offline-friend": "user-minus",
  "remove-participant": "user-minus",
  "delete-account-open": "trash"
};

const COMMAND_ICONS = Object.fromEntries(
  Object.entries(ACTION_ICON_NAMES).map(([action, iconName]) => [action, iconSvg(iconName)])
);

const BUTTON_ICON_SELECTOR = [
  ".hero-actions button[data-action]",
  ".hero-actions button",
  ".home-event-tools button[data-action]",
  ".groups-overview-actions button[data-action]",
  ".people-management-entry[data-action]",
  ".personal-next-step button[data-action]",
  ".event-workspace-tab[data-action]",
  ".event-modal-header button[data-action]",
  ".settlement-hero-actions button[data-action]",
  ".transfer-reminder-button[data-action]",
  ".danger-button[data-action]",
  ".friend-remove-button[data-action]",
  ".account-delete-button[data-account-action]"
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
      if (existingIcon.dataset.commandIcon !== action) {
        existingIcon.innerHTML = icon;
        existingIcon.dataset.commandIcon = action;
      }
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

    const existingCommandIcon = button.querySelector(".command-card-icon");
    if (existingCommandIcon) {
      if (existingCommandIcon.dataset.commandIcon !== action) {
        existingCommandIcon.innerHTML = icon;
        existingCommandIcon.dataset.commandIcon = action;
      }
      button.querySelector(".button-action-icon")?.remove();
      return;
    }

    const existingIcon = button.querySelector(".button-action-icon");
    if (existingIcon) {
      if (existingIcon.dataset.commandIcon !== action) {
        existingIcon.innerHTML = icon;
        existingIcon.dataset.commandIcon = action;
      }
      return;
    }

    const iconElement = document.createElement("span");
    iconElement.className = "button-action-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.dataset.commandIcon = action;
    iconElement.innerHTML = icon;
    button.prepend(iconElement);
  });
}

function getButtonAction(button) {
  const action =
    button.getAttribute("data-action") ||
    button.getAttribute("data-account-action");
  if (action) return action;

  const label = button.textContent?.trim().replace(/\s+/g, " ") ?? "";
  if (label === "הצטרפות לאירוע") return "join-event-screen";
  if (label === "אירוע חדש") return "new-event";
  if (label === "קבוצות" || label === "חברים") return "groups";
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
    .home-event-tools button[data-action],
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
