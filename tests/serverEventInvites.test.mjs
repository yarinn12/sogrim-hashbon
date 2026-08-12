import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createAppHandler } from "../server.mjs";

test("event invite routes keep authorization server-side", async () => {
  const calls = [];
  const server = createServer(
    createAppHandler({
      root: process.cwd(),
      port: 0,
      openEventInviteService: async (request) => {
        calls.push({ kind: "open", request });
        return {
          status: 200,
          payload: {
            ok: true,
            eventId: request.eventId,
            token: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
          }
        };
      },
      eventInviteRedemptionService: async (request) => {
        calls.push({ kind: "redeem", request });
        return {
          status: 200,
          payload: {
            ok: true,
            eventId: request.eventId,
            kind: "private",
            spaceId: "shared-event-space",
            spaceKey: "shared-event-secret-that-is-long-enough-123"
          }
        };
      }
    })
  );

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const openResponse = await fetch(`${baseUrl}/api/event-invites/open-link`, {
      method: "POST",
      headers: {
        authorization: "Bearer account-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId: "event-secure",
        candidateToken: "",
        operation: "ensure",
        spaceKey: "must-not-be-trusted"
      })
    });
    assert.equal(openResponse.status, 200);
    assert.equal(calls[0].request.authorization, "Bearer account-token");
    assert.equal(calls[0].request.eventId, "event-secure");
    assert.equal("spaceKey" in calls[0].request, false);

    const redeemResponse = await fetch(`${baseUrl}/api/event-invites/redeem`, {
      method: "POST",
      headers: {
        authorization: "Bearer recipient-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        eventId: "event-secure",
        token: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456"
      })
    });
    const redeemed = await redeemResponse.json();
    assert.equal(redeemResponse.status, 200);
    assert.equal(redeemed.kind, "private");
    assert.equal(calls[1].request.authorization, "Bearer recipient-token");
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

