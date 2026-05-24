import {
  isFullProfileName,
  normalizeProfileName
} from "./userProfile.mjs";

export function profileFromGoogleCredential(credential) {
  const payload = decodeGoogleCredential(credential);
  return profileFromGooglePayload(payload);
}

export function profileFromGooglePayload(payload) {
  const subject = normalizeGoogleSubject(payload?.sub);
  const displayName = googleDisplayName(payload);

  if (!subject || !isFullProfileName(displayName)) return null;

  return {
    participantId: `google-${subject}`,
    displayName,
    authProvider: "google",
    authSubject: subject,
    email: normalizeEmail(payload?.email)
  };
}

export function decodeGoogleCredential(credential) {
  const token = String(credential ?? "");
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Invalid Google credential");

  return JSON.parse(base64UrlToText(payload));
}

function googleDisplayName(payload) {
  const fullName = normalizeProfileName(payload?.name);
  if (isFullProfileName(fullName)) return fullName;

  return normalizeProfileName([payload?.given_name, payload?.family_name].filter(Boolean).join(" "));
}

function normalizeGoogleSubject(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function base64UrlToText(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  throw new Error("No base64 decoder available");
}
