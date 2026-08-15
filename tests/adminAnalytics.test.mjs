import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminAnalyticsOverview,
  parseAdminEmails
} from "../src/server/adminAnalytics.mjs";

const runtimeConfig = {
  storage: {
    url: "https://project.supabase.co",
    anonKey: "anon-key"
  }
};
const env = {
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  ADMIN_EMAILS: "owner@example.com"
};

test("admin analytics fail closed until an allowlist is configured", async () => {
  const result = await getAdminAnalyticsOverview({
    runtimeConfig,
    env: { SUPABASE_SERVICE_ROLE_KEY: "service-key" },
    authorization: "Bearer account-token",
    fetchImpl: async () => {
      throw new Error("network should not be contacted");
    }
  });

  assert.equal(result.status, 503);
});

test("admin analytics reject a valid ordinary account before querying aggregates", async () => {
  const requests = [];
  const result = await getAdminAnalyticsOverview({
    runtimeConfig,
    env,
    authorization: "Bearer account-token",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return jsonResponse({ id: "user-1", email: "member@example.com" });
    }
  });

  assert.equal(result.status, 403);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/auth\/v1\/user$/);
});

test("admin analytics return aggregate data without exposing the service key", async () => {
  const requests = [];
  const overview = {
    accounts: { registered: 11 },
    sessions: { total: 2, affected: 1, errorFreeRate: 0.5 }
  };
  const result = await getAdminAnalyticsOverview({
    runtimeConfig,
    env,
    authorization: "Bearer account-token",
    windowDays: 120,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse({ id: "owner", email: "OWNER@example.com" });
      }
      return jsonResponse(overview);
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { ok: true, overview });
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/rest\/v1\/rpc\/admin_analytics_overview$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), { p_window_days: 90 });
  assert.equal(requests[1].options.headers.authorization, "Bearer service-key");
  assert.doesNotMatch(JSON.stringify(result.payload), /service-key|owner@example\.com/i);
});

test("admin email parsing is normalized and rejects malformed entries", () => {
  assert.deepEqual(
    [...parseAdminEmails(" OWNER@example.com; second@example.com invalid ")],
    ["owner@example.com", "second@example.com"]
  );
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
