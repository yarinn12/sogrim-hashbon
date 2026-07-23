import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeGoogleCredential,
  profileFromGooglePayload
} from "../src/domain/googleAuth.mjs";

test("profileFromGooglePayload creates a stable Google participant identity", () => {
  const profile = profileFromGooglePayload({
    sub: "1234567890",
    name: "Yarin Levi",
    email: "YARIN@example.com"
  });

  assert.deepEqual(profile, {
    participantId: "google-1234567890",
    displayName: "Yarin Levi",
    authProvider: "google",
    authSubject: "1234567890",
    email: "yarin@example.com"
  });
});

test("profileFromGooglePayload requires a full name", () => {
  assert.equal(
    profileFromGooglePayload({
      sub: "1234567890",
      name: "Yarin"
    }),
    null
  );
});

test("decodeGoogleCredential reads a Google identity payload", () => {
  const payload = { sub: "abc-123", name: "Dana Cohen", email: "dana@example.com" };
  const token = [
    encodeBase64Url({ alg: "RS256", typ: "JWT" }),
    encodeBase64Url(payload),
    "signature"
  ].join(".");

  assert.deepEqual(decodeGoogleCredential(token), payload);
});

function encodeBase64Url(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
