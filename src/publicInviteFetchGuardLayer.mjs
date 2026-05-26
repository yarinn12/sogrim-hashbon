const inviteUrl = new URL(window.location.href);
const hasInviteSnapshot = Boolean(
  inviteUrl.searchParams.get("event") && inviteUrl.searchParams.get("invite")
);

if (hasInviteSnapshot) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    if (isSharedStateRead(input, init)) {
      return Promise.reject(new Error("Invite snapshot keeps local event state"));
    }

    return originalFetch(input, init);
  };
}

function isSharedStateRead(input, init) {
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;

  try {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    return url.origin === window.location.origin && url.pathname === "/api/state";
  } catch {
    return false;
  }
}
