const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const originalSetItem = Storage.prototype.setItem;

Storage.prototype.setItem = function guardedProfileSetItem(key, value) {
  if (key === LOCAL_PROFILE_KEY) {
    return originalSetItem.call(this, key, preserveGoogleAuthFields(this.getItem(key), value));
  }

  return originalSetItem.call(this, key, value);
};

function preserveGoogleAuthFields(previousRaw, nextRaw) {
  const previous = parseProfile(previousRaw);
  const next = parseProfile(nextRaw);

  if (!previous || !next) return nextRaw;
  if (previous.authProvider !== "google" || !previous.authSubject) return nextRaw;
  if (next.authProvider === "google" && next.authSubject) return nextRaw;
  if (previous.participantId !== next.participantId) return nextRaw;

  return JSON.stringify({
    ...next,
    authProvider: "google",
    authSubject: previous.authSubject,
    email: previous.email ?? ""
  });
}

function parseProfile(raw) {
  try {
    return JSON.parse(String(raw ?? ""));
  } catch {
    return null;
  }
}
