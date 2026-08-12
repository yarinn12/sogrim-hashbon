import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";

const PACKAGE_NAME = "com.sogrimhashbon.app";
const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

export async function verifyGooglePlaySubscription({
  runtimeConfig,
  env = process.env,
  authorization = "",
  productId = "",
  purchaseToken = "",
  fetchImpl = fetch,
  accessTokenProvider = defaultAccessTokenProvider
}) {
  const configuredProductId = String(
    runtimeConfig?.monetization?.premiumProductId ?? ""
  ).trim();
  const configuredBasePlanId = String(
    runtimeConfig?.monetization?.premiumBasePlanId ?? ""
  ).trim();
  const normalizedProductId = String(productId ?? "").trim();
  const normalizedPurchaseToken = String(purchaseToken ?? "").trim();
  const accessToken = bearerToken(authorization);
  const supabaseUrl = String(runtimeConfig?.storage?.url ?? "").replace(/\/+$/, "");
  const anonKey = String(runtimeConfig?.storage?.anonKey ?? "").trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ""
  ).trim();

  if (!runtimeConfig?.launch?.googlePlayBillingReady) {
    return failure(503, "Google Play Billing is not configured");
  }
  if (!accessToken) return failure(401, "Authentication is required");
  if (
    !configuredProductId ||
    !configuredBasePlanId ||
    normalizedProductId !== configuredProductId ||
    !validProductId(normalizedProductId) ||
    !validPurchaseToken(normalizedPurchaseToken)
  ) {
    return failure(400, "Subscription purchase is invalid");
  }
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return failure(503, "Subscription storage is unavailable");
  }

  const user = await loadAuthenticatedUser({
    supabaseUrl,
    anonKey,
    accessToken,
    fetchImpl
  });
  if (!user?.id) return failure(401, "Account session is invalid");

  let publisherAccessToken;
  try {
    publisherAccessToken = await accessTokenProvider(env);
  } catch {
    return failure(503, "Google Play verification is unavailable");
  }
  if (!publisherAccessToken) {
    return failure(503, "Google Play verification is unavailable");
  }

  const subscriptionResponse = await fetchImpl(
    subscriptionLookupUrl(normalizedPurchaseToken),
    {
      headers: {
        authorization: `Bearer ${publisherAccessToken}`,
        accept: "application/json"
      }
    }
  );
  const subscription = await subscriptionResponse.json().catch(() => null);
  if (!subscriptionResponse.ok || !subscription) {
    return failure(
      subscriptionResponse.status === 404 ? 400 : 502,
      subscriptionResponse.status === 404
        ? "Subscription purchase was not found"
        : "Google Play could not verify the subscription"
    );
  }

  const lineItems = Array.isArray(subscription.lineItems)
    ? subscription.lineItems
    : [];
  const productItems = lineItems.filter(
    (item) => String(item?.productId ?? "") === configuredProductId
  );
  if (productItems.length === 0) {
    return failure(400, "Subscription product does not match");
  }
  const matchingItems = productItems.filter(
    (item) =>
      String(item?.offerDetails?.basePlanId ?? "") === configuredBasePlanId
  );
  if (matchingItems.length === 0) {
    return failure(400, "Subscription base plan does not match");
  }

  const expectedAccountId = sha256(user.id);
  const purchaseAccountId = String(
    subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? ""
  ).trim();
  if (!purchaseAccountId || purchaseAccountId !== expectedAccountId) {
    return failure(409, "Subscription purchase belongs to another account");
  }

  const status = subscriptionStatus(subscription.subscriptionState);
  const expiresAt = latestExpiry(matchingItems);
  const activeThroughExpiry = ["active", "grace", "cancelled"].includes(status);
  if (activeThroughExpiry && !expiresAt) {
    return failure(502, "Google Play returned an incomplete subscription");
  }

  const verifiedAt = new Date().toISOString();
  const record = {
    p_user_id: user.id,
    p_provider: "google_play",
    p_product_id: configuredProductId,
    p_purchase_token_hash: sha256(normalizedPurchaseToken),
    p_status: status,
    p_entitlement_expires_at: expiresAt || null,
    p_auto_renewing: matchingItems.some(
      (item) => item?.autoRenewingPlan?.autoRenewEnabled === true
    ),
    p_provider_order_id:
      String(subscription.latestOrderId ?? "").trim() ||
      latestOrderId(matchingItems) ||
      null,
    p_verified_at: verifiedAt
  };

  const linkedPurchaseToken = String(
    subscription.linkedPurchaseToken ?? ""
  ).trim();
  if (linkedPurchaseToken && linkedPurchaseToken !== normalizedPurchaseToken) {
    const linkedResult = await recordSubscription({
      supabaseUrl,
      serviceRoleKey,
      fetchImpl,
      body: {
        ...record,
        p_purchase_token_hash: sha256(linkedPurchaseToken),
        p_status: "revoked",
        p_entitlement_expires_at: null,
        p_auto_renewing: false,
        p_provider_order_id: null
      }
    });
    if (!linkedResult.ok) return linkedResult;
  }

  const recordResult = await recordSubscription({
    supabaseUrl,
    serviceRoleKey,
    fetchImpl,
    body: record
  });
  if (!recordResult.ok) return recordResult;

  const purchased = status !== "pending";
  const acknowledgementPending =
    purchased &&
    subscription.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING";
  if (acknowledgementPending) {
    const acknowledgementResponse = await fetchImpl(
      subscriptionAcknowledgeUrl(configuredProductId, normalizedPurchaseToken),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${publisherAccessToken}`,
          "content-type": "application/json"
        },
        body: "{}"
      }
    );
    if (!acknowledgementResponse.ok) {
      return {
        ok: false,
        status: 502,
        payload: {
          ok: false,
          error: "Subscription was verified but still needs acknowledgement",
          retryable: true
        }
      };
    }
  }

  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      status,
      productId: configuredProductId,
      entitlementActive:
        Boolean(recordResult.payload?.entitlement_active) &&
        activeThroughExpiry,
      entitlementExpiresAt: expiresAt || "",
      autoRenewing: record.p_auto_renewing,
      testPurchase: Boolean(subscription.testPurchase)
    }
  };
}

async function defaultAccessTokenProvider(env) {
  const credentials = serviceAccountCredentials(env);
  const auth = new GoogleAuth({
    credentials,
    scopes: [ANDROID_PUBLISHER_SCOPE]
  });
  return auth.getAccessToken();
}

function serviceAccountCredentials(env) {
  const raw = String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  const encoded = String(
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 ?? ""
  ).trim();
  const json = raw || (encoded
    ? Buffer.from(encoded, "base64").toString("utf8")
    : "");
  if (!json) throw new Error("Google Play service account is missing");
  const credentials = JSON.parse(json);
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error("Google Play service account is invalid");
  }
  return credentials;
}

async function loadAuthenticatedUser({
  supabaseUrl,
  anonKey,
  accessToken,
  fetchImpl
}) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function recordSubscription({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl,
  body
}) {
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/record_verified_subscription`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, payload };

  const ownershipConflict =
    response.status === 409 ||
    String(payload?.code ?? "") === "23505";
  return failure(
    ownershipConflict ? 409 : 502,
    ownershipConflict
      ? "Subscription purchase belongs to another account"
      : "Subscription entitlement could not be saved"
  );
}

function subscriptionStatus(value) {
  const status = String(value ?? "");
  if (status === "SUBSCRIPTION_STATE_PENDING") return "pending";
  if (status === "SUBSCRIPTION_STATE_ACTIVE") return "active";
  if (status === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return "grace";
  if (status === "SUBSCRIPTION_STATE_CANCELED") return "cancelled";
  if (
    status === "SUBSCRIPTION_STATE_PAUSED" ||
    status === "SUBSCRIPTION_STATE_ON_HOLD"
  ) {
    return "paused";
  }
  if (status === "SUBSCRIPTION_STATE_EXPIRED") return "expired";
  return "revoked";
}

function latestExpiry(lineItems) {
  const values = lineItems
    .map((item) => new Date(item?.expiryTime ?? "").getTime())
    .filter(Number.isFinite);
  return values.length
    ? new Date(Math.max(...values)).toISOString()
    : "";
}

function latestOrderId(lineItems) {
  return lineItems
    .map((item) => String(item?.latestSuccessfulOrderId ?? "").trim())
    .find(Boolean) ?? "";
}

function subscriptionLookupUrl(purchaseToken) {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
}

function subscriptionAcknowledgeUrl(productId, purchaseToken) {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function bearerToken(value) {
  return String(value).match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? "";
}

function validProductId(value) {
  return /^[A-Za-z0-9._-]{3,200}$/.test(value);
}

function validPurchaseToken(value) {
  return value.length >= 16 && value.length <= 4096 && !/\s/.test(value);
}

function failure(status, error) {
  return { ok: false, status, payload: { ok: false, error } };
}
