import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the retired contact picker is absent from the native build and event flow", async () => {
  const [manifest, activity, bridge, app, pluginExists] = await Promise.all([
    readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java",
      "utf8"
    ),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
    readFile("src/app.mjs", "utf8"),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/SogrimContactPickerPlugin.java",
      "utf8"
    ).then(() => true, () => false)
  ]);

  assert.doesNotMatch(manifest, /READ_CONTACTS|WRITE_CONTACTS/);
  assert.doesNotMatch(activity, /SogrimContactPickerPlugin/);
  assert.equal(pluginExists, false);
  assert.doesNotMatch(bridge, /SogrimContactPicker|contacts:\s*\{|pickContact/);
  assert.doesNotMatch(app, /data-action="pick-event-contact"/);
  assert.doesNotMatch(app, /pickEventContact|nativeContactPickerAvailable/);
});
