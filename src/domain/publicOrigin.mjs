export const PUBLIC_ORIGIN = "https://sogrim-hesbon-app.vercel.app";
export const RECOVERY_PUBLIC_ORIGIN = "https://sogrim-hashbon-recovery.onrender.com";

export function normalizePublicOrigin(value, fallback = "") {
  try {
    const url = new URL(String(value ?? "").trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password
    ) {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}

export function runtimePublicOrigin(config = globalThis.SogrimNativeRuntimeConfig) {
  return normalizePublicOrigin(config?.publicUrl, PUBLIC_ORIGIN);
}

export function runtimeApiOrigins(config = globalThis.SogrimNativeRuntimeConfig) {
  return [...new Set([
    normalizePublicOrigin(config?.apiBaseUrl),
    runtimePublicOrigin(config),
    RECOVERY_PUBLIC_ORIGIN
  ].filter(Boolean))];
}

export function allowedPublicHosts(publicUrl = "") {
  const origins = [
    PUBLIC_ORIGIN,
    RECOVERY_PUBLIC_ORIGIN,
    normalizePublicOrigin(publicUrl),
    runtimePublicOrigin()
  ].filter(Boolean);
  return new Set(origins.map((origin) => new URL(origin).hostname));
}

export function isAllowedPublicUrl(value, publicUrl = "") {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" && allowedPublicHosts(publicUrl).has(url.hostname);
  } catch {
    return false;
  }
}
