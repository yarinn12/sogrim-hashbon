import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("src/publicMutationThrottleLayer.mjs", "utf8");

function createObserverHarness() {
  const frames = new Map();
  let frameId = 0;
  class NativeMutationObserver {
    constructor(callback) {
      if (typeof callback !== "function") throw new TypeError("callback must be a function");
      this.deliver = (records) => callback.call(this, records, this);
      this.nativeRecords = [];
    }
    observe() {}
    disconnect() { this.nativeRecords = []; }
    takeRecords() { return this.nativeRecords.splice(0); }
  }
  const window = { MutationObserver: NativeMutationObserver };
  const context = vm.createContext({
    window,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  vm.runInContext(source, context);
  return {
    Observer: window.MutationObserver,
    frames,
    reinstall() { vm.runInNewContext(source, { window }); },
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    }
  };
}

test("public mutation throttle layer loads before product observers", async () => {
  const index = await readFile("index.html", "utf8");

  assert.match(index, /publicMutationThrottleLayer\.mjs/);
  assert.ok(
    index.indexOf("publicMutationThrottleLayer.mjs") <
      index.indexOf("publicNativeBridgeLayer.mjs")
  );
  assert.ok(
    index.indexOf("publicMutationThrottleLayer.mjs") <
      index.indexOf("publicProfileOverlay.mjs")
  );
});

test("public mutation throttle layer schedules mutation callbacks", async () => {
  const layer = await readFile("src/publicMutationThrottleLayer.mjs", "utf8");

  assert.match(layer, /window\.MutationObserver/);
  assert.match(layer, /requestAnimationFrame/);
  assert.match(layer, /__sogrimMutationObserverThrottled/);
});

test("scheduled observers retain all mutation batches in order within one frame", () => {
  const h = createObserverHarness();
  const delivered = [];
  const observer = new h.Observer((records) => delivered.push(Array.from(records)));
  const records = [{ target: "first" }, { target: "second" }, { target: "third" }];
  observer.deliver(records.slice(0, 2));
  observer.deliver(records.slice(2));
  assert.equal(h.frames.size, 1, "multiple native deliveries schedule only one frame");
  assert.equal(delivered.length, 0, "delivery remains deferred until the frame");
  h.frame();
  assert.deepEqual(delivered, [records]);
});

test("disconnect discards buffered records and cancels deferred delivery", () => {
  const h = createObserverHarness();
  let calls = 0;
  const observer = new h.Observer(() => { calls += 1; });
  observer.deliver([{ target: "old-screen" }]);
  observer.disconnect();
  h.frame();
  assert.equal(calls, 0, "a disconnected screen must not be revisited by a stale callback");
  assert.equal(h.frames.size, 0);
});

test("takeRecords drains deferred and native records once without a later empty callback", () => {
  const h = createObserverHarness();
  let calls = 0;
  const observer = new h.Observer(() => { calls += 1; });
  const buffered = { target: "buffered" };
  const native = { target: "native" };
  observer.deliver([buffered]);
  observer.nativeRecords.push(native);
  assert.deepEqual(Array.from(observer.takeRecords()), [buffered, native]);
  assert.deepEqual(Array.from(observer.takeRecords()), []);
  h.frame();
  assert.equal(calls, 0);
});

test("scheduled callbacks preserve the observer argument and native callback receiver", () => {
  const h = createObserverHarness();
  let actualReceiver;
  let actualObserver;
  const observer = new h.Observer(function (_records, deliveredObserver) {
    actualReceiver = this;
    actualObserver = deliveredObserver;
  });
  observer.deliver([{ target: "screen" }]);
  h.frame();
  assert.equal(actualReceiver, observer);
  assert.equal(actualObserver, observer);
});

test("disconnect and reobserve isolate cancelled frames from fresh records", () => {
  const h = createObserverHarness();
  const batches = [];
  const observer = new h.Observer((records) => batches.push(Array.from(records)));
  observer.deliver([{ target: "old" }]);
  const obsoleteFrame = [...h.frames.values()][0];
  observer.disconnect();
  observer.observe({});
  const fresh = { target: "new" };
  observer.deliver([fresh]);
  obsoleteFrame(); // Even a callback already copied by the scheduler is obsolete.
  assert.equal(batches.length, 0);
  h.frame();
  assert.deepEqual(batches, [[fresh]]);
});

test("mutations triggered by a callback schedule a separate next frame", () => {
  const h = createObserverHarness();
  const batches = [];
  const observer = new h.Observer((records) => {
    batches.push(Array.from(records));
    if (batches.length === 1) observer.deliver([{ target: "follow-up" }]);
  });
  observer.deliver([{ target: "initial" }]);
  h.frame();
  assert.equal(batches.length, 1);
  assert.equal(h.frames.size, 1);
  h.frame();
  assert.deepEqual(batches, [[{ target: "initial" }], [{ target: "follow-up" }]]);
});

test("a callback exception does not strand later observer updates", () => {
  const h = createObserverHarness();
  let calls = 0;
  const observer = new h.Observer(() => {
    calls += 1;
    if (calls === 1) throw new Error("callback failed");
  });
  observer.deliver([{ target: "first" }]);
  assert.throws(() => h.frame(), /callback failed/);
  observer.deliver([{ target: "second" }]);
  h.frame();
  assert.equal(calls, 2);
});

test("observer construction rejects a non-function immediately", () => {
  const h = createObserverHarness();
  for (const callback of [undefined, null, 0, {}, "callback"]) {
    assert.throws(() => new h.Observer(callback), { name: "TypeError" });
  }
});

test("reinstalling the layer does not wrap the observer twice", () => {
  const h = createObserverHarness();
  h.reinstall();
  const observer = new h.Observer(() => {});
  observer.deliver([{ target: "screen" }]);
  assert.equal(h.frames.size, 1);
  h.frame();
  assert.equal(h.frames.size, 0);
});
