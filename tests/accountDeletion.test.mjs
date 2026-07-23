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
  assert.equal(requests.length, 3);
  assert.match(requests[1].url, /\/rest\/v1\/rpc\/delete_account_data$/);
  assert.equal(requests[1].options.headers.apikey, "service-key");
  const rpcBody = JSON.parse(requests[1].options.body);
  assert.deepEqual(rpcBody, {
    p_user_id: "2f1fcf8b-c17c-4c74-b53e-f9e2472597d2"
  });
  assert.match(requests[2].url, /\/auth\/v1\/admin\/users\/2f1fcf8b/);
  assert.deepEqual(JSON.parse(requests[2].options.body), { should_soft_delete: false });
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

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
