import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotificationDestination,
  clearNotificationTargetFromUrl,
  notificationTargetFromPayload,
  notificationTargetFromUrl
} from "../src/domain/notificationTargets.mjs";

test("notification targets open an exact event or settlement screen", () => {
  assert.deepEqual(
    notificationTargetFromPayload({
      data: { eventId: "event-123", view: "summary" }
    }),
    { eventId: "event-123", view: "summary" }
  );
  assert.deepEqual(
    notificationTargetFromPayload({
      event_id: "event-456",
      screen: "settlement"
    }),
    { eventId: "event-456", view: "summary" }
  );

  const destination = buildNotificationDestination(
    "https://sogrim-hesbon-app.vercel.app/current?private=value",
    { eventId: "event-123", view: "summary" }
  );
  const url = new URL(destination);
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("openEvent"), "event-123");
  assert.equal(url.searchParams.get("view"), "summary");
  assert.equal(url.searchParams.get("source"), "push");
  assert.equal(url.searchParams.has("private"), false);
});

test("notification targets reject forged ids, views, and unrelated urls", () => {
  assert.equal(
    notificationTargetFromPayload({
      eventId: "../private",
      view: "summary"
    }),
    null
  );
  assert.equal(
    notificationTargetFromPayload({
      eventId: "event-1",
      view: "admin"
    }),
    null
  );
  assert.equal(
    notificationTargetFromUrl(
      "https://sogrim-hesbon-app.vercel.app/?event=event-1"
    ),
    null
  );
  assert.equal(
    buildNotificationDestination(
      "https://sogrim-hesbon-app.vercel.app/",
      { eventId: "", view: "event" }
    ),
    ""
  );
});

test("notification urls are consumed without removing unrelated launch data", () => {
  const value =
    "https://sogrim-hesbon-app.vercel.app/?openEvent=event-1&view=event&source=push&theme=dark#top";
  assert.deepEqual(notificationTargetFromUrl(value), {
    eventId: "event-1",
    view: "event"
  });
  assert.equal(
    clearNotificationTargetFromUrl(value),
    "/?theme=dark#top"
  );
});
