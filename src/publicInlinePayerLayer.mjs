const INLINE_ADD_VALUE = "__inline-add-payer__";
const NATIVE_ADD_VALUE = "__add-payer-participant__";
const pendingInlinePayer = {
  index: null,
  name: ""
};

injectInlinePayerStyles();
enhanceInlinePayerSelectors();

const inlinePayerObserver = new MutationObserver(() => {
  enhanceInlinePayerSelectors();
  applyPendingInlinePayer();
});

inlinePayerObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

document.addEventListener(
  "change",
  (event) => {
    const select = event.target.closest?.('select[data-action="expense-payer-id"]');
    if (!select || select.value !== INLINE_ADD_VALUE) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openInlinePayerAdd(select);
  },
  true
);

document.addEventListener("click", (event) => {
  const button = event.target.closest?.('[data-action="expense-inline-add-payer"]');
  if (!button) return;

  event.preventDefault();
  addInlinePayerFromDom(button);
});

function enhanceInlinePayerSelectors() {
  document.querySelectorAll('select[data-action="expense-payer-id"]').forEach((select) => {
    if (select.querySelector(`option[value="${NATIVE_ADD_VALUE}"]`)) return;
    if (select.querySelector(`option[value="${INLINE_ADD_VALUE}"]`)) return;

    const option = document.createElement("option");
    option.value = INLINE_ADD_VALUE;
    option.textContent = "+ הוסף שם חדש";
    select.append(option);
  });
}

function openInlinePayerAdd(select) {
  const row = select.closest(".payer-row");
  if (!row) return;

  row.querySelector(".payer-inline-add")?.remove();

  const panel = document.createElement("div");
  panel.className = "payer-inline-add";
  panel.innerHTML = `
    <input class="guest-input" data-action="expense-inline-payer-name" placeholder="שם משלם חדש" />
    <button class="secondary-button" type="button" data-action="expense-inline-add-payer">הוסף</button>
  `;

  row.append(panel);
  panel.querySelector("input")?.focus();
}

function addInlinePayerFromDom(button) {
  const row = button.closest(".payer-row");
  const select = row?.querySelector('select[data-action="expense-payer-id"]');
  const input = row?.querySelector('[data-action="expense-inline-payer-name"]');
  const name = normalizeInlinePayerName(input?.value);

  if (!name) {
    input?.focus();
    input?.classList.add("is-invalid");
    return;
  }

  const guestInput =
    document.querySelector('.expense-modal [data-action="event-guest-name"]') ??
    document.querySelector('[data-action="event-guest-name"]');
  const guestButton =
    document.querySelector('.expense-modal [data-action="event-add-guest"]') ??
    document.querySelector('[data-action="event-add-guest"]');

  if (!select || !guestInput || !guestButton) return;

  pendingInlinePayer.index = select.dataset.index ?? null;
  pendingInlinePayer.name = name;
  guestInput.value = name;
  guestInput.dispatchEvent(new Event("input", { bubbles: true }));
  guestButton.click();

  requestAnimationFrame(applyPendingInlinePayer);
  setTimeout(applyPendingInlinePayer, 30);
}

function applyPendingInlinePayer() {
  if (pendingInlinePayer.index === null || !pendingInlinePayer.name) return;

  const select = document.querySelector(
    `select[data-action="expense-payer-id"][data-index="${pendingInlinePayer.index}"]`
  );
  if (!select) return;

  const option = Array.from(select.options).find(
    (item) => normalizeInlinePayerName(item.textContent) === pendingInlinePayer.name
  );
  if (!option) return;

  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  pendingInlinePayer.index = null;
  pendingInlinePayer.name = "";
}

function normalizeInlinePayerName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function injectInlinePayerStyles() {
  if (document.querySelector("[data-inline-payer-style]")) return;

  const style = document.createElement("style");
  style.dataset.inlinePayerStyle = "true";
  style.textContent = `
    .payer-inline-add {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: stretch;
      padding: 10px;
      border: 1px solid rgba(8, 123, 116, 0.16);
      border-radius: 8px;
      background: rgba(8, 123, 116, 0.06);
    }

    .payer-inline-add .is-invalid {
      border-color: #b42318;
      box-shadow: 0 0 0 4px rgba(180, 35, 24, 0.12);
    }

    @media (max-width: 680px) {
      .payer-inline-add {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}
