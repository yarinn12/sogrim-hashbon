import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-choice-picker-style";
const ENHANCED_CLASS = "app-choice-native";
const TRIGGER_CLASS = "app-choice-trigger";
const PICKER_CLASS = "app-choice-picker-backdrop";
const PICKER_HISTORY_KEY = "settleFriendsChoicePicker";
const SEARCHABLE_CHOICE_ACTIONS = new Set([
  "new-event-currency",
  "event-currency"
]);

let activeSelect = null;
let activeTrigger = null;
let activePicker = null;
let choiceHistoryActive = false;
let pendingHistoryClose = null;
let pickerClosing = false;
let refreshScheduled = false;
let pickerSequence = 0;
let pickerBackgroundState = null;

injectChoicePickerStyles();
enhanceChoiceSelects();

document.addEventListener("click", handleChoiceClick);
document.addEventListener("change", handleNativeChoiceChange);
document.addEventListener("keydown", handleChoiceKeydown, true);
window.addEventListener("popstate", handleChoiceHistoryBack, true);

new MutationObserver(scheduleChoiceRefresh).observe(document.documentElement, {
  childList: true,
  subtree: true
});

function scheduleChoiceRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    enhanceChoiceSelects();
  });
}

function enhanceChoiceSelects() {
  document.querySelectorAll("#app select:not([multiple])").forEach(enhanceChoiceSelect);
}

function enhanceChoiceSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return;

  let trigger =
    select.nextElementSibling?.classList.contains(TRIGGER_CLASS)
      ? select.nextElementSibling
      : null;

  select.classList.add(ENHANCED_CLASS);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  if (!trigger) {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = TRIGGER_CLASS;
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `
      <span class="app-choice-trigger-copy"></span>
      <span class="app-choice-trigger-arrow" aria-hidden="true"></span>
    `;
    select.insertAdjacentElement("afterend", trigger);
  }

  trigger.dataset.choiceSelectAction = select.dataset.action ?? "";
  trigger.dataset.choiceSelectIndex = select.dataset.index ?? "";
  trigger.setAttribute("aria-label", choiceAccessibleLabel(select));
  trigger.disabled = select.disabled;
  syncChoiceTrigger(select, trigger);
}

function handleChoiceClick(event) {
  const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    const select = trigger.previousElementSibling;
    if (select instanceof HTMLSelectElement && !select.disabled) {
      openChoicePicker(select, trigger);
    }
    return;
  }

  const optionButton = event.target.closest?.(".app-choice-option");
  if (optionButton && activePicker?.contains(optionButton)) {
    event.preventDefault();
    chooseOption(optionButton);
    return;
  }

  const closeButton = event.target.closest?.(".app-choice-picker-close");
  if (closeButton && activePicker?.contains(closeButton)) {
    event.preventDefault();
    closeChoicePicker();
    return;
  }

  if (event.target === activePicker) {
    closeChoicePicker();
  }
}

function handleNativeChoiceChange(event) {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  const trigger = select.nextElementSibling;
  if (trigger?.classList.contains(TRIGGER_CLASS)) {
    syncChoiceTrigger(select, trigger);
  }
}

function openChoicePicker(select, trigger) {
  if (activePicker) finishChoicePickerClose({ restoreFocus: false });
  pickerClosing = false;

  activeSelect = select;
  activeTrigger = trigger;
  pickerSequence += 1;

  const titleId = `app-choice-picker-title-${pickerSequence}`;
  const backdrop = document.createElement("div");
  backdrop.className = PICKER_CLASS;

  const dialog = document.createElement("section");
  dialog.className = "app-choice-picker";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.tabIndex = -1;

  const header = document.createElement("header");
  header.className = "app-choice-picker-header";

  const heading = document.createElement("h2");
  heading.id = titleId;
  heading.textContent = choicePickerTitle(select);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className =
    "icon-button modal-back-button app-choice-picker-close";
  closeButton.setAttribute("aria-label", "סגירת רשימת הבחירה");
  closeButton.innerHTML = `<span class="modal-control-icon" aria-hidden="true">${iconSvg("x")}</span>`;

  const list = document.createElement("div");
  list.className = "app-choice-options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", choicePickerTitle(select));

  const searchable = isSearchableChoiceSelect(select);
  Array.from(select.options).forEach((option) => {
    list.append(
      renderChoiceOption(option, select.value, {
        showStatusDot: !searchable
      })
    );
  });

  const optionsRegion = document.createElement("div");
  optionsRegion.className = "app-choice-options-region";
  optionsRegion.append(list);

  const emptyState = document.createElement("p");
  emptyState.className = "app-choice-search-empty";
  emptyState.setAttribute("role", "status");
  emptyState.setAttribute("aria-live", "polite");
  emptyState.textContent = "לא נמצא מטבע מתאים";
  emptyState.hidden = true;
  optionsRegion.append(emptyState);

  header.append(heading, closeButton);
  dialog.append(header);
  if (searchable) {
    dialog.classList.add("has-search");
    dialog.append(renderChoiceSearch(list, emptyState));
  }
  dialog.append(optionsRegion);
  backdrop.append(dialog);
  document.body.append(backdrop);

  activePicker = backdrop;
  dialog.focus({ preventScroll: true });
  hideChoicePickerBackground();
  trigger.setAttribute("aria-expanded", "true");
  document.body.classList.add("app-choice-picker-open");
  pushChoiceHistoryState();

  const selectedOption = list.querySelector(
    '.app-choice-option[aria-selected="true"]:not(:disabled)'
  );
  const firstOption = list.querySelector(".app-choice-option:not(:disabled)");
  (selectedOption ?? firstOption ?? closeButton).focus({ preventScroll: true });
}

function renderChoiceOption(
  option,
  selectedValue,
  { showStatusDot = true } = {}
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-choice-option";
  button.dataset.choiceValue = option.value;
  button.setAttribute("role", "option");
  button.setAttribute(
    "aria-selected",
    String(option.value === selectedValue)
  );
  button.disabled = option.disabled;

  const normalizedText = option.textContent?.replace(/\s+/g, " ").trim() ?? "";
  button.dataset.choiceSearch = normalizeChoiceSearch(
    `${normalizedText} ${option.value}`
  );
  const [primaryText, ...detailParts] = normalizedText
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const detailText = detailParts.join(" · ");

  const identity = document.createElement("span");
  identity.className = "app-choice-option-identity";
  if (detailText && showStatusDot) {
    const statusDot = document.createElement("span");
    statusDot.className = `app-choice-status-dot ${
      detailText.includes("אופליין") ? "is-offline" : "is-connected"
    }`;
    statusDot.setAttribute("aria-hidden", "true");
    identity.append(statusDot);
  }

  const copy = document.createElement("span");
  copy.className = "app-choice-option-copy";

  const primary = document.createElement("strong");
  primary.textContent = primaryText || normalizedText || "אפשרות";
  copy.append(primary);

  if (detailText) {
    const detail = document.createElement("small");
    detail.textContent = detailText;
    copy.append(detail);
  }

  identity.append(copy);

  const check = document.createElement("span");
  check.className = "app-choice-option-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";

  button.append(identity, check);
  if (normalizedText.startsWith("+")) {
    button.classList.add("is-add-option");
  }
  return button;
}

function renderChoiceSearch(list, emptyState) {
  const search = document.createElement("div");
  search.className = "app-choice-search";
  search.setAttribute("role", "search");

  const icon = document.createElement("span");
  icon.className = "app-choice-search-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = iconSvg("search");

  const input = document.createElement("input");
  input.type = "search";
  input.className = "app-choice-search-input";
  input.placeholder = "חיפוש לפי מטבע, מדינה או קוד";
  input.setAttribute("aria-label", "חיפוש מטבע");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("enterkeyhint", "search");
  input.addEventListener("input", () => {
    filterChoiceOptions(list, emptyState, input.value);
  });

  search.append(icon, input);
  return search;
}

function filterChoiceOptions(list, emptyState, query) {
  const normalizedQuery = normalizeChoiceSearch(query);
  let visibleCount = 0;

  list.querySelectorAll(".app-choice-option").forEach((option) => {
    const matches =
      !normalizedQuery ||
      (option.dataset.choiceSearch ?? "").includes(normalizedQuery);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  emptyState.hidden = visibleCount > 0;
}

function normalizeChoiceSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0591-\u05c7]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSearchableChoiceSelect(select) {
  return SEARCHABLE_CHOICE_ACTIONS.has(select?.dataset.action ?? "");
}

async function chooseOption(optionButton) {
  const originalSelect = activeSelect;
  const nextValue = optionButton.dataset.choiceValue ?? "";
  const closingPickerSequence = pickerSequence;
  if (!originalSelect) {
    await closeChoicePicker({ restoreFocus: false });
    return;
  }

  const shouldRestoreTrigger = !nextValue.startsWith("__add");
  const focusDescriptor = choiceSelectDescriptor(originalSelect);

  await closeChoicePicker({ restoreFocus: false });
  const currentSelect = findChoiceSelect(focusDescriptor) ??
    (originalSelect.isConnected ? originalSelect : null);
  if (!currentSelect) return;

  currentSelect.value = nextValue;
  currentSelect.dispatchEvent(new Event("change", { bubbles: true }));

  if (!shouldRestoreTrigger) return;
  requestAnimationFrame(() => {
    if (activePicker || pickerSequence !== closingPickerSequence) return;
    enhanceChoiceSelects();
    findChoiceSelect(focusDescriptor)
      ?.nextElementSibling?.focus({ preventScroll: true });
  });
}

function choiceSelectDescriptor(select) {
  return {
    action: select?.dataset.action ?? "",
    index: select?.dataset.index ?? "",
    name: select?.getAttribute("name") ?? ""
  };
}

function findChoiceSelect({ action, index, name }) {
  const candidates = Array.from(
    document.querySelectorAll("#app select:not([multiple])")
  );
  return candidates.find(
    (select) =>
      (select.dataset.action ?? "") === action &&
      (select.dataset.index ?? "") === index &&
      (select.getAttribute("name") ?? "") === name
  );
}

function closeChoicePicker({ restoreFocus = true } = {}) {
  if (pickerClosing) {
    return pendingHistoryClose?.promise ?? Promise.resolve();
  }

  if (choiceHistoryActive && window.history?.back) {
    pickerClosing = true;
    let resolveClose;
    const promise = new Promise((resolve) => {
      resolveClose = resolve;
    });
    pendingHistoryClose = {
      restoreFocus,
      resolve: resolveClose,
      promise
    };
    try {
      window.history.back();
    } catch {
      pickerClosing = false;
      pendingHistoryClose = null;
      finishChoicePickerClose({ restoreFocus });
      resolveClose();
    }
    return promise;
  }

  finishChoicePickerClose({ restoreFocus });
  return Promise.resolve();
}

function handleChoiceHistoryBack(event) {
  if (!choiceHistoryActive && !pendingHistoryClose) return;

  event.stopImmediatePropagation();
  choiceHistoryActive = false;
  pickerClosing = false;
  const pendingClose = pendingHistoryClose;
  pendingHistoryClose = null;
  finishChoicePickerClose({
    restoreFocus: pendingClose?.restoreFocus ?? true
  });
  pendingClose?.resolve();
}

function finishChoicePickerClose({ restoreFocus = true } = {}) {
  const trigger = activeTrigger;
  trigger?.setAttribute("aria-expanded", "false");
  activePicker?.remove();
  activePicker = null;
  activeSelect = null;
  activeTrigger = null;
  pickerClosing = false;
  document.body.classList.remove("app-choice-picker-open");
  restoreChoicePickerBackground();

  if (restoreFocus && trigger?.isConnected) {
    trigger.focus({ preventScroll: true });
  }
}

function hideChoicePickerBackground() {
  const appRoot = document.getElementById("app");
  if (!appRoot) return;
  pickerBackgroundState = {
    inert: appRoot.inert,
    ariaHidden: appRoot.getAttribute("aria-hidden")
  };
  appRoot.inert = true;
  appRoot.setAttribute("aria-hidden", "true");
}

function restoreChoicePickerBackground() {
  const appRoot = document.getElementById("app");
  const previous = pickerBackgroundState;
  pickerBackgroundState = null;
  if (!appRoot || !previous) return;
  appRoot.inert = previous.inert;
  if (previous.ariaHidden === null) {
    appRoot.removeAttribute("aria-hidden");
  } else {
    appRoot.setAttribute("aria-hidden", previous.ariaHidden);
  }
}

function pushChoiceHistoryState() {
  if (!window.history?.pushState) return;

  try {
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        [PICKER_HISTORY_KEY]: true
      },
      "",
      window.location.href
    );
    choiceHistoryActive = true;
  } catch {
    choiceHistoryActive = false;
  }
}

function handleChoiceKeydown(event) {
  if (!activePicker) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeChoicePicker();
    return;
  }

  if (event.key === "Tab") {
    const focusable = Array.from(
      activePicker.querySelectorAll(
        ".app-choice-picker-close, .app-choice-search-input, .app-choice-option:not(:disabled):not([hidden])"
      )
    );
    if (!focusable.length) return;

    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? currentIndex > 0
        ? currentIndex - 1
        : focusable.length - 1
      : currentIndex < focusable.length - 1
        ? currentIndex + 1
        : 0;
    event.preventDefault();
    focusable[nextIndex].focus({ preventScroll: true });
    return;
  }

  if (event.target.matches?.(".app-choice-search-input")) {
    if (event.key !== "ArrowDown") return;
    const firstVisibleOption = activePicker.querySelector(
      ".app-choice-option:not(:disabled):not([hidden])"
    );
    if (!firstVisibleOption) return;
    event.preventDefault();
    firstVisibleOption.focus({ preventScroll: true });
    return;
  }

  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const options = Array.from(
    activePicker.querySelectorAll(
      ".app-choice-option:not(:disabled):not([hidden])"
    )
  );
  if (!options.length) return;

  const currentIndex = options.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = options.length - 1;
  if (event.key === "ArrowDown") {
    nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
  }
  if (event.key === "ArrowUp") {
    nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
  }

  event.preventDefault();
  options[nextIndex].focus({ preventScroll: true });
}

function syncChoiceTrigger(select, trigger) {
  const selectedOption = select.selectedOptions[0] ?? select.options[0];
  const copy = trigger.querySelector(".app-choice-trigger-copy");
  if (copy) {
    copy.textContent =
      selectedOption?.textContent?.replace(/\s+/g, " ").trim() ||
      "בחרו אפשרות";
  }
  trigger.classList.toggle(
    "is-placeholder",
    !selectedOption || selectedOption.value === ""
  );
}

function choiceAccessibleLabel(select) {
  const explicitLabel = select.getAttribute("aria-label")?.trim();
  if (explicitLabel) return explicitLabel;

  const fieldLabel = select.closest("label")?.querySelector("span")?.textContent;
  return fieldLabel?.replace(/\s+/g, " ").trim() || "פתיחת רשימת בחירה";
}

function choicePickerTitle(select) {
  const action = select.dataset.action;
  if (["expense-payer-id", "quick-expense-payer"].includes(action)) {
    return "מי שילם?";
  }
  if (action === "quick-item-shared-by") return "למי שייכת המנה?";
  if (action === "merge-source") return "איזה שם מאחדים?";
  if (action === "merge-target") return "לאיזה משתמש מחברים?";
  if (action === "new-event-group") return "מאיזו קבוצה מתחילים?";
  if (["new-event-currency", "event-currency"].includes(action)) {
    return "בחירת מטבע";
  }
  if (action === "event-status-toggle") return "מצב האירוע";
  return choiceAccessibleLabel(select);
}

function injectChoicePickerStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .app-choice-native {
      position: absolute !important;
      width: 1px !important;
      min-width: 1px !important;
      height: 1px !important;
      min-height: 1px !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      clip-path: inset(50%) !important;
    }

    .app-choice-trigger {
      width: 100%;
      min-width: 0;
      min-height: 50px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 18px;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      border: 1px solid rgba(15, 72, 66, 0.18);
      border-radius: 12px;
      color: #152724;
      background: #ffffff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84);
      font: inherit;
      font-weight: 750;
      text-align: start;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        border-color 160ms ease,
        box-shadow 160ms ease,
        background-color 160ms ease;
    }

    .app-choice-trigger:hover {
      border-color: rgba(10, 132, 123, 0.36);
      background: #fbfefd;
    }

    .app-choice-trigger:focus-visible {
      outline: 3px solid rgba(34, 174, 178, 0.28);
      outline-offset: 2px;
      border-color: #168f88;
      box-shadow: 0 0 0 1px rgba(22, 143, 136, 0.1);
    }

    .app-choice-trigger:disabled {
      color: #82908c;
      background: #f2f5f4;
      cursor: not-allowed;
    }

    .app-choice-trigger-copy {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .app-choice-trigger-arrow {
      width: 9px;
      height: 9px;
      justify-self: end;
      border-inline-end: 2px solid currentColor;
      border-block-end: 2px solid currentColor;
      transform: rotate(45deg) translateY(-2px);
      opacity: 0.62;
    }

    body.app-choice-picker-open {
      overflow: hidden !important;
    }

    .app-choice-picker-backdrop {
      position: fixed;
      inset: 0;
      z-index: 520;
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top))
        16px max(18px, env(safe-area-inset-bottom));
      background: rgba(8, 25, 23, 0.48);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      animation: app-choice-fade-in 150ms ease-out both;
    }

    .app-choice-picker {
      width: min(460px, 100%);
      max-height: min(680px, calc(100dvh - 36px));
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      border: 1px solid rgba(15, 72, 66, 0.12);
      border-radius: 18px;
      color: #142522;
      background: #fbfdfc;
      box-shadow: 0 28px 80px rgba(7, 35, 31, 0.28);
      animation: app-choice-rise-in 190ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .app-choice-picker.has-search {
      grid-template-rows: auto auto minmax(0, 1fr);
    }

    .app-choice-picker-header {
      min-height: 68px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(15, 72, 66, 0.1);
      background: #ffffff;
    }

    .app-choice-picker-header h2 {
      margin: 0;
      color: #102c28;
      font-size: 1.2rem;
      font-weight: 900;
      letter-spacing: 0;
    }

    .app-choice-picker-close {
      width: 42px;
      min-width: 42px;
      height: 42px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(15, 72, 66, 0.12);
      border-radius: 50%;
      color: #29443f;
      background: #f3f8f6;
      font: inherit;
      font-size: 1.45rem;
      line-height: 1;
      cursor: pointer;
    }

    .app-choice-search {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      align-items: center;
      gap: 9px;
      margin: 12px 12px 0;
      padding: 0 13px;
      min-height: 50px;
      border: 1px solid rgba(15, 72, 66, 0.18);
      border-radius: 11px;
      background: #ffffff;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    .app-choice-search:focus-within {
      border-color: #168f88;
      box-shadow: 0 0 0 3px rgba(22, 143, 136, 0.14);
    }

    .app-choice-search-icon {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      color: #60736e;
    }

    .app-choice-search-icon .ui-icon-svg {
      width: 21px;
      height: 21px;
    }

    .app-choice-search-input {
      width: 100%;
      min-width: 0;
      min-height: 48px;
      padding: 0;
      border: 0;
      outline: 0;
      color: #152724;
      background: transparent;
      font: inherit;
      font-weight: 700;
      text-align: start;
    }

    .app-choice-search-input::placeholder {
      color: #7b8b87;
      opacity: 1;
    }

    .app-choice-search-input::-webkit-search-cancel-button {
      cursor: pointer;
    }

    .app-choice-options-region {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .app-choice-options {
      display: grid;
      grid-auto-rows: minmax(58px, auto);
      align-content: start;
      gap: 8px;
      padding: 12px;
    }

    .app-choice-option[hidden] {
      display: none !important;
    }

    .app-choice-search-empty {
      margin: 0;
      padding: 48px 20px;
      color: #6c7d78;
      font-size: 0.95rem;
      font-weight: 700;
      text-align: center;
    }

    .app-choice-option {
      width: 100%;
      min-height: 58px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px;
      align-items: center;
      gap: 12px;
      padding: 10px 13px;
      border: 1px solid transparent;
      border-radius: 12px;
      color: #182a27;
      background: transparent;
      font: inherit;
      text-align: start;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        border-color 150ms ease,
        background-color 150ms ease,
        transform 150ms ease;
    }

    .app-choice-option:hover,
    .app-choice-option:focus-visible {
      border-color: rgba(22, 143, 136, 0.2);
      background: #edf7f4;
    }

    .app-choice-option:focus-visible {
      outline: 3px solid rgba(22, 143, 136, 0.3);
      outline-offset: 2px;
    }

    .app-choice-option:active {
      transform: scale(0.99);
    }

    .app-choice-option[aria-selected="true"] {
      border-color: rgba(22, 143, 136, 0.26);
      background: #e5f3f0;
    }

    .app-choice-option:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .app-choice-option.is-add-option {
      color: #087b74;
      font-weight: 850;
    }

    .app-choice-option-identity {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 11px;
    }

    .app-choice-status-dot {
      width: 10px;
      min-width: 10px;
      height: 10px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #21b99c;
      box-shadow: 0 0 0 2px rgba(33, 185, 156, 0.16);
    }

    .app-choice-status-dot.is-offline {
      background: #9aa5a1;
      box-shadow: 0 0 0 2px rgba(117, 130, 125, 0.14);
    }

    .app-choice-option-copy {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .app-choice-option-copy strong,
    .app-choice-option-copy small {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .app-choice-option-copy strong {
      font-size: 1rem;
      font-weight: 850;
    }

    .app-choice-option-copy small {
      color: #6c7d78;
      font-size: 0.8rem;
      font-weight: 650;
    }

    .app-choice-option-check {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: transparent;
      background: transparent;
      font-size: 0.9rem;
      font-weight: 900;
    }

    .app-choice-option[aria-selected="true"] .app-choice-option-check {
      color: #ffffff;
      background: #087b74;
    }

    @keyframes app-choice-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes app-choice-rise-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 760px) {
      .app-choice-picker-backdrop {
        place-items: stretch;
        padding: 0;
        background: #fbfdfc;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }

      .app-choice-picker {
        width: 100%;
        max-height: none;
        height: 100dvh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .app-choice-picker-header {
        min-height: calc(64px + env(safe-area-inset-top));
        padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
      }

      .app-choice-options {
        grid-auto-rows: minmax(62px, auto);
        padding: 10px 12px calc(18px + env(safe-area-inset-bottom));
      }

      .app-choice-option {
        min-height: 62px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .app-choice-picker-backdrop,
      .app-choice-picker,
      .app-choice-trigger,
      .app-choice-option {
        animation-duration: 1ms !important;
        transition-duration: 1ms !important;
      }
    }
  `;
  document.head.append(style);
}
