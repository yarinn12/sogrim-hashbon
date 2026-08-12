const LOCAL_PROFILE_KEY = "settle-friends-local-profile";
const originalSetItem = Storage.prototype.setItem;

Storage.prototype.setItem = function guardedProfileSetItem(key, value) {
  if (
    key === LOCAL_PROFILE_KEY ||
    key.startsWith(`${LOCAL_PROFILE_KEY}:account:`)
  ) {
    return originalSetItem.call(this, key, preserveAccountAuthFields(this.getItem(key), value));
  }

  return originalSetItem.call(this, key, value);
};

function preserveAccountAuthFields(previousRaw, nextRaw) {
  const previous = parseProfile(previousRaw);
  const next = parseProfile(nextRaw);

  if (!previous || !next) return nextRaw;
  if (!["google", "apple", "email"].includes(previous.authProvider) || !previous.authSubject) {
    return nextRaw;
  }
  if (["google", "apple", "email"].includes(next.authProvider) && next.authSubject) return nextRaw;
  if (previous.participantId !== next.participantId) return nextRaw;

  return JSON.stringify({
    ...next,
    authProvider: previous.authProvider,
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
