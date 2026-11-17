const REQUIRED_KEYS = ["PROJECT_ID", "GCM_SENDER_ID", "BUNDLE_ID", "GOOGLE_APP_ID"];

export function validateIosPushPublicConfig(value, expected = {}) {
  const errors = [];
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  for (const key of REQUIRED_KEYS) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 256) {
      errors.push({ code: "IOS_CONFIG_FIELD_INVALID", field: key });
    }
  }
  const projectId = String(expected.projectId ?? "").trim();
  const projectNumber = String(expected.projectNumber ?? "").trim();
  const bundleId = String(expected.bundleId ?? "").trim();
  if (!projectId || !/^[0-9]+$/.test(projectNumber) || !bundleId) {
    errors.push({ code: "EXPECTED_IDENTITY_INVALID" });
  }
  if (!errors.length) {
    if (input.PROJECT_ID !== projectId) errors.push({ code: "FIREBASE_PROJECT_MISMATCH" });
    if (input.GCM_SENDER_ID !== projectNumber) errors.push({ code: "FIREBASE_SENDER_MISMATCH" });
    if (input.BUNDLE_ID !== bundleId) errors.push({ code: "IOS_BUNDLE_MISMATCH" });
    const app = /^1:([0-9]+):ios:([A-Za-z0-9_-]+)$/.exec(input.GOOGLE_APP_ID);
    if (!app || app[1] !== projectNumber) errors.push({ code: "IOS_FIREBASE_APP_ID_INVALID" });
  }
  return {
    schemaVersion: 1,
    valid: errors.length === 0,
    errors,
    // Never copy the supplied object: a real plist projection may contain keys.
    publicIdentity: errors.length ? null : {
      projectId, projectNumber, bundleId, firebaseIosAppId: input.GOOGLE_APP_ID
    },
    scope: "Public project and app identity only",
    apnsConfigurationVerified: false,
    nativeBuildVerified: false,
    pushDeliveryVerified: false
  };
}
