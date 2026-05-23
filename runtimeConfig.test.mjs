import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEventInviteUrl,
  parseInviteEventId
} from "../src/domain/inviteLinks.mjs";

test("buildEventInviteUrl creates a clean event invite URL", () => {
  const url = buildEventInviteUrl("http://127.0.0.1:4173/?event=old", "event-123");

  assert.equal(url, "http://127.0.0.1:4173/?event=event-123");
});

test("parseInviteEventId reads an event id from a URL", () => {
  assert.equal(
    parseInviteEventId("http://127.0.0.1:4173/?event=event-123"),
    "event-123"
  );
});

test("parseInviteEventId returns null when the link is not an invite", () => {
  assert.equal(parseInviteEventId("http://127.0.0.1:4173/"), null);
});
