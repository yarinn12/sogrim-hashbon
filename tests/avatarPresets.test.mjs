import test from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_PRESETS,
  avatarPresetForParticipant,
  avatarPresetSource,
  normalizeAvatarPreset
} from "../src/domain/avatarPresets.mjs";

test("the app exposes six safe branded avatar presets", () => {
  assert.equal(AVATAR_PRESETS.length, 6);
  assert.deepEqual(
    AVATAR_PRESETS.map((preset) => preset.id),
    ["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"]
  );
  assert.equal(normalizeAvatarPreset("avatar-4"), "avatar-4");
  assert.equal(normalizeAvatarPreset("../../private"), "");
  assert.equal(avatarPresetSource("avatar-4"), "./assets/avatars/avatar-4.png");
});

test("legacy participants receive one stable picture without changing their data", () => {
  const participant = { id: "user-yarin", displayName: "Yarin Cohen" };
  const first = avatarPresetForParticipant(participant);
  const second = avatarPresetForParticipant({ ...participant });

  assert.equal(first, second);
  assert.match(first, /^avatar-[1-6]$/);
  assert.equal(participant.avatarPreset, undefined);
});

test("a selected preset always wins over the deterministic fallback", () => {
  assert.equal(
    avatarPresetForParticipant({
      id: "user-yarin",
      displayName: "Yarin Cohen",
      avatarPreset: "avatar-6"
    }),
    "avatar-6"
  );
});
