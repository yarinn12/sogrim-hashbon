import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAdminAnalyticsOverview,
  normalizeAdminAnalyticsOverview
} from "../src/data/adminAnalyticsStore.mjs";
import {
  buildAdminAnalyticsViewModel,
  formatBytes
} from "../src/domain/adminAnalytics.mjs";

test("admin analytics client stays hidden without an account session", async () => {
  let requests = 0;
  const result = await loadAdminAnalyticsOverview(
    { storage: { account: {} } },
    { fetchImpl: async () => { requests += 1; } }
  );

  assert.equal(result.available, false);
  assert.equal(result.status, 401);
  assert.equal(requests, 0);
});

test("admin analytics client treats an ordinary account as unavailable", async () => {
  const result = await loadAdminAnalyticsOverview(
    {
      apiBaseUrl: "https://app.example.com",
      storage: { account: { accessToken: "user-token" } }
    },
    {
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://app.example.com/api/admin/overview?days=30");
        assert.equal(options.headers.authorization, "Bearer user-token");
        return new Response(JSON.stringify({ ok: false }), { status: 403 });
      }
    }
  );

  assert.deepEqual(result, {
    available: false,
    status: 403,
    reason: "forbidden"
  });
});

test("admin analytics releases a dashboard request that never responds", async () => {
  await assert.rejects(
    loadAdminAnalyticsOverview(
      {
        apiBaseUrl: "https://app.example.com",
        storage: { account: { accessToken: "admin-token" } }
      },
      {
        fetchImpl: async () => new Promise(() => {}),
        timeoutMs: 5
      }
    ),
    (error) => error?.code === "NETWORK_TIMEOUT"
  );
});

test("admin analytics response is normalized before rendering", async () => {
  const result = await loadAdminAnalyticsOverview(
    {
      apiBaseUrl: "",
      storage: { account: { accessToken: "admin-token" } }
    },
    {
      fetchImpl: async () => new Response(JSON.stringify({
        ok: true,
        overview: {
          generatedAt: "2026-08-14T10:00:00.000Z",
          windowDays: 120,
          accounts: {
            registered: "11",
            confirmed: 10,
            createdDuringWindow: 3,
            signedInLast24Hours: 2,
            signedInLast7Days: 4,
            signedInDuringWindow: 5
          },
          storage: {
            sharedEvents: "113",
            activeSharedEventsDuringWindow: 17,
            databaseBytes: 14380179
          },
          push: { reachableUsers: 6, enabledDevices: 8, androidDevices: 5 },
          notifications: { unreadItems: 2, createdDuringWindow: 7 },
          invites: { activeLinks: 4, redeemedDuringWindow: 2 },
          feedback: { new: 1, reviewing: 2 },
          sessions: { total: 2, affected: 1, errorFreeRate: 0.5 },
          telemetry: {
            lastReceivedAt: "2026-08-14T09:59:00.000Z",
            failuresLast24Hours: 1,
            deferredLast24Hours: 2,
            clientErrorsDuringWindow: 1
          },
          pushDelivery: {
            reservedDuringWindow: 5,
            deliveredDuringWindow: 4,
            stalePending: 1,
            deliveryRate: 0.8
          },
          dataContinuity: {
            latestSnapshotAt: "2026-08-14T09:58:00.000Z",
            accountsWithoutWorkspace: 0,
            eventsWithoutActiveMembers: 0
          },
          operationFailures: [{ operation: "state_load:network", count: "1" }],
          deferredOperations: [{ operation: "state_save:offline", count: "2" }],
          clientErrors: [{ platform: "ANDROID", screen: "EVENT", count: "1" }]
        }
      }), { status: 200 })
    }
  );

  assert.equal(result.available, true);
  assert.equal(result.overview.windowDays, 90);
  assert.equal(result.overview.accounts.registered, 11);
  assert.equal(result.overview.accounts.signedInLast7Days, 4);
  assert.equal(result.overview.storage.sharedEvents, 113);
  assert.equal(result.overview.push.reachableUsers, 6);
  assert.equal(result.overview.notifications.unreadItems, 2);
  assert.equal(result.overview.operationFailures[0].count, 1);
  assert.equal(result.overview.telemetry.failuresLast24Hours, 1);
  assert.equal(result.overview.pushDelivery.deliveryRate, 0.8);
  assert.equal(result.overview.deferredOperations[0].count, 2);
  assert.deepEqual(result.overview.clientErrors[0], {
    platform: "android",
    screen: "event",
    count: 1
  });
});

test("admin analytics view model keeps the daily overview concise", () => {
  const overview = normalizeAdminAnalyticsOverview({
    generatedAt: "2026-08-14T10:00:00.000Z",
    windowDays: 30,
    accounts: { registered: 11, signedInDuringWindow: 5 },
    storage: { sharedEvents: 113, databaseBytes: 14380179 },
    sessions: { total: 2, affected: 0, errorFreeRate: 1 },
    operationFailures: []
  });
  const viewModel = buildAdminAnalyticsViewModel(overview);

  assert.equal(viewModel.status, "healthy");
  assert.equal(viewModel.statusTitle, "הכול פועל כרגיל");
  assert.equal(viewModel.quickStats.length, 4);
  assert.equal(viewModel.quickStats[0].value, "11");
  assert.equal(viewModel.quickStats[1].value, "5");
  assert.equal(viewModel.quickStats[2].value, "113");
  assert.equal(viewModel.detailGroups.length, 3);
  assert.equal(viewModel.failure.title, "לא נרשמו תקלות בתקופה");
  assert.equal(viewModel.reliability.deferredCount, "0");
  assert.equal(viewModel.delivery.title, "משלוחי Push ללא תקיעות");
  assert.equal(formatBytes(14380179), "13.7 MB");
});
