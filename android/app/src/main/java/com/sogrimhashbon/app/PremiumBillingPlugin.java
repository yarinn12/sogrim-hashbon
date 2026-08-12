package com.sogrimhashbon.app;

import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PremiumBilling")
public class PremiumBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;
    private String pendingProductId = "";

    @Override
    public void load() {
        PendingPurchasesParams pendingParams = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .enablePrepaidPlans()
            .build();
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(pendingParams)
            .build();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        withBillingClient(call, () -> {
            BillingResult result = billingClient.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS);
            JSObject payload = new JSObject();
            payload.put("available", result.getResponseCode() == BillingClient.BillingResponseCode.OK);
            call.resolve(payload);
        });
    }

    @PluginMethod
    public void getSubscription(PluginCall call) {
        String productId = requiredString(call, "productId");
        String basePlanId = requiredString(call, "basePlanId");
        if (productId == null || basePlanId == null) return;

        querySubscription(call, productId, basePlanId, (details, offer) -> {
            ProductDetails.PricingPhase price = recurringPricingPhase(offer);
            if (price == null) {
                call.reject("Subscription price is unavailable", "PRODUCT_UNAVAILABLE");
                return;
            }
            JSObject payload = new JSObject();
            payload.put("productId", details.getProductId());
            payload.put("basePlanId", offer.getBasePlanId());
            payload.put("offerId", offer.getOfferId());
            payload.put("title", details.getName());
            payload.put("description", details.getDescription());
            payload.put("formattedPrice", price.getFormattedPrice());
            payload.put("priceCurrencyCode", price.getPriceCurrencyCode());
            payload.put("priceAmountMicros", price.getPriceAmountMicros());
            payload.put("billingPeriod", price.getBillingPeriod());
            payload.put("freeTrialPeriod", freeTrialPeriod(offer));
            call.resolve(payload);
        });
    }

    @PluginMethod
    public void purchaseSubscription(PluginCall call) {
        String productId = requiredString(call, "productId");
        String basePlanId = requiredString(call, "basePlanId");
        String accountId = requiredString(call, "accountId");
        if (productId == null || basePlanId == null || accountId == null) return;
        if (pendingPurchaseCall != null) {
            call.reject("A purchase is already in progress", "PURCHASE_IN_PROGRESS");
            return;
        }

        querySubscription(call, productId, basePlanId, (details, offer) -> {
            BillingFlowParams.ProductDetailsParams productParams =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.getOfferToken())
                    .build();
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams))
                .setObfuscatedAccountId(sha256(accountId))
                .build();

            pendingPurchaseCall = call;
            pendingProductId = productId;
            BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                clearPendingPurchase();
                rejectBilling(call, launchResult, "PURCHASE_LAUNCH_FAILED");
            }
        });
    }

    @PluginMethod
    public void restoreSubscriptions(PluginCall call) {
        String productId = requiredString(call, "productId");
        if (productId == null) return;

        withBillingClient(call, () -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .includeSuspendedSubscriptions(true)
                .build();
            billingClient.queryPurchasesAsync(params, (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectBilling(call, result, "RESTORE_FAILED");
                    return;
                }

                JSArray restored = new JSArray();
                for (Purchase purchase : purchases) {
                    if (!purchase.getProducts().contains(productId)) continue;
                    restored.put(purchasePayload(purchase, productId));
                }
                JSObject payload = new JSObject();
                payload.put("purchases", restored);
                call.resolve(payload);
            });
        });
    }

    @PluginMethod
    public void manageSubscriptions(PluginCall call) {
        String productId = requiredString(call, "productId");
        if (productId == null) return;

        try {
            Uri uri = Uri.parse("https://play.google.com/store/account/subscriptions")
                .buildUpon()
                .appendQueryParameter("sku", productId)
                .appendQueryParameter("package", getContext().getPackageName())
                .build();
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Subscription management is unavailable", "MANAGE_UNAVAILABLE", error);
        }
    }

    @Override
    public void onPurchasesUpdated(
        @NonNull BillingResult billingResult,
        List<Purchase> purchases
    ) {
        PluginCall call = pendingPurchaseCall;
        if (call == null) {
            publishDetachedPurchaseUpdates(billingResult, purchases);
            return;
        }

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            clearPendingPurchase();
            call.reject("Purchase cancelled", "PURCHASE_CANCELLED");
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            clearPendingPurchase();
            rejectBilling(call, billingResult, "PURCHASE_FAILED");
            return;
        }

        Purchase matchingPurchase = null;
        if (purchases != null) {
            for (Purchase purchase : purchases) {
                if (purchase.getProducts().contains(pendingProductId)) {
                    matchingPurchase = purchase;
                    break;
                }
            }
        }
        if (matchingPurchase == null) {
            clearPendingPurchase();
            call.reject("Purchase result is missing", "PURCHASE_MISSING");
            return;
        }

        JSObject payload = purchasePayload(matchingPurchase, pendingProductId);
        clearPendingPurchase();
        call.resolve(payload);
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null && billingClient.isReady()) {
            billingClient.endConnection();
        }
        if (pendingPurchaseCall != null) {
            pendingPurchaseCall.reject("Purchase interrupted", "PURCHASE_INTERRUPTED");
            clearPendingPurchase();
        }
    }

    private void querySubscription(
        PluginCall call,
        String productId,
        String basePlanId,
        SubscriptionDetailsCallback callback
    ) {
        withBillingClient(call, () -> {
            QueryProductDetailsParams.Product product =
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build();
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

            billingClient.queryProductDetailsAsync(params, (result, queryResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectBilling(call, result, "PRODUCT_QUERY_FAILED");
                    return;
                }
                ProductDetails details = queryResult.getProductDetailsList().stream()
                    .filter(item -> productId.equals(item.getProductId()))
                    .findFirst()
                    .orElse(null);
                ProductDetails.SubscriptionOfferDetails offer =
                    selectOffer(details, basePlanId);
                if (details == null || offer == null) {
                    call.reject("Subscription is unavailable", "PRODUCT_UNAVAILABLE");
                    return;
                }
                callback.complete(details, offer);
            });
        });
    }

    private void withBillingClient(PluginCall call, Runnable action) {
        if (billingClient == null) {
            call.reject("Billing is unavailable", "BILLING_UNAVAILABLE");
            return;
        }
        if (billingClient.isReady()) {
            action.run();
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    rejectBilling(call, result, "BILLING_SETUP_FAILED");
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call reconnects. No entitlement is granted locally.
            }
        });
    }

    private ProductDetails.SubscriptionOfferDetails selectOffer(
        ProductDetails details,
        String basePlanId
    ) {
        if (details == null || details.getSubscriptionOfferDetails() == null) return null;
        ProductDetails.SubscriptionOfferDetails fallback = null;
        ProductDetails.SubscriptionOfferDetails basePlan = null;
        for (ProductDetails.SubscriptionOfferDetails offer : details.getSubscriptionOfferDetails()) {
            if (!basePlanId.equals(offer.getBasePlanId())) continue;
            if (fallback == null) fallback = offer;
            if (hasFreeTrial(offer)) return offer;
            if (offer.getOfferId() == null) basePlan = offer;
        }
        return basePlan != null ? basePlan : fallback;
    }

    private boolean hasFreeTrial(ProductDetails.SubscriptionOfferDetails offer) {
        return !freeTrialPeriod(offer).isEmpty();
    }

    private String freeTrialPeriod(ProductDetails.SubscriptionOfferDetails offer) {
        if (offer == null || offer.getPricingPhases() == null) return "";
        for (ProductDetails.PricingPhase phase :
            offer.getPricingPhases().getPricingPhaseList()) {
            if (phase.getPriceAmountMicros() == 0L) {
                return phase.getBillingPeriod();
            }
        }
        return "";
    }

    private ProductDetails.PricingPhase recurringPricingPhase(
        ProductDetails.SubscriptionOfferDetails offer
    ) {
        if (offer == null || offer.getPricingPhases() == null) return null;
        List<ProductDetails.PricingPhase> phases =
            offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return null;
        return phases.get(phases.size() - 1);
    }

    private void publishDetachedPurchaseUpdates(
        BillingResult billingResult,
        List<Purchase> purchases
    ) {
        if (
            billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK ||
            purchases == null
        ) {
            return;
        }
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().isEmpty()) continue;
            notifyListeners(
                "purchaseUpdated",
                purchasePayload(purchase, purchase.getProducts().get(0))
            );
        }
    }

    private JSObject purchasePayload(Purchase purchase, String productId) {
        JSObject payload = new JSObject();
        payload.put("productId", productId);
        payload.put("purchaseToken", purchase.getPurchaseToken());
        payload.put("purchaseState", purchaseState(purchase));
        return payload;
    }

    private String purchaseState(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            return "purchased";
        }
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            return "pending";
        }
        return "unspecified";
    }

    private void clearPendingPurchase() {
        pendingPurchaseCall = null;
        pendingProductId = "";
    }

    private String requiredString(PluginCall call, String key) {
        String value = call.getString(key, "").trim();
        if (value.isEmpty()) {
            call.reject("Missing " + key, "INVALID_ARGUMENT");
            return null;
        }
        return value;
    }

    private void rejectBilling(PluginCall call, BillingResult result, String code) {
        String message = result.getDebugMessage();
        call.reject(message == null || message.isEmpty() ? "Google Play Billing error" : message, code);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) hex.append(String.format("%02x", item));
            return hex.toString();
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private interface SubscriptionDetailsCallback {
        void complete(
            ProductDetails details,
            ProductDetails.SubscriptionOfferDetails offer
        );
    }
}
