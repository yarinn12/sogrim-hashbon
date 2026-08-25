import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  adFreeDaysRemaining,
  canDisplayAds,
  isAdFreeActive,
  isAccountInAdRollout,
  normalizeReferralProgramStatus,
  referralAnnualProgress
} from "../src/domain/entitlements.mjs";

test("ad-free status and annual referral progress are deterministic", () => {
  const status = normalizeReferralProgramStatus({
    referral_code: "0123456789abcdefabcd",
    rewarded_referrals: 3,
    annual_reward_limit: 12,
    ad_free_until: "2099-01-01T00:00:00.000Z",
    ad_free_active: true,
    subscription_active: true,
    active_entitlement_sources: [
      "subscription",
      "subscription",
      "unknown-source"
    ]
  });

  assert.equal(isAdFreeActive(status), true);
  assert.equal(status.subscriptionActive, true);
  assert.deepEqual(status.activeEntitlementSources, ["subscription"]);
  assert.deepEqual(referralAnnualProgress(status), {
    rewarded: 3,
    limit: 12,
    remaining: 9,
    percentage: 25
  });
});

test("a referral reward hides ads without requiring a paid subscription", () => {
  const status = normalizeReferralProgramStatus({
    referral_code: "0123456789abcdefabcd",
    rewarded_referrals: 1,
    ad_free_until: "2099-01-01T00:00:00.000Z",
    ad_free_active: true,
    subscription_active: false,
    active_entitlement_sources: ["referral"]
  });

  assert.equal(status.adFreeActive, true);
  assert.equal(status.subscriptionActive, false);
  assert.deepEqual(status.activeEntitlementSources, ["referral"]);
  assert.equal(isAdFreeActive(status), true);
});

test("ad-free time reports whole remaining calendar days without reaching zero early", () => {
  const now = Date.parse("2026-07-27T00:00:00.000Z");

  assert.equal(
    adFreeDaysRemaining(
      { adFreeUntil: "2026-07-27T00:00:00.001Z" },
      now
    ),
    1
  );
  assert.equal(
    adFreeDaysRemaining(
      { adFreeUntil: "2026-07-29T00:00:00.000Z" },
      now
    ),
    2
  );
  assert.equal(
    adFreeDaysRemaining(
      { adFreeUntil: "2026-07-26T23:59:59.999Z" },
      now
    ),
    0
  );
});

test("ads are limited to non-financial Android screens and respect entitlements", () => {
  const config = {
    monetization: {
      adsEnabled: true,
      androidBannerId: "test-banner",
      rolloutPercent: 100
    },
    storage: { account: { userId: "account-one" } }
  };
  const expired = {
    status: "ready",
    adFreeUntil: "2020-01-01T00:00:00.000Z"
  };
  const active = {
    status: "ready",
    adFreeUntil: "2099-01-01T00:00:00.000Z"
  };
  const internalTestConfig = {
    monetization: {
      adsEnabled: false,
      testMode: true
    }
  };

  assert.equal(
    canDisplayAds({
      config,
      entitlementStatus: expired,
      screenKind: "home",
      platform: "android"
    }),
    true
  );
  assert.equal(
    canDisplayAds({
      config: internalTestConfig,
      entitlementStatus: expired,
      screenKind: "home",
      platform: "android"
    }),
    true
  );
  assert.equal(
    canDisplayAds({
      config: internalTestConfig,
      entitlementStatus: expired,
      screenKind: "settlement",
      platform: "android"
    }),
    false
  );
  assert.equal(
    canDisplayAds({
      config: internalTestConfig,
      entitlementStatus: active,
      screenKind: "home",
      platform: "android"
    }),
    false
  );
  assert.equal(
    canDisplayAds({
      config,
      entitlementStatus: expired,
      screenKind: "groups",
      platform: "android"
    }),
    true
  );
  assert.equal(
    canDisplayAds({
      config,
      entitlementStatus: expired,
      screenKind: "home",
      platform: "android",
      dialogOpen: true
    }),
    false
  );
  for (const screenKind of ["event", "settlement", "profile", "new-event"]) {
    assert.equal(
      canDisplayAds({
        config,
        entitlementStatus: expired,
        screenKind,
        platform: "android"
      }),
      false
    );
  }
  assert.equal(
    canDisplayAds({
      config,
      entitlementStatus: active,
      screenKind: "home",
      platform: "android"
    }),
    false
  );
  assert.equal(
    canDisplayAds({
      config,
      entitlementStatus: expired,
      screenKind: "home",
      platform: "web"
    }),
    false
  );
  for (const status of ["loading", "error", "signed-out"]) {
    assert.equal(
      canDisplayAds({
        config,
        entitlementStatus: { status },
        screenKind: "home",
        platform: "android"
      }),
      false
    );
  }
});

test("production ad rollout is stable per signed-in account and fails closed", () => {
  const accountId = "account-stable";

  assert.equal(isAccountInAdRollout("", 100), false);
  assert.equal(isAccountInAdRollout(accountId, 0), false);
  assert.equal(isAccountInAdRollout(accountId, 100), true);
  assert.equal(
    isAccountInAdRollout(accountId, 17),
    isAccountInAdRollout(accountId, 17)
  );
});

test("Supabase owns referral attribution, qualification and entitlements", async () => {
  const [schema, applySchema] = await Promise.all([
    readFile("supabase/schema.sql", "utf8"),
    readFile("scripts/apply-supabase-schema.mjs", "utf8")
  ]);

  assert.match(schema, /create table if not exists public\.referrals/);
  assert.match(schema, /create table if not exists public\.user_entitlements/);
  assert.match(schema, /create table if not exists public\.subscription_purchases/);
  assert.match(schema, /alter table public\.referrals force row level security/);
  assert.match(schema, /alter table public\.user_entitlements force row level security/);
  assert.match(
    schema,
    /alter table public\.subscription_purchases force row level security/
  );
  assert.match(schema, /invited_user_id uuid not null unique/);
  assert.match(schema, /Referral rewards are available to new accounts only/);
  assert.match(schema, /actor_created_at < pg_catalog\.now\(\) - interval '1 hour'/);
  assert.match(schema, /actor_is_anonymous/);
  assert.match(
    schema,
    /referral\.claimed_at > account_created_at \+ interval '1 hour'/
  );
  assert.match(schema, /rejection_reason = 'existing_account'/);
  assert.match(schema, /You cannot refer yourself/);
  assert.match(schema, /on conflict \(invited_user_id\) do nothing/);
  assert.match(schema, /'claimed', false/);
  assert.match(schema, /account_email_confirmed_at is null/);
  assert.match(schema, /private\.shared_event_qualification_activity/);
  assert.match(schema, /activity_kind in \('expense_created', 'transfer_paid'\)/);
  assert.match(schema, /actor_user_id = actor_id/);
  assert.match(schema, /activity\.recorded_at >= referral\.claimed_at/);
  assert.match(schema, /rewarded_last_year >= 12/);
  assert.match(
    schema,
    /referral\.rewarded_at >= pg_catalog\.now\(\) - interval '365 days'/
  );
  assert.match(
    schema,
    /referral\.claimed_at >= pg_catalog\.now\(\) - interval '30 days'/
  );
  assert.match(schema, /'lifetime_rewarded_referrals'/);
  assert.match(schema, /'lifetime_days_earned'/);
  assert.match(schema, /set search_path = ''/);
  assert.match(schema, /create or replace function public\.record_verified_subscription/);
  assert.match(schema, /purchase_token_hash ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(schema, /Subscription purchase belongs to another account/);
  assert.match(
    schema,
    /revoke all on function public\.record_verified_subscription\([\s\S]+?\) from public, anon, authenticated/
  );
  assert.match(
    schema,
    /grant execute on function public\.record_verified_subscription\([\s\S]+?\) to service_role/
  );
  assert.doesNotMatch(
    schema,
    /grant execute on function public\.record_verified_subscription\([^;]+?\) to authenticated/
  );
  assert.doesNotMatch(
    schema,
    /pg_catalog\.(?:coalesce|greatest|least|nullif)\(/i,
    "PostgreSQL conditional expressions must not be schema-qualified"
  );
  assert.doesNotMatch(
    schema,
    /grant\s+(?:select,\s*)?insert[^;]+public\.referrals to authenticated/i
  );
  assert.doesNotMatch(
    schema,
    /grant\s+(?:select,\s*)?insert[^;]+public\.user_entitlements to authenticated/i
  );
  assert.doesNotMatch(
    schema,
    /grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]+public\.subscription_purchases to authenticated/i
  );
  assert.match(applySchema, /referrals_ready/);
  assert.match(applySchema, /entitlements_ready/);
  assert.match(applySchema, /subscriptions_ready/);
  assert.match(applySchema, /subscription_rls_ready/);
  assert.match(applySchema, /subscription_client_locked/);
  assert.match(applySchema, /referral_claim_ready/);
  assert.match(applySchema, /referral_qualify_ready/);
  assert.match(applySchema, /referral_status_ready/);
  assert.match(applySchema, /referral_tables_client_locked/);
  assert.match(applySchema, /referral_function_access_ready/);
  assert.match(applySchema, /subscription_record_ready/);
  assert.match(applySchema, /subscription_function_locked/);
});

test("referral UI and AdMob foundation preserve financial focus", async () => {
  const [
    packageJson,
    index,
    referralLayer,
    adLayer,
    manifest,
    strings,
    app,
    server,
    nativeFinalizer
  ] = await Promise.all([
      readFile("package.json", "utf8").then(JSON.parse),
      readFile("index.html", "utf8"),
      readFile("src/publicReferralRewardsLayer.mjs", "utf8"),
      readFile("src/publicAdLayer.mjs", "utf8"),
      readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
      readFile("android/app/src/main/res/values/strings.xml", "utf8"),
      readFile("src/app.mjs", "utf8"),
      readFile("server.mjs", "utf8"),
      readFile("scripts/finalize-native-projects.mjs", "utf8")
    ]);

  assert.ok(packageJson.dependencies["@capacitor-community/admob"]);
  assert.match(index, /publicReferralRewardsLayer\.mjs/);
  assert.match(index, /publicAdLayer\.mjs/);
  assert.match(referralLayer, /data-open-referral-rewards/);
  assert.match(referralLayer, /screen\.matches\('\[data-screen-kind="home"\]'\)/);
  assert.match(referralLayer, /referralRewardCard\("home"\)/);
  assert.match(referralLayer, /referralRewardCard\("profile"\)/);
  assert.match(referralLayer, /syncReferralRewardCard/);
  assert.match(referralLayer, /data-referral-context="friends"/);
  assert.doesNotMatch(referralLayer, /syncReferralRewardCard\(screen, "friends"/);
  assert.match(referralLayer, /existing\.outerHTML = referralRewardCard\(context\)/);
  assert.match(referralLayer, /adFreeDaysRemaining/);
  assert.doesNotMatch(referralLayer, /querySelector\("\.home-invite-shortcuts"\)/);
  assert.match(referralLayer, /חודש ללא פרסומות/);
  assert.match(referralLayer, /הטבת חברים/);
  assert.match(referralLayer, /הזמנת חברים/);
  assert.match(referralLayer, /\.referral-reward-card\.is-home/);
  assert.match(referralLayer, /transform: scale\(0\.96\)/);
  assert.doesNotMatch(app, /function renderHomeEventTools/);
  assert.match(referralLayer, /settle-friends:native-back/);
  assert.match(referralLayer, /setReferralBackgroundInert\(true\)/);
  assert.match(referralLayer, /trapReferralDialogFocus/);
  assert.match(referralLayer, /if \(referralBusy && \["copy", "share"\]\.includes\(action\)\) return/);
  assert.match(referralLayer, /aria-busy="true"/);
  assert.match(referralLayer, /visibilitychange/);
  assert.match(referralLayer, /addEventListener\("online"/);
  assert.match(referralLayer, /PENDING_REFERRAL_CODE_KEY/);
  assert.match(referralLayer, /PENDING_REFERRAL_MAX_AGE_MS/);
  assert.match(referralLayer, /JSON\.stringify\(\{\s*code: normalizedCode,\s*savedAt: Date\.now\(\)/);
  assert.match(referralLayer, /isTerminalReferralClaimError/);
  assert.match(referralLayer, /recoverReferralAfterReconnect/);
  assert.match(referralLayer, /savePendingReferralCode\(referralCodeFromCurrentUrl\)/);
  assert.match(referralLayer, /if \(refreshRequest\) return refreshRequest/);
  assert.match(referralLayer, /referralStatus\.status === "ready"/);
  assert.match(referralLayer, /refreshReferralStatus\(\);/);
  assert.match(referralLayer, /\.\.\.referralStatus,\s*status: "error"/);
  assert.match(referralLayer, /class="referral-state-message is-stale"/);
  assert.match(referralLayer, /הקישור האישי שלך ממשיך לעבוד/);
  assert.match(referralLayer, /loadReferralStatusWithAccountRecovery/);
  assert.match(referralLayer, /SogrimAccountSession\?\.refresh/);
  assert.match(referralLayer, /Number\(error\?\.status\) === 401/);
  assert.match(referralLayer, /createQrSvg/);
  assert.match(referralLayer, /data-referral-qr/);
  assert.match(referralLayer, /QR להזמנת חברים לסוגרים חשבון/);
  assert.match(referralLayer, /data-referral-action="profile"/);
  assert.match(referralLayer, /data-action="edit-profile"/);
  assert.match(referralLayer, /navigator\.share/);
  assert.match(adLayer, /syncInFlight/);
  assert.match(adLayer, /syncRequestedAfterFlight/);
  assert.match(adLayer, /adSize:\s*"ADAPTIVE_BANNER"/);
  assert.match(adLayer, /BOTTOM_CENTER/);
  assert.match(adLayer, /ca-app-pub-3940256099942544\/6300978111/);
  assert.match(
    adLayer,
    /testMode\s*\?\s*GOOGLE_ANDROID_FIXED_TEST_BANNER_ID/
  );
  assert.match(adLayer, /margin: 0/);
  assert.match(adLayer, /npa: true/);
  assert.match(adLayer, /bannerAdLoaded/);
  assert.match(adLayer, /bannerAdSizeChanged/);
  assert.match(adLayer, /bannerAdFailedToLoad/);
  assert.match(adLayer, /isTextEntryActive/);
  assert.match(adLayer, /BANNER_RETRY_DELAY_MS/);
  assert.match(adLayer, /let consentState = "unknown"/);
  assert.match(adLayer, /let consentRequest = null/);
  assert.match(adLayer, /if \(consentRequest\) return consentRequest/);
  assert.match(adLayer, /if \(\["blocked", "error"\]\.includes\(consentState\)\) return false/);
  assert.match(adLayer, /privacyOptionsRequirementStatus === "REQUIRED"/);
  assert.match(adLayer, /settle-friends:ad-consent-changed/);
  assert.match(
    adLayer,
    /if \(!\(await ensureConsent\(admob\)\)\) return;\s*await initializeAdMob\(admob\);\s*await prepareBannerListeners\(admob\);/
  );
  assert.match(adLayer, /await removeBanner\(\);\s*await admob\.showPrivacyOptionsForm\(\)/);
  assert.match(adLayer, /document\.addEventListener\("visibilitychange", scheduleAdSync\)/);
  assert.match(adLayer, /window\.addEventListener\("offline", removeBanner\)/);
  assert.match(adLayer, /navigator\.onLine === false/);
  assert.match(adLayer, /document\.visibilityState === "hidden"/);
  assert.match(adLayer, /bannerRequested \|\| bannerVisible/);
  assert.match(
    adLayer,
    /clearBannerRetry\(\);\s*clearBannerPresentation\(\);\s*if \(!shouldRemove\) return/
  );
  assert.match(
    adLayer,
    /clearBannerPresentation\(\);\s*clearBannerRetry\(\);\s*if \(!currentPlacementEligible\(\)\) return/
  );
  assert.match(adLayer, /native-ad-banner-height/);
  assert.match(adLayer, /settle-friends:accessibility-center-changed/);
  assert.match(adLayer, /accessibility-center-open/);
  assert.match(adLayer, /\.accessibility-center/);
  assert.match(
    adLayer,
    /html\.native-app body\.native-ad-banner-visible \.product-app-nav/
  );
  assert.match(adLayer, /showPrivacyOptionsForm/);
  assert.doesNotMatch(adLayer, /showInterstitial|showRewardVideo|showAppOpen/);
  assert.match(manifest, /com\.google\.android\.gms\.ads\.APPLICATION_ID/);
  assert.match(strings, /admob_app_id/);
  assert.doesNotMatch(strings, /ca-app-pub-3940256099942544/);
  assert.match(nativeFinalizer, /clampBannerContainerToAdHeight/);
  assert.match(nativeFinalizer, /getHeightInPixels/);
  assert.match(nativeFinalizer, /bottomInset \+ densityMargin/);
  assert.match(nativeFinalizer, /mAdViewLayoutParams\.leftMargin/);
  assert.match(app, /settle-friends:qualifying-activity/);
  assert.match(app, /"expense-created"/);
  assert.match(app, /"transfer-paid"/);
  assert.match(app, /prepareReferralForEventInvite/);
  assert.match(app, /currentReferralInviteCode/);
  assert.match(app, /referralCode/);
  assert.match(app, /#public-referral-rewards-dialog/);
  assert.match(app, /data-action="groups" data-tab="people"/);
  assert.match(server, /\\\/r\\\/\[a-f0-9\]\{20\}/i);
  assert.match(server, /x-sogrim-app-build/);
  assert.match(server, /getClientRuntimeConfig/);
});
