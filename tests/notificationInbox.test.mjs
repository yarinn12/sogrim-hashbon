import test from "node:test";
import assert from "node:assert/strict";

import {
  loadNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead
} from "../src/data/notificationInbox.mjs";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../src/data/fetchTimeout.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function runtimeConfig() {
  return {
    storage: {
      mode: "supabase",
      url: "https://demo.supabase.co",
      anonKey: "anon-key",
      account: {
        userId: USER_ID,
        accessToken: "account-access-token"
      }
    }
  };
}

test("notification inbox reads only the authenticated account and normalizes targets", async () => {
  const calls = [];
  const result = await loadNotificationInbox(
    runtimeConfig(),
    { limit: 25 },
    async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify([
        {
          id: "notification-1",
          event_id: "event-trip",
          activity_id: "expense-taxi",
          kind: "expense-created",
          title: "הוצאה חדשה באירוע",
          body: "נוספה הוצאה חדשה לאירוע.",
          view: "event",
          action_url: "https://sogrim-hashbon.vercel.app/i/event-trip/shared-space/abcdefghijklmnopqrstuvwxyz123456",
          created_at: "2026-07-27T10:00:00.000Z",
          read_at: null
        }
      ]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  );

  assert.equal(result.available, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].eventId, "event-trip");
  assert.equal(result.items[0].readAt, "");
  assert.match(result.items[0].actionUrl, /\/i\/event-trip\//);
  assert.match(calls[0].url, /recipient_user_id=eq\.11111111/);
  assert.match(calls[0].url, /limit=25/);
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer account-access-token"
  );
});

test("a stalled notification inbox load times out and allows a retry", async (t) => {
  let stalledSignal = null;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const stalledLoad = loadNotificationInbox(runtimeConfig(), {}, async (_url, options) => {
    stalledSignal = options.signal;
    return new Promise(() => {});
  });

  await Promise.resolve();
  t.mock.timers.tick(DEFAULT_REQUEST_TIMEOUT_MS);
  await assert.rejects(stalledLoad, (error) => error?.code === "NETWORK_TIMEOUT");
  assert.equal(stalledSignal?.aborted, true);
  t.mock.timers.reset();

  let retryCalls = 0;
  const result = await loadNotificationInbox(runtimeConfig(), {}, async () => {
    retryCalls += 1;
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  assert.equal(result.available, true);
  assert.deepEqual(result.items, []);
  assert.equal(retryCalls, 1);
});

test("notification inbox rejects an external action url", async () => {
  const result = await loadNotificationInbox(
    runtimeConfig(),
    {},
    async () => new Response(JSON.stringify([
      {
        id: "notification-2",
        event_id: "event-trip",
        activity_id: "account-22222222-2222-4222-8222-222222222222",
        kind: "event-invite",
        title: "הזמנה לאירוע",
        body: "הזמינו אותך להצטרף לאירוע.",
        view: "event",
        action_url: "https://attacker.example/i/event-trip/space/key",
        created_at: "2026-07-27T10:00:00.000Z",
        read_at: null
      }
    ]), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );

  assert.equal(result.items[0].actionUrl, "");
});

test("notification inbox marks one item or all unread items without accepting another user id", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };

  assert.equal(
    await markNotificationRead(runtimeConfig(), "notification-1", fetchImpl),
    true
  );
  assert.equal(await markAllNotificationsRead(runtimeConfig(), fetchImpl), true);
  assert.match(calls[0].url, /id=eq\.notification-1/);
  assert.match(calls[0].url, /recipient_user_id=eq\.11111111/);
  assert.match(calls[1].url, /read_at=is\.null/);
  assert.equal(JSON.parse(calls[0].options.body).read_at.length > 10, true);
});

test("notification inbox stays unavailable without a current account session", async () => {
  let contacted = false;
  const result = await loadNotificationInbox(
    { storage: { mode: "supabase" } },
    {},
    async () => {
      contacted = true;
      return new Response();
    }
  );

  assert.equal(result.available, false);
  assert.deepEqual(result.items, []);
  assert.equal(contacted, false);
});
