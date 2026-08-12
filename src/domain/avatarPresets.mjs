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

export function normalizeAvatarPreset(value) {
  const preset = String(value ?? "").trim();
  return AVATAR_PRESET_IDS.has(preset) ? preset : "";
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

function stableAvatarIndex(value) {
  let hash = 0;
  for (const character of Array.from(String(value))) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash % AVATAR_PRESETS.length;
}
