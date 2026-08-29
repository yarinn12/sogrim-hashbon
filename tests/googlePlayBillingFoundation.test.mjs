import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";
import { verifyGooglePlaySubscription } from "../src/server/googlePlayBilling.mjs";
import {
  observePremiumPurchases,
  restorePremium
} from "../src/data/premiumBillingStore.mjs";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const PURCHASE_TOKEN = "purchase-token-with-enough-entropy";
const PRODUCT_ID = "sogrim_premium";

test("the first Android release does not package dormant Play Billing", async () => {
  const [build, manifest, activity] = await Promise.all([
    readFile("android/app/build.gradle", "utf8"),
    readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java",
      "utf8"
    )
  ]);

  assert.doesNotMatch(build, /com\.android\.billingclient:billing/);
  assert.doesNotMatch(manifest, /com\.android\.vending\.BILLING/);
  assert.match(manifest, /android:launchMode="singleTop"/);
  assert.doesNotMatch(activity, /PremiumBillingPlugin/);
});

test("verified active purchases are hashed, stored and acknowledged server-side", async () => {
  const calls = [];
  const response = await verifyGooglePlaySubscription({
    runtimeConfig: billingRuntimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer user-access-token",
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    accessTokenProvider: async () => "publisher-access-token",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: USER_ID });
      }
      if (String(url).includes("/purchases/subscriptionsv2/tokens/")) {
        return jsonResponse(200, activeSubscription());
      }
      if (String(url).endsWith("/rpc/record_verified_subscription")) {
        return jsonResponse(200, {
          status: "active",
          entitlement_active: true
        });
      }
      if (String(url).endsWith(":acknowledge")) {
        return jsonResponse(200, {});
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.entitlementActive, true);
  const rpcCall = calls.find((call) =>
    call.url.endsWith("/rpc/record_verified_subscription")
  );
  const rpcBody = JSON.parse(rpcCall.options.body);
  assert.equal(
    rpcBody.p_purchase_token_hash,
    sha256(PURCHASE_TOKEN)
  );
  assert.equal(rpcBody.p_user_id, USER_ID);
  assert.equal(rpcBody.p_status, "active");
  assert.equal(rpcCall.options.body.includes(PURCHASE_TOKEN), false);
  assert.equal(calls.some((call) => call.url.endsWith(":acknowledge")), true);
});

test("pending purchases never grant or acknowledge Premium", async () => {
  const calls = [];
  const response = await verifyGooglePlaySubscription({
    runtimeConfig: billingRuntimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer user-access-token",
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    accessTokenProvider: async () => "publisher-access-token",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: USER_ID });
      }
      if (String(url).includes("/purchases/subscriptionsv2/tokens/")) {
        return jsonResponse(200, {
          ...activeSubscription(),
          startTime: undefined,
          subscriptionState: "SUBSCRIPTION_STATE_PENDING",
          lineItems: [
            {
              productId: PRODUCT_ID,
              offerDetails: { basePlanId: "monthly" }
            }
          ]
        });
      }
      if (String(url).endsWith("/rpc/record_verified_subscription")) {
        return jsonResponse(200, {
          status: "pending",
          entitlement_active: false
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.status, "pending");
  assert.equal(response.payload.entitlementActive, false);
  assert.equal(calls.some((call) => call.url.endsWith(":acknowledge")), false);
  const rpcCall = calls.find((call) =>
    call.url.endsWith("/rpc/record_verified_subscription")
  );
  assert.equal(JSON.parse(rpcCall.options.body).p_status, "pending");
});

test("purchase account attribution must match the signed-in account", async () => {
  const response = await verifyGooglePlaySubscription({
    runtimeConfig: billingRuntimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer user-access-token",
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    accessTokenProvider: async () => "publisher-access-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: USER_ID });
      }
      return jsonResponse(200, {
        ...activeSubscription(),
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: sha256("another-user")
        }
      });
    }
  });

  assert.equal(response.status, 409);
  assert.match(response.payload.error, /another account/);
});

test("a purchase for another base plan never grants Premium", async () => {
  let storageCalled = false;
  const response = await verifyGooglePlaySubscription({
    runtimeConfig: billingRuntimeConfig(),
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-role" },
    authorization: "Bearer user-access-token",
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    accessTokenProvider: async () => "publisher-access-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: USER_ID });
      }
      if (String(url).includes("/purchases/subscriptionsv2/tokens/")) {
        return jsonResponse(200, {
          ...activeSubscription(),
          lineItems: [
            {
              ...activeSubscription().lineItems[0],
              offerDetails: { basePlanId: "annual" }
            }
          ]
        });
      }
      if (String(url).endsWith("/rpc/record_verified_subscription")) {
        storageCalled = true;
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  assert.equal(response.status, 400);
  assert.match(response.payload.error, /base plan/);
  assert.equal(storageCalled, false);
});

test("restore skips an invalid purchase and restores the next active one", async () => {
  const previousCapacitor = globalThis.Capacitor;
  const staleToken = "stale-purchase-token-with-enough-entropy";
  const activeToken = "active-purchase-token-with-enough-entropy";
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {
      PremiumBilling: {
        restoreSubscriptions: async () => ({
          purchases: [
            {
              productId: PRODUCT_ID,
              purchaseToken: staleToken,
              purchaseState: "purchased"
            },
            {
              productId: PRODUCT_ID,
              purchaseToken: activeToken,
              purchaseState: "purchased"
            }
          ]
        })
      }
    }
  };

  try {
    const result = await restorePremium(
      clientBillingRuntimeConfig(),
      async (_url, options) => {
        const token = JSON.parse(options.body).purchaseToken;
        if (token === staleToken) {
          return jsonResponse(400, { error: "Subscription purchase was not found" });
        }
        return jsonResponse(200, {
          status: "active",
          entitlementActive: true
        });
      }
    );
    assert.equal(result.restored, true);
    assert.equal(result.entitlementActive, true);
  } finally {
    globalThis.Capacitor = previousCapacitor;
  }
});

test("purchase verification releases a hanging billing request", async () => {
  const previousCapacitor = globalThis.Capacitor;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {
      PremiumBilling: {
        restoreSubscriptions: async () => ({
          purchases: [{
            productId: PRODUCT_ID,
            purchaseToken: "active-purchase-token-with-enough-entropy",
            purchaseState: "purchased"
          }]
        })
      }
    }
  };

  try {
    await assert.rejects(
      restorePremium(
        clientBillingRuntimeConfig(),
        async () => new Promise(() => {}),
        5
      ),
      (error) => error?.code === "NETWORK_TIMEOUT"
    );
  } finally {
    globalThis.Capacitor = previousCapacitor;
  }
});

test("detached Play purchase updates are filtered to the Premium product", async () => {
  const previousCapacitor = globalThis.Capacitor;
  let nativeListener = null;
  let verifiedCount = 0;
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {
      PremiumBilling: {
        addListener: async (_eventName, listener) => {
          nativeListener = listener;
          return { remove: async () => {} };
        }
      }
    }
  };

  try {
    await observePremiumPurchases(
      clientBillingRuntimeConfig(),
      () => {
        verifiedCount += 1;
      },
      async () => jsonResponse(200, {
        status: "active",
        entitlementActive: true
      })
    );
    await nativeListener({
      productId: "another_product",
      purchaseToken: PURCHASE_TOKEN,
      purchaseState: "purchased"
    });
    await nativeListener({
      productId: PRODUCT_ID,
      purchaseToken: PURCHASE_TOKEN,
      purchaseState: "purchased"
    });
    assert.equal(verifiedCount, 1);
  } finally {
    globalThis.Capacitor = previousCapacitor;
  }
});

test("billing endpoint forwards only an authenticated purchase verification request", async () => {
  let received = null;
  const handler = createAppHandler({
    root: process.cwd(),
    port: 0,
    googlePlaySubscriptionVerifier: async (input) => {
      received = input;
      return {
        status: 200,
        payload: { ok: true, entitlementActive: true }
      };
    }
  });
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/billing/google/verify`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer account-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          productId: PRODUCT_ID,
          purchaseToken: PURCHASE_TOKEN
        })
      }
    );
    assert.equal(response.status, 200);
    assert.equal(received.authorization, "Bearer account-token");
    assert.equal(received.productId, PRODUCT_ID);
    assert.equal(received.purchaseToken, PURCHASE_TOKEN);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

test("Google Play verification is throttled before the verifier is called", async () => {
  let verificationCount = 0;
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    env: {},
    googlePlaySubscriptionVerifier: async () => {
      verificationCount += 1;
      return { status: 200, payload: { ok: true } };
    }
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const endpoint = `http://127.0.0.1:${port}/api/billing/google/verify`;
    const request = () => fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer account-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        productId: PRODUCT_ID,
        purchaseToken: PURCHASE_TOKEN
      })
    });

    for (let index = 0; index < 10; index += 1) {
      assert.equal((await request()).status, 200);
    }
    const throttled = await request();
    assert.equal(throttled.status, 429);
    assert.ok(Number(throttled.headers.get("retry-after")) >= 1);
    assert.equal((await throttled.json()).code, "RATE_LIMITED");
    assert.equal(verificationCount, 10);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

test("Google Play rate limiting does not bucket unverified bearer values", async () => {
  const consumed = [];
  const requestRateLimiter = {
    consume(key) {
      consumed.push(["client", key]);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    consumeGlobal(key) {
      consumed.push(["global", key]);
      return { allowed: true, retryAfterSeconds: 0 };
    }
  };
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    env: {},
    requestRateLimiter,
    googlePlaySubscriptionVerifier: async () => ({
      status: 401,
      payload: { ok: false, error: "Unauthorized" }
    })
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/billing/google/verify`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer attacker-chosen-value",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          productId: PRODUCT_ID,
          purchaseToken: PURCHASE_TOKEN
        })
      }
    );

    assert.equal(response.status, 401);
    assert.deepEqual(consumed, [
      ["client", "google-play:client:ip:127.0.0.1"],
      ["global", "google-play:global"]
    ]);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

test("Premium UI stays feature-gated and uses localized Play pricing", async () => {
  const [index, sw, store, layer] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("src/data/premiumBillingStore.mjs", "utf8"),
    readFile("src/publicPremiumBillingLayer.mjs", "utf8")
  ]);

  assert.match(index, /publicPremiumBillingLayer\.mjs/);
  assert.match(sw, /premiumBillingStore\.mjs/);
  assert.match(sw, /publicPremiumBillingLayer\.mjs/);
  assert.match(store, /premiumEnabled/);
  assert.match(store, /purchaseToken/);
  assert.match(store, /purchaseUpdated/);
  assert.doesNotMatch(store, /localStorage|sessionStorage|console\./);
  assert.match(layer, /product\.formattedPrice/);
  assert.match(layer, /freeTrialPeriod/);
  assert.doesNotMatch(layer, /₪\s*\d|\d+\s*₪/);
});

function billingRuntimeConfig() {
  return {
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key"
    },
    monetization: {
      premiumEnabled: true,
      premiumProductId: PRODUCT_ID,
      premiumBasePlanId: "monthly"
    },
    launch: { googlePlayBillingReady: true }
  };
}

function activeSubscription() {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.1234-5678-9012-34567",
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: sha256(USER_ID)
    },
    lineItems: [
      {
        productId: PRODUCT_ID,
        offerDetails: { basePlanId: "monthly" },
        expiryTime: "2099-01-01T00:00:00.000Z",
        autoRenewingPlan: { autoRenewEnabled: true }
      }
    ]
  };
}

function clientBillingRuntimeConfig() {
  return {
    ...billingRuntimeConfig(),
    storage: {
      ...billingRuntimeConfig().storage,
      account: {
        userId: USER_ID,
        accessToken: "user-access-token"
      }
    }
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
