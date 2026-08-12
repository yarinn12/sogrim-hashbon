export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

export function normalizeUsername(value) {
  const username = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : "";
}

export function formatUsername(value) {
  const username = normalizeUsername(value);
  return username ? `@${username}` : "";
}

export function profileUsername(profile) {
  return profile?.username_customized === true
    ? normalizeUsername(profile.username)
    : "";
}

export function usernameValidationMessage(value) {
  const candidate = String(value ?? "").trim().replace(/^@+/, "");
  if (!candidate) return "צריך לבחור שם משתמש.";
  return "שם המשתמש צריך להתחיל באות באנגלית ולכלול 3–24 תווים: אותיות, מספרים או קו תחתון.";
}
