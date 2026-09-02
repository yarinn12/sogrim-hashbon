import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runGuardedInteraction } from "../src/interactionBoundary.mjs";

test("guarded interactions preserve synchronous browser cancellation", () => {
  const target = new EventTarget();
  const failures = [];
  target.addEventListener("submit", (event) => {
    runGuardedInteraction(
      (currentEvent) => currentEvent.preventDefault(),
      event,
      (error) => failures.push(error)
    );
  });

  const event = new Event("submit", { cancelable: true });
  const dispatchResult = target.dispatchEvent(event);

  assert.equal(dispatchResult, false);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(failures, []);
});

test("guarded interactions contain synchronous and asynchronous failures", async () => {
  const failures = [];
  runGuardedInteraction(
    () => { throw new Error("sync failure"); },
    new Event("click"),
    (error) => failures.push(error.message)
  );
  runGuardedInteraction(
    async () => { throw new Error("async failure"); },
    new Event("click"),
    (error) => failures.push(error.message)
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(failures, ["sync failure", "async failure"]);
});

test("app interactions use the synchronous guarded boundary", async () => {
  const app = await readFile("src/app.mjs", "utf8");

  assert.match(app, /app\.addEventListener\("click", handleClickSafely\)/);
  assert.match(app, /app\.addEventListener\("submit", handleSubmitSafely\)/);
  assert.match(app, /app\.addEventListener\("change", handleChangeSafely\)/);
  assert.match(
    app,
    /function runAppInteraction\(handler, event\) \{[\s\S]*?runGuardedInteraction\(handler, event, \(error\) => \{[\s\S]*?emitOperationFailure\("interaction"[\s\S]*?render\(\)/
  );
});
