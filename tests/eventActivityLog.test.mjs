import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_ACTIVITY_LIMIT,
  appendEventActivity,
  createEventActivityEntry,
  eventActivityEntries,
  mergeEventActivityLogs
} from "../src/domain/eventActivityLog.mjs";

test("createEventActivityEntry keeps only supported bounded activity data", () => {
  const entry = createEventActivityEntry({
    id: "activity-1",
    kind: "expense-created",
    actorParticipantId: "user-1",
    entityId: "expense-1",
    label: `  ארוחה ${"א".repeat(100)}  `,
    occurredAt: "2026-08-03T08:30:00+03:00",
    privateNote: "must not be stored"
  });

  assert.equal(entry.id, "activity-1");
  assert.equal(entry.kind, "expense-created");
  assert.equal(entry.occurredAt, "2026-08-03T05:30:00.000Z");
  assert.equal(entry.label.length, 80);
  assert.equal(Object.hasOwn(entry, "privateNote"), false);
  assert.equal(
    createEventActivityEntry({
      id: "פעילות-לא-בטוחה",
      kind: "event-created",
      occurredAt: "2026-08-03T05:30:00.000Z"
    }),
    null
  );
  assert.equal(
    createEventActivityEntry({
      id: "activity-2",
      kind: "unknown-action",
      occurredAt: "2026-08-03T05:30:00.000Z"
    }),
    null
  );
});

test("appendEventActivity is immutable and keeps newest entries first", () => {
  const event = { id: "event-1", activityLog: [] };
  const first = appendEventActivity(event, {
    id: "activity-1",
    kind: "event-created",
    occurredAt: "2026-08-03T08:00:00.000Z"
  });
  const second = appendEventActivity(first, {
    id: "activity-2",
    kind: "expense-created",
    occurredAt: "2026-08-03T09:00:00.000Z"
  });

  assert.deepEqual(event.activityLog, []);
  assert.deepEqual(second.activityLog.map((entry) => entry.id), [
    "activity-2",
    "activity-1"
  ]);
});

test("mergeEventActivityLogs unions concurrent activity and deduplicates ids", () => {
  const remote = [
    {
      id: "activity-shared",
      kind: "expense-updated",
      label: "ישן",
      occurredAt: "2026-08-03T08:00:00.000Z"
    },
    {
      id: "activity-remote",
      kind: "participant-added",
      occurredAt: "2026-08-03T10:00:00.000Z"
    }
  ];
  const local = [
    {
      id: "activity-shared",
      kind: "expense-updated",
      label: "חדש",
      occurredAt: "2026-08-03T09:00:00.000Z"
    },
    {
      id: "activity-local",
      kind: "event-closed",
      occurredAt: "2026-08-03T11:00:00.000Z"
    }
  ];

  const merged = mergeEventActivityLogs(remote, local);

  assert.deepEqual(merged.map((entry) => entry.id), [
    "activity-local",
    "activity-remote",
    "activity-shared"
  ]);
  assert.equal(merged.find((entry) => entry.id === "activity-shared").label, "חדש");
});

test("eventActivityEntries gives legacy events a stable creation entry", () => {
  const entries = eventActivityEntries({
    id: "event-legacy",
    createdByParticipantId: "owner",
    createdAt: "2026-08-01T10:00:00.000Z"
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "event-created");
  assert.equal(entries[0].actorParticipantId, "owner");
  assert.match(entries[0].id, /^activity-created-/);
});

test("activity history stays bounded", () => {
  const entries = Array.from({ length: EVENT_ACTIVITY_LIMIT + 20 }, (_, index) => ({
    id: `activity-${index}`,
    kind: "expense-created",
    occurredAt: new Date(Date.UTC(2026, 7, 3, 0, index)).toISOString()
  }));

  const merged = mergeEventActivityLogs([], entries);

  assert.equal(merged.length, EVENT_ACTIVITY_LIMIT);
  assert.equal(merged[0].id, `activity-${EVENT_ACTIVITY_LIMIT + 19}`);
});
