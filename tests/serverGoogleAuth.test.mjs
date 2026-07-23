import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createAppHandler } from "../server.mjs";
import { verifyGoogleCredential } from "../src/server/googleAuth.mjs";

test("server-side Google verification accepts a verified token payload", async () => {
  const profile = await verifyGoogleCredential("signed-token", "client-id", {
    async verifyIdToken(options) {
      assert.deepEqual(options, { idToken: "signed-token", audience: "client-id" });
      return {
        getPayload: () => ({
          sub: "google-user-1",
          name: "Dana Cohen",
          email: "dana@example.com",
          email_verified: true
        })
      };
    }
  });

  assert.equal(profile.participantId, "google-google-user-1");
  assert.equal(profile.email, "dana@example.com");
});

test("server-side Google verification rejects unverified or invalid credentials", async () => {
  const unverified = await verifyGoogleCredential("token", "client-id", {
    async verifyIdToken() {
      return { getPayload: () => ({ sub: "one", name: "Dana Cohen", email_verified: false }) };
    }
  });
  const invalid = await verifyGoogleCredential("token", "client-id", {
    async verifyIdToken() {
      throw new Error("bad signature");
    }
  });

  assert.equal(unverified, null);
  assert.equal(invalid, null);
});

test("Google auth endpoint returns only a server-verified profile", async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "configured-client-id";
  const server = createServer(createAppHandler({
    root: process.cwd(),
    port: 0,
    googleCredentialVerifier: async (credential, clientId) => {
      assert.equal(credential, "signed-token");
      assert.equal(clientId, "configured-client-id");
      return {
        participantId: "google-one",
        displayName: "Dana Cohen",
        authProvider: "google",
        authSubject: "one",
        email: "dana@example.com"
      };
    }
  }));

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: "signed-token" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.profile.participantId, "google-one");
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
