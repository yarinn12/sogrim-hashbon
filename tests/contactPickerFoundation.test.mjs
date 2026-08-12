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
  assert.match(bridge, /contacts:\s*\{/);
  assert.match(bridge, /contactPickerPlugin\.pickContact/);
  assert.match(app, /data-action="pick-event-contact"/);
  assert.match(app, /\[contacts\] Contact selection failed/);
  assert.doesNotMatch(app, /\[contacts\] Contact selection failed[^;]+(?:message|stack)/s);
  assert.match(app, /המספר עצמו לא נשמר/);
});
