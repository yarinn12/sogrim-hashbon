const CONSUMED_FLOWS_KEY = "settle-friends-native-auth-callback-flows";
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const MAX_CONSUMED_FLOWS = 8;

// Capacitor iOS keeps the last universal link across WebView reloads. Remember
// only its opaque, single-use flow ID for this WebView session, never a code or
// recovery token. Account auth still validates the saved PKCE/recovery binding.
export async function claimNativeAuthCallback(value, storage = globalThis.sessionStorage, cryptoImpl = globalThis.crypto) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  const flowId = url.searchParams.get("auth_flow") ?? "";
  let key = FLOW_ID_PATTERN.test(flowId) ? `flow:${flowId}` : "";
  if (!key) {
    // Legacy/unbound callbacks must reach the existing rejection path once too.
    // Hash their URL so duplicate detection never stores a code/recovery token.
    if (!cryptoImpl?.subtle) return true;
    const digest = new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(url.href)));
    key = `url:${Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  try {
    const saved = JSON.parse(storage?.getItem(CONSUMED_FLOWS_KEY) ?? "[]");
    const flows = Array.isArray(saved)
      ? saved.filter(id => typeof id === "string" && /^(?:flow:[A-Za-z0-9_-]{20,128}|url:[a-f0-9]{64})$/.test(id))
      : [];
    if (flows.includes(key)) return false;
    storage?.setItem(CONSUMED_FLOWS_KEY, JSON.stringify([...flows, key].slice(-MAX_CONSUMED_FLOWS)));
  } catch {
    // Callback verification remains available when optional session storage is
    // unavailable; the bridge's existing in-page duplicate guard still applies.
  }
  return true;
}
