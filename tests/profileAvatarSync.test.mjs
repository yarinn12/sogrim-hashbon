import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileAvatar } from "../src/domain/profileAvatarSync.mjs";

const chosenAvatar = "https://lh3.googleusercontent.com/chosen.webp";

test("an empty installation cannot erase a chosen avatar", () => {
  const result = resolveProfileAvatar(
    {
      avatarImage: chosenAvatar,
      avatarImageUpdatedAt: "2026-08-25T10:00:00.000Z"
    },
    { avatarImage: "", avatarImageUpdatedAt: "" }
  );

  assert.equal(result.avatarImage, chosenAvatar);
  assert.equal(result.source, "local");
  assert.equal(result.needsRemoteSync, true);
});

test("a newer explicit avatar removal clears every device", () => {
  const result = resolveProfileAvatar(
    {
      avatarImage: chosenAvatar,
      avatarImageUpdatedAt: "2026-08-25T10:00:00.000Z"
    },
    {
      avatarImage: "",
      avatarImageUpdatedAt: "2026-08-25T11:00:00.000Z"
    }
  );

  assert.equal(result.avatarImage, "");
  assert.equal(result.source, "remote");
  assert.equal(result.needsRemoteSync, false);
});

test("a device without avatar knowledge adopts the cloud image", () => {
  const result = resolveProfileAvatar(
    {},
    {
      avatarImage: chosenAvatar,
      avatarImageUpdatedAt: "2026-08-25T10:00:00.000Z"
    }
  );

  assert.equal(result.avatarImage, chosenAvatar);
  assert.equal(result.source, "remote");
});

test("a blank device without an avatar decision never requests a cloud clear", () => {
  const result = resolveProfileAvatar({}, {});

  assert.equal(result.avatarImage, "");
  assert.equal(result.avatarImageUpdatedAt, "");
  assert.equal(result.needsRemoteSync, false);
});

test("equal avatar timestamps converge on the remote canonical image", () => {
  const updatedAt = "2026-08-25T10:00:00.000Z";
  const result = resolveProfileAvatar(
    {
      avatarImage: "https://lh3.googleusercontent.com/old.webp",
      avatarImageUpdatedAt: updatedAt
    },
    {
      avatarImage: chosenAvatar,
      avatarImageUpdatedAt: updatedAt
    }
  );

  assert.equal(result.avatarImage, chosenAvatar);
  assert.equal(result.source, "remote");
  assert.equal(result.needsRemoteSync, false);
});
