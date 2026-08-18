import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("notification time stays relative within today and switches to calendar labels after it", async () => {
  const app = await readFile("src/app.mjs", "utf8");
  const source = app.slice(
    app.indexOf("function formatNotificationTime("),
    app.indexOf("function renderProfileAvatarPicker(")
  );

  assert.match(source, /const calendarLabel = formatRelativeCalendarDate\(value\)/);
  assert.match(source, /if \(calendarLabel === "היום"\)/);
  assert.match(source, /return `לפני \$\{Math\.floor\(elapsedMinutes \/ 60\)\} שע׳`/);
  assert.match(source, /return calendarLabel/);
  assert.doesNotMatch(source, /elapsedHours < 24/);
});
