const SNAPSHOT_TABLE = "app_snapshots";

export function getRuntimeConfig(env = process.env, requestOrigin = "") {
  const publicUrl = normalizeUrl(env.APP_PUBLIC_URL || requestOrigin);
  const supabaseUrl = normalizeUrl(env.SUPABASE_URL ?? "");
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? "";
  const googleClientId = String(env.GOOGLE_CLIENT_ID ?? "").trim();
  const cloudStorageReady = Boolean(supabaseUrl && supabaseAnonKey);
  const publicUrlReady = isPublicHttpUrl(publicUrl);
  const googleAuthReady = Boolean(googleClientId);

  return {
    publicUrl,
    auth: {
      googleClientId
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
      shareLinksReady: publicUrlReady && cloudStorageReady
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
