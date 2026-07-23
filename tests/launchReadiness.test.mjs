import test from "node:test";
import assert from "node:assert/strict";

import { getLaunchReadinessItems } from "../src/domain/launchReadiness.mjs";

test("getLaunchReadinessItems marks the beta as blocked in local mode", () => {
  const items = getLaunchReadinessItems({
    launch: {
      publicUrlReady: false,
      cloudStorageReady: false,
      googleAuthReady: false,
      shareLinksReady: false
    }
  });

  assert.deepEqual(
    items.map((item) => item.status),
    ["missing", "missing", "optional", "missing"]
  );
  assert.equal(items.at(-1).label, "קישור שאפשר לשלוח לחברים");
});

test("getLaunchReadinessItems marks the beta as ready with public URL and cloud storage", () => {
  const items = getLaunchReadinessItems({
    launch: {
      publicUrlReady: true,
      cloudStorageReady: true,
      googleAuthReady: false,
      shareLinksReady: true
    }
  });

  assert.deepEqual(
    items.map((item) => item.status),
    ["ready", "ready", "optional", "ready"]
  );
});
