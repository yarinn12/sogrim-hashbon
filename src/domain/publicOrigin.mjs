export const PUBLIC_ORIGIN = "https://sogrim-hesbon-app.vercel.app";
export const LEGACY_PUBLIC_ORIGINS = new Set([
  "https://sogrim-hashbon.vercel.app"
]);

export function canonicalizePublicUrl(value, fallback = "") {
  try {
    const url = new URL(String(value ?? "").trim());
    if (LEGACY_PUBLIC_ORIGINS.has(url.origin)) {
      const current = new URL(PUBLIC_ORIGIN);
      url.protocol = current.protocol;
      url.host = current.host;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function canonicalPublicOrigin(value, fallback = PUBLIC_ORIGIN) {
  const normalized = normalizePublicOrigin(value);
  if (!normalized) return fallback;
  return normalizePublicOrigin(canonicalizePublicUrl(normalized), fallback);
}

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
  return canonicalPublicOrigin(config?.publicUrl, PUBLIC_ORIGIN);
}

export function runtimeApiOrigins(config = globalThis.SogrimNativeRuntimeConfig) {
  return [...new Set([
    canonicalPublicOrigin(config?.apiBaseUrl, ""),
    runtimePublicOrigin(config)
  ].filter(Boolean))];
}

export function allowedPublicHosts(publicUrl = "") {
  const origins = [
    PUBLIC_ORIGIN,
    canonicalPublicOrigin(publicUrl),
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
