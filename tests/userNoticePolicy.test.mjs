import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import {
  isRoutineProgressNotice,
  noticePresentation
} from "../src/domain/userNoticePolicy.mjs";

// Device accessibility preferences are intentionally local. This exact approved
// caption is not a pending financial/cloud-sync notice; all other copy stays scanned.
const forbiddenPendingSyncCopy = /ממתינ[\u0590-\u05ff]* לסנכרון|נשמר[\u0590-\u05ff]* במכשיר|השלמת הסנכרון|השינויים ממתינים במכשיר|[יוות]סתנכר[\u0590-\u05ff]* אוטומטית|הסנכרון יושלם אוטומטית|מסתנכרנת ברקע/;
function copyWithoutDevicePreferenceCaption(file, source) {
  if (file.split(String.fromCharCode(92)).join("/") !== "ui/accessibilityPresentation.mjs") return source;
  return source.replace(
    /(<p id="accessibility-center-description">\s*)השינויים חלים מיד ונשמרים במכשיר הזה\.(\s*<\/p>)/,
    "$1$2"
  );
}

test("client copy never reintroduces the removed pending-sync announcement", () => {
  const root = new URL("../src/", import.meta.url);
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith(".mjs"))) {
    const source = readFileSync(new URL(file.split(String.fromCharCode(92)).join("/"), root), "utf8");
    const match = copyWithoutDevicePreferenceCaption(file, source).match(forbiddenPendingSyncCopy);
    assert.equal(match?.[0] ?? "", "", file);
  }
});

test("the device-preference caption exception cannot hide a pending-sync notice", () => {
  const file = "ui/accessibilityPresentation.mjs";
  const caption = '<p id="accessibility-center-description">השינויים חלים מיד ונשמרים במכשיר הזה.</p>';
  assert.doesNotMatch(copyWithoutDevicePreferenceCaption(file, caption), forbiddenPendingSyncCopy);
  for (const [path, copy] of [
    ["app.mjs", caption],
    [file, caption.replace("accessibility-center-description", "unrelated-notice")],
    [file, caption + '<p>השינויים ממתינים במכשיר</p>'],
    [file, '<p id="accessibility-center-description">הוצאות נשמרות במכשיר</p>'],
    [file, '<p id="accessibility-center-description">הסנכרון יושלם אוטומטית</p>']
  ]) assert.match(copyWithoutDevicePreferenceCaption(path, copy), forbiddenPendingSyncCopy);
});

test("routine progress notices stay inline instead of interrupting the user", () => {
  for (const message of [
    "שומרים את סימון התשלום…",
    "שומרים את האיחוד…",
    "פותח את האירוע ושומר…",
    "מסיר את תמונת האירוע…",
    "שומרים את אופן הניהול..."
  ]) {
    assert.equal(isRoutineProgressNotice(message), true);
    assert.equal(noticePresentation(message).visible, false);
  }
});

test("action results remain dismissible and expire without lingering", () => {
  assert.deepEqual(noticePresentation("האירוע עודכן."), {
    visible: true,
    ttlMs: 5_500,
    kind: "status"
  });
  assert.deepEqual(noticePresentation("לא הצלחנו לשמור כרגע."), {
    visible: true,
    ttlMs: 9_000,
    kind: "error"
  });
});
