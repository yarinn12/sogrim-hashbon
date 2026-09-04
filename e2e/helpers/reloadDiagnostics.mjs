// WebKit logs access-control failures as JS console errors; Playwright maps
// those to pageerror, even when the fetch rejection is handled. Only classify
// this native message while the test is replacing the old main document.
export function isWebKitReloadDiagnostic(error, { browserName, reloading, origin }) {
  const firstLine = String(error?.stack ?? "").split("\n")[0];
  return browserName === "webkit" && reloading === true &&
    error?.name === "Fetch API cannot load https" &&
    firstLine.startsWith(`Fetch API cannot load ${origin}/rest/v1/`) &&
    firstLine.endsWith(" due to access control checks.");
}
