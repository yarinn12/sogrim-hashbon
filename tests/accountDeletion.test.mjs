import test from "node:test";
import assert from "node:assert/strict";

import { deleteSupabaseAccount } from "../src/server/accountDeletion.mjs";

const runtimeConfig = {
  storage: {
    mode: "supabase",
    url: "https://project.supabase.co",
    anonKey: "anon-key"
  }
};

test("account deletion trusts the verified auth user instead of editable metadata", async () => {
  const requests = [];
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer user-access-token",
    confirmation: "delete-my-account",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, {
          id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2",
          user_metadata: { account_space_id: "attacker-controlled-space" }
        });
      }
      return jsonResponse(200, { ok: true });
    }
  });

  assert.equal(result.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.apikey, "service-key");
  assert.match(requests[1].url, /\/auth\/v1\/admin\/users\/2f1fcf8b/);
  assert.deepEqual(JSON.parse(requests[1].options.body), { should_soft_delete: false });
  assert.equal(result.payload.deletionAtomic, true);
});

test("account deletion retries a temporary auth deletion failure", async () => {
  let deleteAttempts = 0;
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer user-access-token",
    confirmation: "delete-my-account",
    fetchImpl: async (url) => {
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2" });
      }
      if (url.includes("/auth/v1/admin/users/")) {
        deleteAttempts += 1;
        return jsonResponse(deleteAttempts < 3 ? 503 : 200, {});
      }
      return jsonResponse(200, {});
    }
  });

  assert.equal(result.status, 200);
  assert.equal(deleteAttempts, 3);
});

test("failed auth deletion never performs a separate partial anonymization", async () => {
  const requests = [];
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer user-access-token",
    confirmation: "delete-my-account",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, {
          id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2"
        });
      }
      return jsonResponse(503, {});
    }
  });

  assert.equal(result.status, 502);
  assert.equal(requests.length, 4);
  assert.equal(
    requests.some(({ url }) => url.includes("/rest/v1/rpc/")),
    false
  );
});

test("account deletion rejects missing confirmation before contacting Supabase", async () => {
  let called = false;
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer token",
    fetchImpl: async () => {
      called = true;
      return jsonResponse(200, {});
    }
  });

  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test("account deletion never exposes the service role key to the caller", async () => {
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: {},
    authorization: "Bearer token",
    confirmation: "delete-my-account"
  });

  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.payload), /service/i);
});

test("account deletion stops waiting when identity verification stalls", async () => {
  const startedAt = Date.now();
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer token",
    confirmation: "delete-my-account",
    requestTimeoutMs: 10,
    fetchImpl: async () => new Promise(() => {})
  });

  assert.equal(result.status, 502);
  assert.ok(Date.now() - startedAt < 500);
});

test("account deletion recovers when an ambiguous timed-out delete already completed", async () => {
  let deleteAttempts = 0;
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer token",
    confirmation: "delete-my-account",
    requestTimeoutMs: 60,
    fetchImpl: async (url) => {
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2" });
      }
      deleteAttempts += 1;
      if (deleteAttempts === 1) return new Promise(() => {});
      return jsonResponse(404, {});
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.accountDeleted, true);
  assert.equal(deleteAttempts, 2);
});

test("account deletion does not retry a permanent upstream rejection", async () => {
  let deleteAttempts = 0;
  const result = await deleteSupabaseAccount({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer token",
    confirmation: "delete-my-account",
    fetchImpl: async (url) => {
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2" });
      }
      deleteAttempts += 1;
      return jsonResponse(403, {});
    }
  });

  assert.equal(result.status, 502);
  assert.equal(deleteAttempts, 1);
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
