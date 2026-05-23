import test from "node:test";
import assert from "node:assert/strict";

import { filterEvents } from "../src/domain/eventFilters.mjs";

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

