import { OAuth2Client } from "google-auth-library";
import { profileFromGooglePayload } from "../domain/googleAuth.mjs";

const googleClient = new OAuth2Client();

export async function verifyGoogleCredential(
  credential,
  clientId,
  verifier = googleClient
) {
  const idToken = String(credential ?? "").trim();
  const audience = String(clientId ?? "").trim();
  if (!idToken || !audience) return null;

  try {
    const ticket = await verifier.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) return null;
    return profileFromGooglePayload(payload);
  } catch {
    return null;
  }
}
