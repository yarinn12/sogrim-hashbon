const teamId = required("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/);
const issuerId = required(
  "APPSTORE_ISSUER_ID",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
);
const apiKeyId = required("APPSTORE_API_KEY_ID", /^[A-Z0-9]{10}$/);
const version = required("IOS_VERSION", /^\d+(?:\.\d+){1,2}$/);
const build = required("IOS_BUILD", /^[1-9]\d*$/);
const releaseNotes = required("IOS_RELEASE_NOTES", /^[\s\S]{1,4000}$/);
const privateKey = String(process.env.APPSTORE_API_PRIVATE_KEY ?? "").trim();
const certificateBase64 = String(
  process.env.APPSTORE_CERTIFICATES_FILE_BASE64 ?? ""
).replace(/\s+/g, "");
const certificatePassword = String(
  process.env.APPSTORE_CERTIFICATES_PASSWORD ?? ""
);

if (
  !privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
  !privateKey.endsWith("-----END PRIVATE KEY-----")
) {
  fail("APPSTORE_API_PRIVATE_KEY must contain the complete Apple .p8 private key.");
}
if (!certificatePassword) {
  fail("APPSTORE_CERTIFICATES_PASSWORD is missing.");
}
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(certificateBase64)) {
  fail("APPSTORE_CERTIFICATES_FILE_BASE64 is not valid Base64.");
}

const certificate = Buffer.from(certificateBase64, "base64");
const normalizedInput = certificateBase64.replace(/=+$/g, "");
const normalizedOutput = certificate.toString("base64").replace(/=+$/g, "");
if (
  certificate.length < 512 ||
  certificate[0] !== 0x30 ||
  normalizedInput !== normalizedOutput
) {
  fail("APPSTORE_CERTIFICATES_FILE_BASE64 does not look like a complete .p12 file.");
}

console.log(
  `Apple workflow inputs are valid for team ${teamId}, key ${apiKeyId}, issuer ${issuerId}, release ${version} (${build}).`
);

function required(name, pattern) {
  const value = String(process.env[name] ?? "").trim();
  if (!pattern.test(value)) fail(`${name} is missing or invalid.`);
  return value;
}

function fail(message) {
  throw new Error(message);
}
