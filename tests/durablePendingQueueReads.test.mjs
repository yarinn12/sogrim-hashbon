import test from "node:test";
import assert from "node:assert/strict";
import * as notifications from "../src/data/pendingEventNotifications.mjs";
import * as joins from "../src/data/pendingEventJoins.mjs";
import * as links from "../src/data/pendingAccountLinks.mjs";

const date = "2026-11-18T08:00:00.000Z";
const queues = [
  { name: "event notification", key: notifications.PENDING_EVENT_NOTIFICATIONS_STORAGE_KEY,
    load: notifications.loadPendingEventNotifications, remember: notifications.rememberPendingEventNotification,
    forget: notifications.forgetPendingEventNotification,
    fields: { activityId: "expense-a", kind: "expense-created", confirmed: true } },
  { name: "event join", key: joins.PENDING_EVENT_JOINS_STORAGE_KEY,
    load: joins.loadPendingEventJoins, remember: joins.rememberPendingEventJoin,
    forget: joins.forgetPendingEventJoin, attempt: joins.markPendingEventJoinAttempt, fields: {} },
  { name: "participant account link", key: links.PENDING_ACCOUNT_LINKS_STORAGE_KEY,
    load: links.loadPendingAccountLinks, remember: links.rememberPendingAccountLink,
    forget: links.forgetPendingAccountLink, attempt: links.markPendingAccountLinkAttempt,
    fields: { sourceParticipantId: "guest-a", targetParticipantId: "account-a", linkedAt: date } }
];
const faults = ["read throws", "first read throws", "malformed JSON", "object instead of array", "null instead of array", "reader unavailable"];

for (const q of queues) for (const operation of ["remember", "forget", ...(q.attempt ? ["attempt"] : [])]) {
  for (const fault of faults) {
    test(`${q.name} ${operation} preserves every durable intent when ${fault}`, () => {
      const target = { ownerUserId: "owner-a", eventId: "event-a", queuedAt: date, attempts: 4, ...q.fields };
      const sibling = { ...target, eventId: "event-sibling", activityId: "expense-sibling" };
      const otherOwner = { ...target, ownerUserId: "owner-b", eventId: "event-b", activityId: "expense-b" };
      const data = new Map(), writes = [];
      const storage = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { writes.push(["set", key]); data.set(key, String(value)); },
        removeItem: key => { writes.push(["remove", key]); data.delete(key); }
      };
      for (const entry of [target, sibling, otherOwner]) assert.equal(q.remember(entry, storage), true);
      const validBytes = data.get(q.key);
      const prior = q.load(storage);
      const healthyRead = storage.getItem;
      const brokenBytes = { "malformed JSON": '[{"ownerUserId":"owner-a",',
        "object instead of array": JSON.stringify({ entries: prior }), "null instead of array": "null" }[fault];
      if (brokenBytes !== undefined) data.set(q.key, brokenBytes);
      if (fault.includes("throws")) {
        let failed = false;
        storage.getItem = key => {
          if (fault === "read throws" || !failed) { failed = true; throw new Error("Synthetic storage read failure"); }
          return healthyRead(key);
        };
      }
      if (fault === "reader unavailable") delete storage.getItem;
      const bytesBefore = data.get(q.key);
      writes.length = 0;
      const input = operation === "remember" ? { ...target, eventId: "event-new", activityId: "expense-new" } : target;
      assert.equal(q[operation](input, storage), false, "an unread queue must not be reported as successfully mutated");
      assert.deepEqual(writes, [], "a read failure is not permission to overwrite or remove durable data");
      assert.equal(data.get(q.key), bytesBefore, "retain the exact existing bytes for recovery");

      // Restore the synthetic storage/valid fixture, then exercise a real retry.
      storage.getItem = healthyRead;
      if (brokenBytes !== undefined) data.set(q.key, validBytes);
      assert.equal(q[operation](input, storage), true);
      const recovered = q.load(storage);
      assert.equal(recovered.length, operation === "remember" ? 4 : operation === "forget" ? 2 : 3);
      assert.deepEqual(recovered.filter(entry => entry.eventId !== "event-a" && entry.eventId !== "event-new"),
        prior.filter(entry => entry.eventId !== "event-a"), "another event and account survive the retry unchanged");
      if (operation === "attempt") {
        const updated = recovered.find(entry => entry.eventId === "event-a");
        assert.equal(updated.attempts, 5);
        assert.equal(updated.queuedAt, date);
      }
      if (q.name === "event notification" && operation === "remember") {
        assert.equal(recovered.find(entry => entry.eventId === "event-a").confirmed, true);
      }
    });
  }
}
