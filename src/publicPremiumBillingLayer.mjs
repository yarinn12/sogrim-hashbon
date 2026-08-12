import { loadRuntimeConfig } from "./data/localStore.mjs";
import { runAfterFirstInteractiveScreen } from "./data/startupScheduler.mjs";
import {
  loadPremiumProduct,
  managePremiumSubscription,
  observePremiumPurchases,
  premiumBillingAvailable,
  purchasePremium,
  restorePremium
} from "./data/premiumBillingStore.mjs";
import { iconSvg } from "./uiIcons.mjs";

const STYLE_ID = "public-premium-billing-style";
const ROOT_ATTRIBUTE = "data-premium-billing";

let runtimeConfig = null;
let product = null;
let loadingProduct = false;
let busyAction = "";
let errorMessage = "";
let noticeMessage = "";
let purchaseListener = null;
let purchaseListenerUserId = "";
let purchaseListenerRequest = null;
let reconcileRequest = null;
let reconciledUserId = "";

setupPremiumBilling();

function setupPremiumBilling() {
  injectStyles();
  document.addEventListener("settle-friends:screen-rendered", enhanceProfile);
  document.addEventListener("settle-friends:entitlements-changed", enhanceProfile);
  document.addEventListener("click", handleAction);
  runAfterFirstInteractiveScreen(() => initialize().catch(() => {}));
}

async function initialize() {
  runtimeConfig = await loadRuntimeConfig();
  if (!premiumBillingAvailable(runtimeConfig)) {
    product = null;
    errorMessage = "";
    noticeMessage = "";
    await removePurchaseListener();
    reconciledUserId = "";
    removePremiumSection();
    return;
  }
  await attachPurchaseListener();
  await ensureProduct();
  enhanceProfile();
  reconcilePremium({ silent: true }).catch(() => {});
}

async function ensureProduct() {
  if (product || loadingProduct || !premiumBillingAvailable(runtimeConfig)) {
    return product;
  }
  loadingProduct = true;
  try {
    product = await loadPremiumProduct(runtimeConfig);
    errorMessage = "";
  } catch (error) {
    errorMessage = billingErrorMessage(error, "load");
  } finally {
    loadingProduct = false;
  }
  return product;
}

function enhanceProfile() {
  const panel = document.querySelector(
    "#app .profile-edit-screen .profile-setup-panel"
  );
  if (!panel || !premiumBillingAvailable(runtimeConfig)) return;

  const existing = panel.querySelector(`[${ROOT_ATTRIBUTE}]`);
  const markup = premiumSection();
  if (existing) {
    existing.outerHTML = markup;
    return;
  }
  panel.insertAdjacentHTML("beforeend", markup);
}

function removePremiumSection() {
  document.querySelector(`[${ROOT_ATTRIBUTE}]`)?.remove();
}

function premiumSection() {
  const subscriptionActive = Boolean(
    globalThis.SogrimMonetization?.status?.subscriptionActive
  );
  const trialLabel = freeTrialLabel(product?.freeTrialPeriod);
  const title = subscriptionActive ? "Premium פעיל" : "סוגרים חשבון Premium";
  const detail = subscriptionActive
    ? "המנוי מחובר לחשבון שלך וניתן לניהול דרך Google Play."
    : product
      ? trialLabel
        ? `${trialLabel}, ואז ${product.formattedPrice} ${billingPeriodLabel(product.billingPeriod)}.`
        : `ללא פרסומות, ${product.formattedPrice} ${billingPeriodLabel(product.billingPeriod)}.`
      : "מנוי ללא פרסומות, עם שחזור מאובטח דרך Google Play.";

  return `
    <section class="premium-billing-section" ${ROOT_ATTRIBUTE} aria-labelledby="premium-billing-title" aria-busy="${busyAction ? "true" : "false"}">
      <span class="premium-billing-icon" aria-hidden="true">${sparkleIcon()}</span>
      <div class="premium-billing-copy">
        <small>המנוי שלך</small>
        <strong id="premium-billing-title">${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      <div class="premium-billing-actions">
        ${
          subscriptionActive
            ? `<button class="secondary-button" type="button" data-premium-action="manage" ${busyAction ? "disabled" : ""}>
                ${busyAction === "manage" ? "פותחים את Google Play..." : "ניהול המנוי"}
              </button>`
            : `${product
                ? `<button class="primary-button" type="button" data-premium-action="purchase" ${busyAction ? "disabled" : ""}>
                    ${busyAction === "purchase"
                      ? "פותחים את Google Play..."
                      : trialLabel
                        ? "התחלת ניסיון"
                        : "הפעלת Premium"}
                  </button>`
                : `<button class="primary-button" type="button" data-premium-action="retry" ${busyAction ? "disabled" : ""}>
                    ${busyAction === "retry" ? "טוענים..." : "טעינה מחדש"}
                  </button>`}
              <button class="text-button" type="button" data-premium-action="restore" ${busyAction ? "disabled" : ""}>
                ${busyAction === "restore" ? "משחזרים..." : "שחזור רכישה"}
              </button>`
        }
      </div>
      ${noticeMessage ? `<p class="premium-billing-message is-success" role="status" aria-live="polite">${escapeHtml(noticeMessage)}</p>` : ""}
      ${errorMessage ? `<p class="premium-billing-message is-error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
    </section>
  `;
}

async function handleAction(event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-premium-action]");
  if (!button || busyAction) return;

  event.preventDefault();
  const action = button.dataset.premiumAction;
  if (!["manage", "purchase", "restore", "retry"].includes(action)) return;

  busyAction = action;
  errorMessage = "";
  noticeMessage = "";
  enhanceProfile();
  try {
    if (action === "manage") {
      await managePremiumSubscription(runtimeConfig);
      return;
    }
    if (action === "retry") {
      product = null;
      const loadedProduct = await ensureProduct();
      if (loadedProduct) noticeMessage = "פרטי המנוי נטענו בהצלחה.";
      return;
    }

    const result = action === "purchase"
      ? await purchasePremium(runtimeConfig)
      : await restorePremium(runtimeConfig);
    if (result?.status === "pending") {
      noticeMessage = "התשלום ממתין לאישור. Premium יופעל אחרי ש-Google תאשר אותו.";
    } else if (result?.entitlementActive) {
      noticeMessage = action === "restore"
        ? "הרכישה שוחזרה וה-Premium פעיל."
        : "ה-Premium הופעל בהצלחה.";
      await globalThis.SogrimMonetization?.refresh?.();
    } else if (action === "restore") {
      noticeMessage = "לא נמצאה רכישה פעילה בחשבון Google Play הזה.";
    }
  } catch (error) {
    if (error?.code === "PURCHASE_CANCELLED") {
      noticeMessage = "הרכישה בוטלה ולא בוצע חיוב.";
    } else {
      errorMessage = billingErrorMessage(error, action);
    }
  } finally {
    busyAction = "";
    enhanceProfile();
  }
}

async function attachPurchaseListener() {
  const userId = String(runtimeConfig?.storage?.account?.userId ?? "");
  if (purchaseListener && purchaseListenerUserId === userId) return;
  if (purchaseListenerRequest) return purchaseListenerRequest;

  purchaseListenerRequest = (async () => {
    await removePurchaseListener();
    purchaseListener = await observePremiumPurchases(
      runtimeConfig,
      handleObservedPurchase
    );
    purchaseListenerUserId = purchaseListener ? userId : "";
  })().finally(() => {
    purchaseListenerRequest = null;
  });
  return purchaseListenerRequest;
}

async function removePurchaseListener() {
  const listener = purchaseListener;
  purchaseListener = null;
  purchaseListenerUserId = "";
  if (typeof listener?.remove === "function") {
    await listener.remove().catch(() => {});
  }
}

async function handleObservedPurchase(result, error) {
  if (error) {
    errorMessage = billingErrorMessage(error, "verify");
    noticeMessage = "";
  } else if (result?.status === "pending") {
    noticeMessage =
      "התשלום עדיין ממתין לאישור. Premium יופעל אוטומטית לאחר האישור.";
    errorMessage = "";
  } else if (result?.entitlementActive) {
    noticeMessage = "התשלום אושר וה-Premium פעיל.";
    errorMessage = "";
    await globalThis.SogrimMonetization?.refresh?.();
  }
  enhanceProfile();
}

async function reconcilePremium({ silent = false } = {}) {
  const userId = String(runtimeConfig?.storage?.account?.userId ?? "");
  if (!userId || reconciledUserId === userId) return null;
  if (reconcileRequest) return reconcileRequest;

  reconcileRequest = restorePremium(runtimeConfig)
    .then(async (result) => {
      reconciledUserId = userId;
      if (result?.entitlementActive) {
        await globalThis.SogrimMonetization?.refresh?.();
      } else if (!silent && result?.status === "pending") {
        noticeMessage =
          "התשלום עדיין ממתין לאישור. Premium יופעל אוטומטית לאחר האישור.";
      }
      enhanceProfile();
      return result;
    })
    .catch((error) => {
      if (!silent) {
        errorMessage = billingErrorMessage(error, "restore");
        enhanceProfile();
      }
      return null;
    })
    .finally(() => {
      reconcileRequest = null;
    });
  return reconcileRequest;
}

function billingPeriodLabel(period) {
  if (period === "P1M") return "לחודש";
  if (period === "P1Y") return "לשנה";
  if (period === "P1W") return "לשבוע";
  return "";
}

function freeTrialLabel(period) {
  const match = String(period ?? "").match(/^P(\d+)([DWM])$/);
  if (!match) return "";
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "D") {
    return amount === 1
      ? "יום ניסיון ללא תשלום"
      : `${amount} ימי ניסיון ללא תשלום`;
  }
  if (unit === "W") {
    return amount === 1
      ? "שבוע ניסיון ללא תשלום"
      : `${amount} שבועות ניסיון ללא תשלום`;
  }
  return amount === 1
    ? "חודש ניסיון ללא תשלום"
    : `${amount} חודשי ניסיון ללא תשלום`;
}

function billingErrorMessage(error, action = "") {
  const code = String(error?.code || error?.message || "");
  if (error?.retryable) {
    return "הרכישה אומתה, אבל האישור הסופי טרם הושלם. כדאי לנסות שוב.";
  }
  if (code === "PRODUCT_UNAVAILABLE") {
    return "המנוי עדיין לא זמין ב-Google Play. אפשר לנסות שוב בעוד רגע.";
  }
  if (
    code === "BILLING_UNAVAILABLE" ||
    code === "BILLING_SETUP_FAILED" ||
    code === "PRODUCT_QUERY_FAILED"
  ) {
    return "Google Play לא זמין כרגע במכשיר הזה.";
  }
  if (code === "PURCHASE_IN_PROGRESS") {
    return "כבר מתבצעת רכישה. כדאי להמתין לסיום.";
  }
  if (code === "MANAGE_UNAVAILABLE" || action === "manage") {
    return "לא הצלחנו לפתוח את ניהול המנוי ב-Google Play.";
  }
  if (action === "load" || action === "retry") {
    return "לא הצלחנו לטעון את פרטי המנוי כרגע.";
  }
  return "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב.";
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .premium-billing-section {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 12px;
      margin-block-start: 8px;
      padding-block-start: 20px;
      border-block-start: 1px solid color-mix(in srgb, var(--line, #d7dfda) 82%, transparent);
      text-align: start;
    }

    .premium-billing-icon {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      border-radius: 12px;
      color: #fff;
      background: #075d50;
      box-shadow: 0 10px 24px rgba(7, 93, 80, 0.18);
    }

    .premium-billing-icon svg {
      inline-size: 22px;
      block-size: 22px;
    }

    .premium-billing-copy {
      min-inline-size: 0;
    }

    .premium-billing-copy small,
    .premium-billing-copy strong {
      display: block;
    }

    .premium-billing-copy small {
      color: var(--muted, #6d7a73);
      font-size: .78rem;
      font-weight: 700;
    }

    .premium-billing-copy strong {
      margin-block-start: 2px;
      color: var(--ink, #101916);
      font-size: 1rem;
      font-weight: 900;
    }

    .premium-billing-copy p,
    .premium-billing-message {
      margin: 5px 0 0;
      color: var(--muted, #65736d);
      font-size: .86rem;
      font-weight: 600;
      line-height: 1.55;
    }

    .premium-billing-actions,
    .premium-billing-message {
      grid-column: 1 / -1;
    }

    .premium-billing-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .premium-billing-actions .primary-button,
    .premium-billing-actions .secondary-button {
      min-block-size: 46px;
    }

    .premium-billing-actions .text-button {
      min-block-size: 44px;
      padding-inline: 12px;
      border: 0;
      color: #075d50;
      background: transparent;
      font: inherit;
      font-weight: 800;
    }

    .premium-billing-message.is-success { color: #087b74; }
    .premium-billing-message.is-error { color: #b33a31; }

    @media (max-width: 430px) {
      .premium-billing-actions {
        align-items: stretch;
        flex-direction: column;
      }
    }
  `;
  document.head.append(style);
}

function sparkleIcon() {
  return iconSvg("sparkle");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
