import assert from "node:assert/strict";
import test from "node:test";
import {
  isRoutineProgressNotice,
  noticePresentation
} from "../src/domain/userNoticePolicy.mjs";

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
