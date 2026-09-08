import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import {
  isRoutineProgressNotice,
  noticePresentation
} from "../src/domain/userNoticePolicy.mjs";

test("client copy never reintroduces the removed pending-sync announcement", () => {
  const root = new URL("../src/", import.meta.url);
  const forbidden = /ממתינ[\u0590-\u05ff]* לסנכרון|נשמר[\u0590-\u05ff]* במכשיר|השלמת הסנכרון|השינויים ממתינים במכשיר|[יוות]סתנכר[\u0590-\u05ff]* אוטומטית|הסנכרון יושלם אוטומטית|מסתנכרנת ברקע/;
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith(".mjs"))) {
    const match = readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8").match(forbidden);
    assert.equal(match?.[0] ?? "", "", file);
  }
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
