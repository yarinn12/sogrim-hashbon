const EXPENSE_GUEST_STYLE_ID = "public-expense-guest-layer-style";

let lastAddedGuestName = "";
let enhancementQueued = false;

setupExpenseGuestLayer();

function setupExpenseGuestLayer() {
  injectExpenseGuestStyles();
  enhanceExpenseDialog();

  document.addEventListener("click", rememberExpenseGuestName, true);

  const app = document.querySelector("#app");
  if (!app) return;

  new MutationObserver(scheduleEnhancement).observe(app, {
    childList: true,
    subtree: true
  });
}

function scheduleEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  requestAnimationFrame(() => {
    enhancementQueued = false;
    enhanceExpenseDialog();
    autoSelectAddedGuest();
  });
}

function enhanceExpenseDialog() {
  const modal = document.querySelector(".expense-modal");
  if (!modal || modal.querySelector(".expense-guest-box")) return;

  const saveButton = modal.querySelector('[data-action="save-expense"][data-event-id]');
  const eventId = saveButton?.getAttribute("data-event-id");
  if (!eventId) return;

  const sharedSection = [...modal.querySelectorAll("section.section")].find((section) =>
    section.querySelector('[data-action="expense-shared"]')
  );
  if (!sharedSection) return;

  const box = document.createElement("section");
  box.className = "expense-guest-box";
  box.innerHTML = `
    <div>
      <strong>חסר מישהו?</strong>
      <span>מוסיפים אורח בלי לצאת מההוצאה. הוא יופיע מיד ברשימות כאן.</span>
    </div>
    <div class="inline-actions expense-guest-actions">
      <input class="guest-input" data-action="event-guest-name" placeholder="שם אורח" />
      <button class="secondary-button" data-action="event-add-guest" data-event-id="${eventId}">הוסף אורח להוצאה</button>
    </div>
  `;

  sharedSection.after(box);
}

function rememberExpenseGuestName(event) {
  const button = event.target.closest?.('.expense-guest-box [data-action="event-add-guest"]');
  if (!button) return;

  const input = button.closest(".expense-guest-box")?.querySelector('[data-action="event-guest-name"]');
  lastAddedGuestName = input?.value.trim() ?? "";
}

function autoSelectAddedGuest() {
  if (!lastAddedGuestName) return;

  const checkbox = [...document.querySelectorAll('[data-action="expense-shared"]')].find((input) => {
    const labelText = input.closest("label")?.innerText.trim() ?? "";
    return labelText === lastAddedGuestName;
  });
  if (!checkbox) return;

  lastAddedGuestName = "";
  if (checkbox.checked) return;

  checkbox.checked = true;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
}

function injectExpenseGuestStyles() {
  if (document.getElementById(EXPENSE_GUEST_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = EXPENSE_GUEST_STYLE_ID;
  style.textContent = `
    .expense-guest-box {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      padding: 14px;
      border: 1px solid rgba(8, 123, 116, 0.14);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(8, 123, 116, 0.08), rgba(207, 93, 63, 0.06)),
        rgba(255, 255, 255, 0.72);
    }

    .expense-guest-box strong,
    .expense-guest-box span {
      display: block;
    }

    .expense-guest-box span {
      color: var(--muted, #63756f);
      font-weight: 700;
      font-size: 0.9rem;
    }

    .expense-guest-actions {
      align-items: stretch;
    }

    .expense-guest-actions .guest-input {
      min-width: min(260px, 100%);
    }
  `;
  document.head.append(style);
}
