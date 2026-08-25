import { normalizeAvatarImage } from "./avatarPresets.mjs";

export function normalizeAvatarImageUpdatedAt(value) {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function resolveProfileAvatar(localProfile = {}, remoteProfile = {}) {
  const localAvatarImage = normalizeAvatarImage(localProfile.avatarImage);
  const remoteAvatarImage = normalizeAvatarImage(remoteProfile.avatarImage);
  const localAvatarImageUpdatedAt = normalizeAvatarImageUpdatedAt(
    localProfile.avatarImageUpdatedAt
  );
  const remoteAvatarImageUpdatedAt = normalizeAvatarImageUpdatedAt(
    remoteProfile.avatarImageUpdatedAt
  );
  const localHasAvatarDecision = Boolean(
    localAvatarImage || localAvatarImageUpdatedAt
  );
  const remoteHasAvatarDecision = Boolean(
    remoteAvatarImage || remoteAvatarImageUpdatedAt
  );

  if (!remoteHasAvatarDecision) {
    return avatarResolution(
      localAvatarImage,
      localAvatarImageUpdatedAt,
      "local",
      localHasAvatarDecision &&
        (
          remoteAvatarImage !== localAvatarImage ||
          remoteAvatarImageUpdatedAt !== localAvatarImageUpdatedAt
        )
    );
  }
  if (!localHasAvatarDecision) {
    return avatarResolution(
      remoteAvatarImage,
      remoteAvatarImageUpdatedAt,
      "remote",
      false
    );
  }

  const localTime = Date.parse(localAvatarImageUpdatedAt || "1970-01-01");
  const remoteTime = Date.parse(remoteAvatarImageUpdatedAt || "1970-01-01");
  if (
    remoteTime > localTime ||
    (
      remoteTime === localTime &&
      remoteAvatarImage !== localAvatarImage
    )
  ) {
    return avatarResolution(
      remoteAvatarImage,
      remoteAvatarImageUpdatedAt,
      "remote",
      false
    );
  }

  return avatarResolution(
    localAvatarImage,
    localAvatarImageUpdatedAt,
    "local",
    remoteAvatarImage !== localAvatarImage ||
      remoteAvatarImageUpdatedAt !== localAvatarImageUpdatedAt
  );
}

function avatarResolution(avatarImage, avatarImageUpdatedAt, source, needsRemoteSync) {
  return {
    avatarImage,
    avatarImageUpdatedAt,
    source,
    needsRemoteSync
  };
}
