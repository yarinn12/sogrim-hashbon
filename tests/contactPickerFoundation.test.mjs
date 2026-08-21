import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Android contact selection uses the system picker without broad contacts permission", async () => {
  const [manifest, activity, plugin, bridge, app] = await Promise.all([
    readFile("android/app/src/main/AndroidManifest.xml", "utf8"),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/MainActivity.java",
      "utf8"
    ),
    readFile(
      "android/app/src/main/java/com/sogrimhashbon/app/SogrimContactPickerPlugin.java",
      "utf8"
    ),
    readFile("src/publicNativeBridgeLayer.mjs", "utf8"),
    readFile("src/app.mjs", "utf8")
  ]);

  assert.doesNotMatch(manifest, /READ_CONTACTS|WRITE_CONTACTS/);
  assert.match(activity, /registerPlugin\(SogrimContactPickerPlugin\.class\)/);
  assert.match(plugin, /Intent\.ACTION_PICK/);
  assert.match(plugin, /CommonDataKinds\.Phone\.CONTENT_URI/);
  assert.doesNotMatch(plugin, /CommonDataKinds\.Phone\.NUMBER/);
  assert.match(plugin, /@ActivityCallback/);
  assert.match(plugin, /MAX_DISPLAY_NAME_CODE_POINTS = 48/);
  assert.match(plugin, /MAX_RAW_DISPLAY_NAME_CHARS = 256/);
  assert.match(plugin, /substring\(0, MAX_RAW_DISPLAY_NAME_CHARS\)/);
  assert.equal(plugin.includes("\\\\p{Cc}\\\\p{Cf}"), true);
  assert.match(plugin, /offsetByCodePoints\(0, MAX_DISPLAY_NAME_CODE_POINTS\)/);
  assert.match(bridge, /contacts:\s*\{/);
  assert.match(bridge, /contactPickerPlugin\.pickContact/);
  assert.match(bridge, /normalizeNativeContactName\(result\?\.displayName\)/);
  assert.match(bridge, /\.slice\(0, 256\)/);
  assert.match(bridge, /\\p\{Cc\}\\p\{Cf\}/);
  assert.match(bridge, /\.slice\(0, 48\)/);
  assert.match(app, /data-action="pick-event-contact"/);
  assert.match(app, /\[contacts\] Contact selection failed/);
  assert.doesNotMatch(app, /\[contacts\] Contact selection failed[^;]+(?:message|stack)/s);
  assert.match(app, /המספר עצמו לא נשמר/);
});
