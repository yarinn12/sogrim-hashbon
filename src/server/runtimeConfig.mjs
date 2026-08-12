const SNAPSHOT_TABLE = "app_snapshots";
const DEFAULT_ANDROID_AD_BUILD = 28;
const DEFAULT_ANDROID_PREMIUM_BUILD = 30;

export function getRuntimeConfig(env = process.env, requestOrigin = "") {
  const publicUrl = normalizeUrl(env.APP_PUBLIC_URL || requestOrigin);
  const supabaseUrl = normalizeUrl(env.SUPABASE_URL ?? "");
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? "";
  const googleClientId = String(env.GOOGLE_CLIENT_ID ?? "").trim();
  const androidBannerId = String(env.ADMOB_ANDROID_BANNER_ID ?? "").trim();
  const adsEnabled = parseBoolean(env.ADMOB_ENABLED) && Boolean(androidBannerId);
  const premiumProductId = String(
    env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID ?? ""
  ).trim();
  const premiumBasePlanId = String(
    env.GOOGLE_PLAY_PREMIUM_BASE_PLAN_ID ?? ""
  ).trim();
  const googlePlayServiceReady = Boolean(
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ||
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64
  );
  const subscriptionStorageReady = Boolean(
    supabaseUrl &&
    (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)
  );
  const premiumReady = Boolean(
    parseBoolean(env.GOOGLE_PLAY_PREMIUM_ENABLED) &&
    premiumProductId &&
    premiumBasePlanId &&
    googlePlayServiceReady &&
    subscriptionStorageReady
  );
  const accountDeletionReady = Boolean(
    supabaseUrl &&
    (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)
  );
  const firebasePushServerReady = Boolean(
    (
      env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
    ) &&
    (env.FIREBASE_PROJECT_ID || firebaseProjectId(env)) &&
    (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)
  );
  const cloudStorageReady = Boolean(supabaseUrl && supabaseAnonKey);
  const publicUrlReady = isPublicHttpUrl(publicUrl);
  const googleAuthReady = Boolean(googleClientId);

  return {
    publicUrl,
    auth: {
      googleClientId
    },
    monetization: {
      adsEnabled,
      androidBannerId,
      testMode: parseBoolean(env.ADMOB_TEST_MODE),
      rolloutPercent: percentage(env.ADMOB_ROLLOUT_PERCENT),
      minimumAndroidBuild: positiveInteger(
        env.ADMOB_MIN_ANDROID_BUILD,
        DEFAULT_ANDROID_AD_BUILD
      ),
      sponsoredCardsEnabled: parseBoolean(env.SPONSORED_CARDS_ENABLED),
      referralRewardDays: 30,
      premiumEnabled: premiumReady,
      premiumProductId,
      premiumBasePlanId,
      premiumMinimumAndroidBuild: positiveInteger(
        env.GOOGLE_PLAY_PREMIUM_MIN_ANDROID_BUILD,
        DEFAULT_ANDROID_PREMIUM_BUILD
      )
    },
    storage: cloudStorageReady
      ? {
          mode: "supabase",
          url: supabaseUrl,
          anonKey: supabaseAnonKey,
          table: env.SUPABASE_SNAPSHOT_TABLE || SNAPSHOT_TABLE,
          spaceId: env.APP_SPACE_ID || "default"
        }
      : { mode: "local" },
    launch: {
      publicUrlReady,
      cloudStorageReady,
      googleAuthReady,
      accountDeletionReady,
      googlePlayBillingReady: premiumReady,
      pushDeliveryReady: firebasePushServerReady,
      shareLinksReady: publicUrlReady && cloudStorageReady
    }
  };
}

function firebaseProjectId(env) {
  try {
    const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
    const encoded = String(
      env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 ?? ""
    ).trim();
    const json = raw || (
      encoded ? Buffer.from(encoded, "base64").toString("utf8") : ""
    );
    return String(JSON.parse(json || "{}")?.project_id ?? "").trim();
  } catch {
    return "";
  }
}

export function getClientRuntimeConfig(
  config,
  { platform = "", build = "" } = {}
) {
  const monetization = config?.monetization ?? {};
  const clientBuild = nonNegativeInteger(build);
  const minimumAndroidBuild = positiveInteger(
    monetization.minimumAndroidBuild,
    DEFAULT_ANDROID_AD_BUILD
  );
  const eligibleAndroidBuild =
    String(platform).trim().toLowerCase() === "android" &&
    clientBuild >= minimumAndroidBuild;
  const rolloutPercent = percentage(monetization.rolloutPercent);
  const premiumMinimumAndroidBuild = positiveInteger(
    monetization.premiumMinimumAndroidBuild,
    DEFAULT_ANDROID_PREMIUM_BUILD
  );
  const eligiblePremiumBuild =
    String(platform).trim().toLowerCase() === "android" &&
    clientBuild >= premiumMinimumAndroidBuild;

  return {
    ...config,
    monetization: {
      ...monetization,
      adsEnabled: Boolean(
        monetization.adsEnabled &&
        eligibleAndroidBuild &&
        rolloutPercent > 0
      ),
      testMode: Boolean(monetization.testMode && eligibleAndroidBuild),
      rolloutPercent,
      minimumAndroidBuild,
      premiumEnabled: Boolean(
        monetization.premiumEnabled && eligiblePremiumBuild
      ),
      premiumMinimumAndroidBuild
    }
  };
}

function normalizeUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}

function isPublicHttpUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

function percentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function nonNegativeInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
