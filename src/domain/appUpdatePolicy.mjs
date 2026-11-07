function positiveBuild(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

export function validNativeStoreUrl(platform, value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (platform === "android") {
      return url.hostname === "play.google.com" &&
        url.pathname === "/store/apps/details" &&
        url.searchParams.get("id") === "com.sogrimhashbon.app";
    }
    if (platform === "ios") {
      return url.hostname === "apps.apple.com" && /\/id\d+$/.test(url.pathname);
    }
  } catch {}
  return false;
}

export function decideNativeUpdate(platform, currentBuild, policy, {
  deferredBuild = 0, unsafeWork = false
} = {}) {
  const none = { kind: "none" };
  if (!["android", "ios"].includes(platform)) return none;
  const current = positiveBuild(currentBuild);
  const latest = positiveBuild(policy?.latestAvailableBuild);
  const minimum = positiveBuild(policy?.minimumSupportedBuild);
  if (!current || latest <= current || policy?.releaseAvailableToAll !== true ||
      !validNativeStoreUrl(platform, policy?.storeUrl)) return none;
  if (policy?.critical === true && minimum > current && latest < minimum) return none;

  const required = policy?.critical === true && minimum > current && latest >= minimum;
  if (!required && positiveBuild(deferredBuild) === latest) return none;
  if (unsafeWork) return { kind: "deferred", targetBuild: latest, required };
  return {
    kind: required ? "required" : "optional",
    targetBuild: latest,
    storeUrl: policy.storeUrl
  };
}
