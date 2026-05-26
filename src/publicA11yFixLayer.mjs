const appRoot = document.querySelector("#app");

applyA11yFixes();

if (appRoot) {
  new MutationObserver(applyA11yFixes).observe(appRoot, {
    childList: true,
    subtree: true
  });
}

function applyA11yFixes() {
  setAttributes('[data-action="cancel-edit-group"]', {
    type: "button",
    "aria-label": "סגור",
    title: "סגור"
  });
  setAttributes('[data-action="close-event-dialog"]', {
    type: "button",
    "aria-label": "סגור",
    title: "סגור"
  });
  setAttributes('[data-action="cancel-expense"]', {
    type: "button",
    "aria-label": "סגור",
    title: "סגור"
  });
  setAttributes('[data-action="profile-name"]', {
    name: "displayName",
    autocomplete: "name"
  });
  setAttributes('[data-public-profile-error], .field-error, .error', {
    "aria-live": "polite"
  });
  setAttributes('[data-action="expense-name"]', {
    name: "expenseName",
    autocomplete: "off"
  });
  setAttributes('[data-action="expense-total"]', {
    name: "expenseTotal",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off"
  });
  setAttributes('[data-action="event-guest-name"]', {
    name: "eventGuestName",
    "aria-label": "שם אורח",
    autocomplete: "name"
  });
  setDynamicNames('[data-action="expense-payer-id"]', "expensePayerId", {
    "aria-label": "משלם"
  });
  setDynamicNames('[data-action="expense-payer-amount"]', "expensePayerAmount", {
    "aria-label": "סכום ששולם",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off"
  });

  document.querySelectorAll("input[readonly]").forEach((input) => {
    if (input.value.includes("?event=") || input.value.includes("invite")) {
      input.setAttribute("name", "eventInviteUrl");
      input.setAttribute("aria-label", "קישור הצטרפות לאירוע");
    }
  });
}

function setAttributes(selector, attributes) {
  document.querySelectorAll(selector).forEach((element) => {
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    element.removeAttribute("autofocus");
  });
}

function setDynamicNames(selector, namePrefix, attributes) {
  document.querySelectorAll(selector).forEach((element, fallbackIndex) => {
    const index = element.dataset.index ?? fallbackIndex;
    setAttributesForElement(element, {
      ...attributes,
      name: `${namePrefix}${index}`
    });
  });
}

function setAttributesForElement(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}
