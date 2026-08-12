import { createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const teamId = requiredIdentifier("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/);
const keyId = requiredIdentifier("APPLE_KEY_ID", /^[A-Z0-9]{10}$/);
const clientId = requiredIdentifier(
  "APPLE_SERVICES_ID",
  /^[A-Za-z0-9.-]{3,128}$/
);
const privateKeyPath = String(process.env.APPLE_PRIVATE_KEY_PATH ?? "").trim();
if (!privateKeyPath) {
  throw new Error("Set APPLE_PRIVATE_KEY_PATH to the downloaded AuthKey_*.p8 file.");
}

const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 180 * 24 * 60 * 60;
const header = encodeJson({ alg: "ES256", kid: keyId, typ: "JWT" });
const payload = encodeJson({
  iss: teamId,
  iat: now,
  exp: expiresAt,
  aud: "https://appleid.apple.com",
  sub: clientId
});
const signingInput = `${header}.${payload}`;
const privateKey = createPrivateKey(await readFile(privateKeyPath, "utf8"));
const signature = sign("sha256", Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363"
});
const clientSecret = `${signingInput}.${base64Url(signature)}`;
await writeFile(".apple-client-secret.txt", `${clientSecret}\n`, {
  encoding: "utf8",
  mode: 0o600
});

console.log(
  `Apple client secret created locally. It expires on ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}.`
);

function requiredIdentifier(name, pattern) {
  const value = String(process.env[name] ?? "").trim();
  if (!pattern.test(value)) throw new Error(`${name} is missing or invalid.`);
  return value;
}

function encodeJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}
