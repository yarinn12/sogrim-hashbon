import test from "node:test";
import assert from "node:assert/strict";

import {
  getClientRuntimeConfig,
  getRuntimeConfig
} from "../src/server/runtimeConfig.mjs";

test("getRuntimeConfig stays in local mode without cloud environment values", () => {
  const config = getRuntimeConfig({});

  assert.deepEqual(config.auth, { googleClientId: "" });
  assert.deepEqual(config.monetization, {
    adsEnabled: false,
    androidBannerId: "",
    testMode: false,
    rolloutPercent: 0,
    minimumAndroidBuild: 28,
    sponsoredCardsEnabled: false,
    referralRewardDays: 30,
    premiumEnabled: false,
    premiumProductId: "",
    premiumBasePlanId: "",
    premiumMinimumAndroidBuild: 30
  });
  assert.deepEqual(config.storage, { mode: "local" });
  assert.equal(config.launch.publicUrlReady, false);
  assert.equal(config.launch.cloudStorageReady, false);
  assert.equal(config.launch.accountDeletionReady, false);
  assert.equal(config.launch.pushDeliveryReady, false);
  assert.equal(config.launch.shareLinksReady, false);
});

test("getRuntimeConfig enables Supabase mode when public cloud values exist", () => {
  const config = getRuntimeConfig({
    APP_PUBLIC_URL: "https://settle.example.com",
    APP_SPACE_ID: "friends-beta",
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    GOOGLE_CLIENT_ID: "google-client-id",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
  });

  assert.deepEqual(config.storage, {
    mode: "supabase",
    url: "https://demo.supabase.co",
    anonKey: "anon-key",
    table: "app_snapshots",
    spaceId: "friends-beta"
  });
  assert.deepEqual(config.auth, { googleClientId: "google-client-id" });
  assert.equal(config.monetization.adsEnabled, false);
  assert.equal(config.publicUrl, "https://settle.example.com");
  assert.equal(config.launch.publicUrlReady, true);
  assert.equal(config.launch.cloudStorageReady, true);
  assert.equal(config.launch.googleAuthReady, true);
  assert.equal(config.launch.accountDeletionReady, true);
  assert.equal(config.launch.pushDeliveryReady, false);
  assert.equal(config.launch.shareLinksReady, true);
});

test("Firebase push delivery requires credentials, a project and private storage access", () => {
  const config = getRuntimeConfig({
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "sogrim-demo",
      client_email: "firebase@example.test",
      private_key: "private-key"
    })
  });

  assert.equal(config.launch.pushDeliveryReady, true);
  assert.equal(
    getClientRuntimeConfig(config, {
      platform: "android",
      build: "31"
    }).launch.pushDeliveryReady,
    true
  );
});

test("getRuntimeConfig enables AdMob only with an explicit switch and banner id", () => {
  const config = getRuntimeConfig({
    ADMOB_ENABLED: "true",
    ADMOB_ANDROID_BANNER_ID: "ca-app-pub-demo/banner",
    ADMOB_TEST_MODE: "1",
    ADMOB_ROLLOUT_PERCENT: "5",
    ADMOB_MIN_ANDROID_BUILD: "28",
    SPONSORED_CARDS_ENABLED: "yes"
  });

  assert.deepEqual(config.monetization, {
    adsEnabled: true,
    androidBannerId: "ca-app-pub-demo/banner",
    testMode: true,
    rolloutPercent: 5,
    minimumAndroidBuild: 28,
    sponsoredCardsEnabled: true,
    referralRewardDays: 30,
    premiumEnabled: false,
    premiumProductId: "",
    premiumBasePlanId: "",
    premiumMinimumAndroidBuild: 30
  });
});

test("client runtime config fails closed for browsers and old Android builds", () => {
  const config = getRuntimeConfig({
    ADMOB_ENABLED: "true",
    ADMOB_ANDROID_BANNER_ID: "ca-app-pub-demo/banner",
    ADMOB_TEST_MODE: "true",
    ADMOB_ROLLOUT_PERCENT: "10",
    ADMOB_MIN_ANDROID_BUILD: "28"
  });

  for (const client of [
    {},
    { platform: "web", build: "28" },
    { platform: "android", build: "27" }
  ]) {
    const scoped = getClientRuntimeConfig(config, client);
    assert.equal(scoped.monetization.adsEnabled, false);
    assert.equal(scoped.monetization.testMode, false);
  }
});

test("client runtime config enables only an eligible Android build", () => {
  const config = getRuntimeConfig({
    ADMOB_ENABLED: "true",
    ADMOB_ANDROID_BANNER_ID: "ca-app-pub-demo/banner",
    ADMOB_TEST_MODE: "true",
    ADMOB_ROLLOUT_PERCENT: "5",
    ADMOB_MIN_ANDROID_BUILD: "28"
  });
  const scoped = getClientRuntimeConfig(config, {
    platform: "ANDROID",
    build: "28"
  });

  assert.equal(scoped.monetization.adsEnabled, true);
  assert.equal(scoped.monetization.testMode, true);
  assert.equal(scoped.monetization.rolloutPercent, 5);
  assert.equal(scoped.monetization.minimumAndroidBuild, 28);
});

test("production ads remain off when rollout percentage is zero", () => {
  const config = getRuntimeConfig({
    ADMOB_ENABLED: "true",
    ADMOB_ANDROID_BANNER_ID: "ca-app-pub-demo/banner",
    ADMOB_TEST_MODE: "true",
    ADMOB_ROLLOUT_PERCENT: "0"
  });
  const scoped = getClientRuntimeConfig(config, {
    platform: "android",
    build: "28"
  });

  assert.equal(scoped.monetization.adsEnabled, false);
  assert.equal(scoped.monetization.testMode, true);
});

test("Google Play Premium requires complete server configuration and an eligible build", () => {
  const config = getRuntimeConfig({
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    GOOGLE_PLAY_PREMIUM_ENABLED: "true",
    GOOGLE_PLAY_PREMIUM_PRODUCT_ID: "sogrim_premium",
    GOOGLE_PLAY_PREMIUM_BASE_PLAN_ID: "monthly",
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "billing@example.test",
      private_key: "private-key"
    })
  });

  assert.equal(config.launch.googlePlayBillingReady, true);
  assert.equal(
    getClientRuntimeConfig(config, {
      platform: "android",
      build: "29"
    }).monetization.premiumEnabled,
    false
  );
  const eligible = getClientRuntimeConfig(config, {
    platform: "android",
    build: "30"
  });
  assert.equal(eligible.monetization.premiumEnabled, true);
  assert.equal(eligible.monetization.premiumProductId, "sogrim_premium");
  assert.equal(eligible.monetization.premiumBasePlanId, "monthly");
});

test("Google Play Premium fails closed when verification credentials are missing", () => {
  const config = getRuntimeConfig({
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    GOOGLE_PLAY_PREMIUM_ENABLED: "true",
    GOOGLE_PLAY_PREMIUM_PRODUCT_ID: "sogrim_premium",
    GOOGLE_PLAY_PREMIUM_BASE_PLAN_ID: "monthly"
  });

  assert.equal(config.launch.googlePlayBillingReady, false);
  assert.equal(
    getClientRuntimeConfig(config, {
      platform: "android",
      build: "30"
    }).monetization.premiumEnabled,
    false
  );
});

test("getRuntimeConfig does not treat localhost as a public friend link", () => {
  const config = getRuntimeConfig({
    APP_PUBLIC_URL: "http://127.0.0.1:4173",
    SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_ANON_KEY: "anon-key"
  });

  assert.equal(config.launch.publicUrlReady, false);
  assert.equal(config.launch.shareLinksReady, false);
});
