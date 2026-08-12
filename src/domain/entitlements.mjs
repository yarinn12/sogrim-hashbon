const REFERRAL_CODE_PATTERN = /^[a-f0-9]{20}$/;
const AD_ELIGIBLE_SCREENS = new Set(["home", "groups"]);
const ENTITLEMENT_SOURCES = new Set([
  "referral",
  "subscription",
  "promotion",
  "admin"
]);

export function emptyReferralProgramStatus(status = "loading") {
  return {
    status,
    referralCode: "",
    rewardDays: 30,
    annualRewardLimit: 12,
    rewardedReferrals: 0,
    pendingReferrals: 0,
    rejectedReferrals: 0,
    daysEarned: 0,
    lifetimeRewardedReferrals: 0,
    lifetimeDaysEarned: 0,
    adFreeUntil: "",
    adFreeActive: false,
    subscriptionActive: false,
    activeEntitlementSources: []
  };
}

export function normalizeReferralProgramStatus(payload) {
  const value = payload && typeof payload === "object" ? payload : {};
  const referralCode = String(value.referral_code ?? "").trim().toLowerCase();
  const adFreeUntil = validDateString(value.ad_free_until);
  const activeEntitlementSources = normalizeEntitlementSources(
    value.active_entitlement_sources
  );
  const adFreeActive =
    Boolean(value.ad_free_active) &&
    Boolean(adFreeUntil) &&
    new Date(adFreeUntil).getTime() > Date.now();

  return {
    status: "ready",
    referralCode: REFERRAL_CODE_PATTERN.test(referralCode) ? referralCode : "",
    rewardDays: positiveInteger(value.reward_days, 30),
    annualRewardLimit: positiveInteger(value.annual_reward_limit, 12),
    rewardedReferrals: nonNegativeInteger(value.rewarded_referrals),
    pendingReferrals: nonNegativeInteger(value.pending_referrals),
    rejectedReferrals: nonNegativeInteger(value.rejected_referrals),
    daysEarned: nonNegativeInteger(value.days_earned),
    lifetimeRewardedReferrals: nonNegativeInteger(
      value.lifetime_rewarded_referrals ?? value.rewarded_referrals
    ),
    lifetimeDaysEarned: nonNegativeInteger(
      value.lifetime_days_earned ?? value.days_earned
    ),
    adFreeUntil,
    adFreeActive,
    subscriptionActive:
      adFreeActive &&
      Boolean(value.subscription_active) &&
      activeEntitlementSources.includes("subscription"),
    activeEntitlementSources
  };
}

export function isAdFreeActive(status, now = Date.now()) {
  const expiresAt = new Date(status?.adFreeUntil ?? "").getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function adFreeDaysRemaining(status, now = Date.now()) {
  const expiresAt = new Date(status?.adFreeUntil ?? "").getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 0;
  return Math.max(1, Math.ceil((expiresAt - now) / 86_400_000));
}

export function referralAnnualProgress(status) {
  const rewarded = nonNegativeInteger(status?.rewardedReferrals);
  const limit = positiveInteger(status?.annualRewardLimit, 12);
  return {
    rewarded,
    limit,
    remaining: Math.max(0, limit - rewarded),
    percentage: Math.min(100, Math.round((rewarded / limit) * 100))
  };
}

export function canDisplayAds({
  config,
  entitlementStatus,
  screenKind,
  platform,
  dialogOpen = false
}) {
  const monetization = config?.monetization ?? {};
  const accountId = config?.storage?.account?.userId ?? "";
  const rolloutEligible =
    monetization.adsEnabled &&
    isAccountInAdRollout(accountId, monetization.rolloutPercent);
  const testModeEligible = Boolean(monetization.testMode);

  return Boolean(
    (testModeEligible || rolloutEligible) &&
      (testModeEligible || monetization.androidBannerId) &&
      platform === "android" &&
      entitlementStatus?.status === "ready" &&
      AD_ELIGIBLE_SCREENS.has(screenKind) &&
      !dialogOpen &&
      !isAdFreeActive(entitlementStatus)
  );
}

export function isAccountInAdRollout(accountId, rolloutPercent) {
  const normalizedAccountId = String(accountId ?? "").trim();
  const percentage = Math.min(100, Math.max(0, Number(rolloutPercent) || 0));
  if (!normalizedAccountId || percentage <= 0) return false;
  if (percentage >= 100) return true;

  let hash = 2166136261;
  for (let index = 0; index < normalizedAccountId.length; index += 1) {
    hash ^= normalizedAccountId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 10_000 < percentage * 100;
}

function nonNegativeInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function validDateString(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function normalizeEntitlementSources(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((source) => String(source ?? "").trim().toLowerCase())
        .filter((source) => ENTITLEMENT_SOURCES.has(source))
    )
  ].sort();
}
