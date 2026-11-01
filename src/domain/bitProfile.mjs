// A receiving shortcut is not an authenticated Bit account connection.
export function normalizeBitReceivingUrl(value) {
  if (typeof value !== "string" || value.length > 250 ||
      !/^https:\/\/www\.bitpay\.co\.il\/app\/me\/[A-Fa-f0-9-]{20,100}$/.test(value)) {
    throw Object.assign(new Error("Invalid personal Bit receiving QR"), {code: "BIT_QR_URL"});
  }
  return value;
}

export function validateBitQrFile(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw Object.assign(new Error("Choose a PNG, JPG or WebP image"), {code: "BIT_QR_TYPE"});
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 12 * 1024 * 1024) {
    throw Object.assign(new Error("QR image is too large"), {code: "BIT_QR_SIZE"});
  }
}

export function normalizeBitProfile(value, expectedUserId) {
  if (!value || value.user_id !== expectedUserId ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !(value.bit_url === null || typeof value.bit_url === "string") ||
      (value.revision === 0 && (value.bit_url !== null || value.updated_at !== null)) ||
      (value.revision > 0 && !Number.isFinite(Date.parse(value.updated_at)))) {
    throw Object.assign(new Error("Invalid Bit profile acknowledgement"), {code: "BIT_ACK"});
  }
  return Object.freeze({userId: expectedUserId,
    url: value.bit_url === null ? null : normalizeBitReceivingUrl(value.bit_url),
    revision: value.revision, updatedAt: value.updated_at});
}
