const REFERRAL_CODE_PATTERN = /^[a-f0-9]{20}$/;

export function normalizeReferralCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : "";
}
