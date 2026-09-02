import test from "node:test";
import assert from "node:assert/strict";

import { isTransientAccountError } from "../src/domain/accountErrors.mjs";

test("retry-later account responses keep the signed-in session", () => {
  for (const status of [408, 425, 429, 500, 502, 503, undefined]) {
    assert.equal(
      isTransientAccountError({ status }),
      true,
      `status ${status} should be retried without clearing the session`
    );
  }
});

test("invalid account credentials still end the session", () => {
  for (const status of [400, 401, 403]) {
    assert.equal(
      isTransientAccountError({ status }),
      false,
      `status ${status} should remain terminal`
    );
  }
});
