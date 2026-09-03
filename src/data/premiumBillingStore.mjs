import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout
} from "./fetchTimeout.mjs";

export function premiumBillingAvailable(config) {
  return Boolean(
    config?.monetization?.premiumEnabled &&
    config.monetization.premiumProductId &&
    config.monetization.premiumBasePlanId &&
    config?.storage?.account?.userId &&
    config.storage.account.accessToken &&
    isAndroidNative() &&
    billingPlugin()
  );
}

export async function loadPremiumProduct(config) {
  assertAvailable(config);
  const availability = await billingPlugin().isAvailable();
  if (!availability?.available) throw billingError("BILLING_UNAVAILABLE");
  return billingPlugin().getSubscription(productOptions(config));
}

export async function purchasePremium(
  config,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  assertAvailable(config);
  const purchase = await billingPlugin().purchaseSubscription({
    ...productOptions(config),
    accountId: config.storage.account.userId
  });
  return verifyNativePurchase(config, purchase, fetchImpl, timeoutMs);
}

export async function restorePremium(
  config,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  assertAvailable(config);
  const result = await billingPlugin().restoreSubscriptions({
    productId: config.monetization.premiumProductId
  });
  const purchases = Array.isArray(result?.purchases) ? result.purchases : [];
  if (purchases.length === 0) return { restored: false, status: "missing" };

  let verified = null;
  let verificationError = null;
  for (const purchase of purchases) {
    try {
      const candidate = await verifyNativePurchase(
        config,
        purchase,
        fetchImpl,
        timeoutMs
      );
      if (!verified || candidate?.entitlementActive) verified = candidate;
      if (candidate?.entitlementActive) break;
    } catch (error) {
      verificationError = error;
    }
  }
  if (!verified && verificationError) throw verificationError;
  return {
    ...verified,
    restored: Boolean(verified?.entitlementActive)
  };
}

export async function observePremiumPurchases(
  config,
  onResult,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  assertAvailable(config);
  const plugin = billingPlugin();
  if (typeof plugin?.addListener !== "function") return null;

  return plugin.addListener("purchaseUpdated", async (purchase) => {
    if (
      String(purchase?.productId ?? "") !==
      String(config.monetization.premiumProductId)
    ) {
      return;
    }
    try {
      const result = await verifyNativePurchase(
        config,
        purchase,
        fetchImpl,
        timeoutMs
      );
      await onResult?.(result, null);
    } catch (error) {
      await onResult?.(null, error);
    }
  });
}

export async function managePremiumSubscription(config) {
  assertAvailable(config);
  return billingPlugin().manageSubscriptions({
    productId: config.monetization.premiumProductId
  });
}

async function verifyNativePurchase(config, purchase, fetchImpl, timeoutMs) {
  const purchaseToken = String(purchase?.purchaseToken ?? "").trim();
  const purchaseState = String(purchase?.purchaseState ?? "").trim();
  if (purchaseState === "pending") {
    return { status: "pending", entitlementActive: false };
  }
  if (purchaseState !== "purchased" || !purchaseToken) {
    throw billingError("PURCHASE_INCOMPLETE");
  }

  const { response, payload } = await fetchWithTimeout(
    fetchImpl,
    `${config?.apiBaseUrl ?? ""}/api/billing/google/verify`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.storage.account.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        productId: config.monetization.premiumProductId,
        purchaseToken
      })
    },
    timeoutMs,
    async (response) => ({
      response,
      payload: await response.json().catch(() => ({}))
    })
  );
  if (!response.ok) {
    const error = billingError(payload?.error || "VERIFICATION_FAILED");
    error.retryable = Boolean(payload?.retryable);
    throw error;
  }
  return payload;
}

function productOptions(config) {
  return {
    productId: config.monetization.premiumProductId,
    basePlanId: config.monetization.premiumBasePlanId
  };
}

function assertAvailable(config) {
  if (!premiumBillingAvailable(config)) {
    throw billingError("BILLING_UNAVAILABLE");
  }
}

function billingPlugin() {
  return globalThis.Capacitor?.Plugins?.PremiumBilling ?? null;
}

function isAndroidNative() {
  return Boolean(
    globalThis.Capacitor?.isNativePlatform?.() &&
    globalThis.Capacitor?.getPlatform?.() === "android"
  );
}

function billingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
