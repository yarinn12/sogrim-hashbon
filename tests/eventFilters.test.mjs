import test from "node:test";
import assert from "node:assert/strict";

import {
  countEventsByStatus,
  eventMatchesStatus,
  filterEvents,
  filterEventsByStatus,
  isEventClosed,
  isEventOpen
} from "../src/domain/eventFilters.mjs";

const events = [
  { id: "event-1", name: "Thursday bar" },
  { id: "event-2", name: "Birthday dinner" },
  { id: "event-3", name: "Night taxi" }
];

test("filterEvents returns every event when the query is empty", () => {
  assert.deepEqual(filterEvents(events, ""), events);
  assert.deepEqual(filterEvents(events, "   "), events);
});

test("filterEvents matches event names without caring about case", () => {
  assert.deepEqual(filterEvents(events, "BAR"), [events[0]]);
  assert.deepEqual(filterEvents(events, "tax"), [events[2]]);
});

test("event status filtering has one open-event definition", () => {
  const openEvent = { id: "open", locked: false };
  const lockedEvent = { id: "locked", locked: true };
  const closedEvent = { id: "closed", closedAt: "2026-07-20T18:00:00.000Z" };
  const statusEvents = [openEvent, lockedEvent, closedEvent];

  assert.equal(isEventOpen(openEvent), true);
  assert.equal(isEventClosed(openEvent), false);
  assert.equal(isEventClosed(lockedEvent), true);
  assert.equal(eventMatchesStatus(closedEvent, "closed"), true);
  assert.deepEqual(filterEventsByStatus(statusEvents, "open"), [openEvent]);
  assert.deepEqual(filterEventsByStatus(statusEvents, "closed"), [
    lockedEvent,
    closedEvent
  ]);
  assert.deepEqual(countEventsByStatus(statusEvents), {
    open: 1,
    closed: 2,
    all: 3
  });
});

test("a closed event stays in closed history even with pending transfers", () => {
  const event = {
    id: "closed-pending",
    closedAt: "2026-07-20T18:00:00.000Z",
    transfers: [{ id: "transfer-1", status: "pending" }]
  };

  assert.equal(eventMatchesStatus(event, "closed"), true);
  assert.equal(eventMatchesStatus(event, "open"), false);
});
