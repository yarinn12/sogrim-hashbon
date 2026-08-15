export const ACCESSIBILITY_PREFERENCES_STORAGE_KEY =
  "settle-friends-accessibility-preferences-v1";

export const DEFAULT_ACCESSIBILITY_PREFERENCES = Object.freeze({
  textSize: "system",
  highContrast: false,
  reduceMotion: false
});

const TEXT_SIZES = new Set(["system", "large", "extra-large"]);

export function normalizeAccessibilityPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const textSize = String(source.textSize ?? "").trim();

  return {
    textSize: TEXT_SIZES.has(textSize) ? textSize : "system",
    highContrast: source.highContrast === true,
    reduceMotion: source.reduceMotion === true
  };
}

export function loadAccessibilityPreferences(
  storage = globalThis.localStorage
) {
  try {
    const raw = storage?.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    return normalizeAccessibilityPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFERENCES };
  }
}

export function saveAccessibilityPreferences(
  preferences,
  storage = globalThis.localStorage
) {
  const normalized = normalizeAccessibilityPreferences(preferences);
  try {
    storage?.setItem(
      ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // Accessibility preferences still apply for the current session.
  }
  return normalized;
}
