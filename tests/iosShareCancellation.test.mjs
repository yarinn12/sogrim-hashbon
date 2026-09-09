import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("src/app.mjs", "utf8");
const inviteSource = source.slice(source.indexOf("async function shareInviteOnWhatsApp"), source.indexOf("function openPendingShareWindow"));

async function withNativeShare(share, run) {
  const keys = ["Capacitor", "SogrimNative", "document", "window"];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { Share: { share } } },
    document: { documentElement: { classList: { add() {} } }, addEventListener() {} },
    window: { location: { protocol: "capacitor:", hostname: "localhost" } }
  });
  try {
    await import(`../src/publicNativeBridgeLayer.mjs?share-test=${Math.random()}`);
    await run(globalThis.SogrimNative);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function inviteHarness(native) {
  const navigation = [];
  const metrics = [];
  const failures = [];
  const context = vm.createContext({
    SogrimNative: native,
    getEvent: () => ({ id: "event-share", name: "בדיקת שיתוף" }),
    prepareEventShare: async () => "https://sogrim-hesbon-app.vercel.app/i/event-share?token=synthetic",
    openPendingShareWindow: () => { throw new Error("native sharing must not pre-open a browser"); },
    window: { location: { assign: url => navigation.push(url) } },
    emitProductMetric: name => metrics.push(name),
    emitOperationFailure: name => failures.push(name),
    notice: "", render() {}
  });
  vm.runInContext(inviteSource, context);
  return { context, navigation, metrics, failures, run: () => context.shareInviteOnWhatsApp("event-share") };
}

test("the exact iOS Share cancellation is exposed as AbortError", async () => {
  await withNativeShare(async () => { throw new Error("Share canceled"); }, async native => {
    await assert.rejects(native.share({ text: "test" }), { name: "AbortError" });
  });
});

test("cancelling an iOS invite sheet stays in the app without WhatsApp or success metrics", async () => {
  await withNativeShare(async () => { throw new Error("Share canceled"); }, async native => {
    const harness = inviteHarness(native);
    await harness.run();
    assert.deepEqual(harness.navigation, [], "Cancel must never launch the WhatsApp fallback");
    assert.deepEqual(harness.metrics, []);
    assert.deepEqual(harness.failures, []);
    assert.equal(harness.context.notice, "");
  });
});

test("an actual native Share failure still opens the WhatsApp fallback", async () => {
  await withNativeShare(async () => { throw new Error("Error sharing item"); }, async native => {
    const harness = inviteHarness(native);
    await harness.run();
    assert.equal(harness.navigation.length, 1);
    assert.match(harness.navigation[0], /^https:\/\/wa\.me\//);
  });
});

test("a completed iOS share receives the prepared invite and records success once", async () => {
  const calls = [];
  await withNativeShare(async options => { calls.push(options); return { activityType: "com.apple.UIKit.activity.CopyToPasteboard" }; }, async native => {
    const harness = inviteHarness(native);
    await harness.run();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/i\/event-share\?token=synthetic$/);
    assert.deepEqual(harness.navigation, []);
    assert.deepEqual(harness.metrics, ["invite_shared"]);
  });
});
