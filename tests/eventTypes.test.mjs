import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TYPE_RESTAURANT,
  EVENT_TYPE_STANDARD,
  EVENT_TYPE_TRIP,
  defaultEventName,
  defaultExpenseModeForEvent,
  eventTypeConfig,
  eventTypeOptions,
  normalizeEventType,
  uniqueDefaultEventName
} from "../src/domain/eventTypes.mjs";

test("event types normalize legacy and unknown events to standard", () => {
  assert.equal(normalizeEventType(undefined), EVENT_TYPE_STANDARD);
  assert.equal(normalizeEventType("unknown"), EVENT_TYPE_STANDARD);
  assert.equal(normalizeEventType(EVENT_TYPE_RESTAURANT), EVENT_TYPE_RESTAURANT);
  assert.equal(normalizeEventType(EVENT_TYPE_TRIP), EVENT_TYPE_TRIP);
});

test("restaurant events open item entry while other events open a regular expense", () => {
  assert.equal(defaultExpenseModeForEvent(EVENT_TYPE_RESTAURANT), "items");
  assert.equal(defaultExpenseModeForEvent(EVENT_TYPE_STANDARD), "single");
  assert.equal(defaultExpenseModeForEvent(EVENT_TYPE_TRIP), "single");
});

test("all event modes provide clear creation and action copy", () => {
  assert.deepEqual(eventTypeOptions().map((type) => type.id), [
    EVENT_TYPE_STANDARD,
    EVENT_TYPE_RESTAURANT,
    EVENT_TYPE_TRIP
  ]);

  for (const type of eventTypeOptions()) {
    const config = eventTypeConfig(type.id);
    assert.ok(config.label);
    assert.ok(config.description);
    assert.ok(config.namePlaceholder);
    assert.ok(config.createLabel);
    assert.ok(config.actionLabel);
  }
});

test("unnamed events get an RTL-friendly type, date, and time", () => {
  const createdAt = new Date(2026, 6, 20, 18, 42);

  assert.equal(
    defaultEventName(EVENT_TYPE_RESTAURANT, createdAt),
    "מסעדה · 20.07 · 18:42"
  );
});

test("events created in the same minute get distinct default names", () => {
  const createdAt = new Date(2026, 6, 20, 18, 42);
  const firstName = defaultEventName(EVENT_TYPE_TRIP, createdAt);
  const secondName = uniqueDefaultEventName(EVENT_TYPE_TRIP, createdAt, [firstName]);
  const thirdName = uniqueDefaultEventName(
    EVENT_TYPE_TRIP,
    createdAt,
    [firstName, secondName]
  );

  assert.equal(secondName, `${firstName} · 2`);
  assert.equal(thirdName, `${firstName} · 3`);
});
