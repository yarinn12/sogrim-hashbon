// A web callback has no access to the PKCE verifier in the native WKWebView.
// Return only the bound, single-use result to the initiating iOS auth session.
export function nativeAuthReturn(url) {
  if (!url.searchParams.has("native_auth_session")) return null;
  const params = url.searchParams;
  const one = name => params.getAll(name).length === 1 ? params.get(name) : "";
  const flow = one("auth_flow");
  const code = one("code");
  const error = one("error");
  if (one("native_auth_session") !== "1" || !/^[A-Za-z0-9_-]{20,128}$/.test(flow) ||
      (params.has("code") === params.has("error")) ||
      !(code || error) || (code || error).length > 2048 || /[\s\x00-\x1f\x7f]/.test(code || error)) {
    return { status: 400, location: "" };
  }
  const destination = new URL("com.sogrimhashbon.app://auth/callback");
  destination.searchParams.set("auth_flow", flow);
  destination.searchParams.set(code ? "code" : "error", code || error);
  return { status: 302, location: destination.href };
}
