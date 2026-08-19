export function nativeRuntimeCompatibility(
  config,
  { expectedAndroidBuild = 0 } = {}
) {
  if (config?.storage?.mode !== "supabase") {
    return incompatible("cloud storage is not Supabase");
  }
  if (!isHttpsUrl(config.storage?.url)) {
    return incompatible("Supabase URL is missing");
  }
  if (!String(config.storage?.anonKey ?? "").trim()) {
    return incompatible("Supabase public key is missing");
  }

  const expectedBuild = nonNegativeInteger(expectedAndroidBuild);
  if (expectedBuild > 0) {
    const policy = config?.updates?.android;
    if (!policy) return incompatible("Android update policy is missing");
    if (nonNegativeInteger(policy.currentBuild) !== expectedBuild) {
      return incompatible("Android update policy does not match the current build");
    }
    if (typeof policy.required !== "boolean") {
      return incompatible("Android update decision is missing");
    }
    if (!isHttpsUrl(policy.storeUrl)) {
      return incompatible("Android store URL is missing");
    }
  }

  return { ok: true, reason: "" };
}

function incompatible(reason) {
  return { ok: false, reason };
}

function nonNegativeInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value ?? "").trim()).protocol === "https:";
  } catch {
    return false;
  }
}
