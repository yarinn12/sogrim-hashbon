export const AVATAR_PRESETS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    return Object.freeze({
      id: `avatar-${number}`,
      label: `תמונת פרופיל ${number}`,
      src: `./assets/avatars/avatar-${number}.png`
    });
  })
);

const AVATAR_PRESET_IDS = new Set(AVATAR_PRESETS.map((preset) => preset.id));
const AVATAR_IMAGE_DATA_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;
const MAX_AVATAR_DATA_LENGTH = 180_000;
const MAX_AVATAR_URL_LENGTH = 2_048;

export function normalizeAvatarPreset(value) {
  const preset = String(value ?? "").trim();
  return AVATAR_PRESET_IDS.has(preset) ? preset : "";
}

export function normalizeAvatarImage(value) {
  const image = String(value ?? "").trim();
  if (!image) return "";
  if (
    image.length <= MAX_AVATAR_DATA_LENGTH &&
    AVATAR_IMAGE_DATA_PATTERN.test(image)
  ) {
    return image;
  }
  if (image.length > MAX_AVATAR_URL_LENGTH) return "";
  try {
    const url = new URL(image);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function avatarPresetForParticipant(participant, fallbackKey = "") {
  const selectedPreset = normalizeAvatarPreset(participant?.avatarPreset);
  if (selectedPreset) return selectedPreset;

  const identity = String(
    participant?.id ??
      participant?.displayName ??
      fallbackKey ??
      ""
  );
  return AVATAR_PRESETS[stableAvatarIndex(identity)].id;
}

export function avatarPresetSource(value) {
  const preset = normalizeAvatarPreset(value) || AVATAR_PRESETS[0].id;
  return AVATAR_PRESETS.find((item) => item.id === preset)?.src ?? AVATAR_PRESETS[0].src;
}

export function avatarSourceForParticipant(participant, fallbackKey = "") {
  return (
    normalizeAvatarImage(participant?.avatarImage) ||
    avatarPresetSource(avatarPresetForParticipant(participant, fallbackKey))
  );
}

function stableAvatarIndex(value) {
  let hash = 0;
  for (const character of Array.from(String(value))) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash % AVATAR_PRESETS.length;
}
