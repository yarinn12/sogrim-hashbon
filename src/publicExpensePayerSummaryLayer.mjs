import { parseMoneyInput } from "./domain/money.mjs";
import { formatCurrency, normalizeCurrency } from "./domain/currencies.mjs";

const STYLE_ID = "public-expense-payer-summary-style";

injectStyle();
enhanceExpensePayerSummary();
document.addEventListener("input", (event) => {
  if (
    event.target.matches('[data-action="expense-total"]') ||
    event.target.matches('[data-action="expense-payer-amount"]')
  ) {
    enhanceExpensePayerSummary();
  }
});

new MutationObserver(() => enhanceExpensePayerSummary())
  .observe(document.body, { childList: true, subtree: true });

function enhanceExpensePayerSummary() {
  const modal = document.querySelector(".expense-modal");
  if (!modal) return;

  const payerList = modal.querySelector(".payer-list");
  const totalInput = modal.querySelector('[data-action="expense-total"]');
  const payerInputs = [...modal.querySelectorAll('[data-action="expense-payer-amount"]')];
  if (!payerList || !totalInput || payerInputs.length === 0) return;

  const summary = summarizePayers(
    totalInput.value,
    payerInputs.map((input) => input.value),
    modal.dataset.currency
  );
  let summaryNode = modal.querySelector(".expense-payer-summary");
  if (!summaryNode) {
    summaryNode = document.createElement("p");
    summaryNode.className = "expense-payer-summary";
    payerList.insertAdjacentElement("afterend", summaryNode);
  }

  if (summary.total <= 0) {
    if (!summaryNode.hidden) summaryNode.hidden = true;
    return;
  }

  if (summaryNode.hidden) summaryNode.hidden = false;
  const nextClassName = `expense-payer-summary ${summary.className}`;
  if (summaryNode.className !== nextClassName) summaryNode.className = nextClassName;
  if (summaryNode.textContent !== summary.text) summaryNode.textContent = summary.text;
}

function summarizePayers(totalInput, payerAmounts, currency) {
  const total = readMoney(totalInput);
  const paid = payerAmounts.reduce((sum, amount) => sum + readMoney(amount), 0);
  const difference = total - paid;
  const eventCurrency = normalizeCurrency(currency);

  if (total > 0 && difference === 0) {
    return {
      total,
      className: "is-balanced",
      text: "הסכום הושלם"
    };
  }

  if (difference > 0) {
    return {
      total,
      className: "is-warning",
      text: `נשאר לשייך ${formatCurrency(difference, eventCurrency)} למי ששילם.`
    };
  }

  return {
    total,
    className: "is-error",
    text: `סכומי המשלמים גבוהים ב-${formatCurrency(Math.abs(difference), eventCurrency)} מהסכום הכולל.`
  };
}

function readMoney(value) {
  try {
    return parseMoneyInput(value);
  } catch {
    return 0;
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .expense-payer-summary {
      margin: 10px 0 0;
      padding: 10px 12px;
      border: 1px solid rgba(10, 23, 21, 0.1);
      border-radius: 8px;
      color: #17201c;
      background: rgba(255, 255, 255, 0.72);
      font-size: 0.9rem;
      font-weight: 800;
    }

    .expense-payer-summary.is-balanced {
      color: #52605b;
      border-color: rgba(15, 23, 42, 0.12);
      background: #f3f5f4;
    }

    .expense-payer-summary.is-warning {
      color: #7a4e0b;
      border-color: rgba(194, 128, 28, 0.28);
      background: rgba(255, 244, 214, 0.74);
    }

    .expense-payer-summary.is-error {
      color: #9f2d20;
      border-color: rgba(180, 35, 24, 0.26);
      background: rgba(255, 238, 234, 0.82);
    }
  `;
  document.head.append(style);
}
