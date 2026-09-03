import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createScrollIntentTracker } from "../src/scrollIntent.mjs";

function createTarget(parent = null) {
  const target = { parent };
  target.contains = (candidate) => {
    for (let node = candidate; node; node = node.parent) {
      if (node === target) return true;
    }
    return false;
  };
  return target;
}

test("a moved touch suppresses only its synthetic click", () => {
  let clock = 100;
  const tracker = createScrollIntentTracker({ now: () => clock });
  const row = createTarget();
  const label = createTarget(row);

  assert.equal(tracker.begin({ id: 7, x: 10, y: 10, target: label }), true);
  assert.equal(tracker.move({ id: 7, x: 10, y: 24, target: label }), true);
  clock = 120;
  assert.equal(tracker.end({ id: 7, target: label }), true);
  assert.equal(tracker.shouldSuppressClick({ target: row, detail: 1 }), true);
  assert.equal(tracker.shouldSuppressClick({ target: row, detail: 1 }), false);
});

test("a tap, small finger drift and keyboard activation remain clickable", () => {
  let clock = 200;
  const tracker = createScrollIntentTracker({ now: () => clock });
  const button = createTarget();

  tracker.begin({ id: 1, x: 20, y: 20, target: button });
  assert.equal(tracker.move({ id: 1, x: 26, y: 25, target: button }), false);
  assert.equal(tracker.end({ id: 1, target: button }), false);
  assert.equal(tracker.shouldSuppressClick({ target: button, detail: 1 }), false);

  tracker.begin({ id: 2, x: 0, y: 0, target: button });
  tracker.move({ id: 2, x: 0, y: 18, target: button });
  tracker.end({ id: 2, target: button });
  assert.equal(tracker.shouldSuppressClick({ target: button, detail: 0 }), false);
  assert.equal(
    tracker.shouldSuppressClick({ target: button, detail: 0, pointerType: "touch" }),
    true
  );
});

test("a touch-driven scroll and moved pointer cancellation cannot activate the touched control", () => {
  let clock = 300;
  const tracker = createScrollIntentTracker({ now: () => clock });
  const button = createTarget();

  tracker.begin({ id: 3, x: 0, y: 0, target: button });
  tracker.move({ id: 3, x: 0, y: 3, target: button });
  assert.equal(tracker.markScrolled(), true);
  tracker.end({ id: 3, target: button });
  assert.equal(tracker.shouldSuppressClick({ target: button, detail: 1 }), true);

  tracker.begin({ id: 4, x: 0, y: 0, target: button });
  tracker.move({ id: 4, x: 0, y: 18, target: button });
  assert.equal(tracker.cancel({ id: 4, target: button }), true);
  assert.equal(tracker.shouldSuppressClick({ target: button, detail: 1 }), true);
});

test("a stationary WebView pointer cancellation does not consume the intended click", () => {
  const tracker = createScrollIntentTracker();
  const button = createTarget();

  tracker.begin({ id: 9, x: 40, y: 80, target: button });
  assert.equal(tracker.cancel({ id: 9, target: button }), false);
  assert.equal(
    tracker.shouldSuppressClick({ target: button, detail: 1, pointerType: "touch" }),
    false
  );
});

test("an unrelated scroll during a stationary tap does not consume its first click", () => {
  const tracker = createScrollIntentTracker();
  const participantRow = createTarget();

  tracker.begin({ id: 8, x: 40, y: 80, target: participantRow });
  assert.equal(tracker.markScrolled(), false);
  assert.equal(tracker.end({ id: 8, target: participantRow }), false);
  assert.equal(
    tracker.shouldSuppressClick({ target: participantRow, detail: 1 }),
    false
  );
});

test("a new deliberate touch clears stale scroll suppression", () => {
  let clock = 400;
  const tracker = createScrollIntentTracker({ now: () => clock });
  const row = createTarget();

  tracker.begin({ id: 5, x: 0, y: 0, target: row });
  tracker.move({ id: 5, x: 0, y: 20, target: row });
  tracker.end({ id: 5, target: row });

  tracker.begin({ id: 6, x: 0, y: 0, target: row });
  tracker.end({ id: 6, target: row });
  assert.equal(tracker.shouldSuppressClick({ target: row, detail: 1 }), false);
});

test("the global guard loads before the app click layers and ships offline", async () => {
  const [index, serviceWorker] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("sw.js", "utf8")
  ]);
  const guardIndex = index.indexOf("publicScrollIntentLayer.mjs");
  const appIndex = index.indexOf("src/app.mjs");
  const accountIndex = index.indexOf("publicAccountAuthLayer.mjs");

  assert.ok(guardIndex >= 0);
  assert.ok(guardIndex < appIndex);
  assert.ok(guardIndex < accountIndex);
  assert.match(serviceWorker, /settle-friends-live-v448/);
  assert.match(serviceWorker, /publicScrollIntentLayer\.mjs/);
  assert.match(serviceWorker, /scrollIntent\.mjs/);
});
