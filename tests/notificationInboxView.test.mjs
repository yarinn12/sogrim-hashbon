import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { renderNotificationInboxView } from "../src/ui/notificationInbox.mjs";

// Captured from the actual renderer at this immutable source, before extraction.
// Never regenerate the hashes from the replacement renderer to accept a change.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/notification-inbox-view.json", import.meta.url), "utf8"));
const digest = html => createHash("sha256").update(html).digest("hex");
const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
const adapter = app.slice(app.indexOf("function notificationInboxViewModel()"), app.indexOf("function formatNotificationTime("));

function freezeModel(model) {
  model.items.forEach(Object.freeze);
  Object.freeze(model.items);
  return Object.freeze(model);
}

for (const scenario of fixture.cases) {
  test(`notification presentation preserves legacy markup: ${scenario.name}`, () => {
    const model = freezeModel(structuredClone(scenario.model));
    const before = JSON.stringify(model);
    const html = renderNotificationInboxView(model);
    assert.equal(digest(html), scenario.htmlSha256);
    assert.equal(renderNotificationInboxView(model), html, "rendering has no clock or state dependency");
    assert.equal(JSON.stringify(model), before, "rendering cannot mutate input");
  });
}

test("actual app adapter retains state precedence, unread counts, time labels and item order", () => {
  assert.ok(adapter.startsWith("function notificationInboxViewModel()"));
  assert.match(app, /import \{ renderNotificationInboxView \} from "\.\/ui\/notificationInbox\.mjs"/);
  for (const scenario of fixture.cases) {
    const input = structuredClone(scenario.input);
    const before = JSON.stringify(input);
    const context = vm.createContext({ notificationInbox: input.inbox,
      visibleNotificationInboxItems: () => input.inbox.items,
      notificationUnreadCount: () => input.unread,
      formatNotificationTime: value => `תווית זמן: ${value}`,
      renderAppBackButton: () => input.backButtonHtml, renderNotice: () => input.noticeHtml,
      renderNotificationInboxView });
    vm.runInContext(adapter, context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.notificationInboxViewModel())), scenario.model, scenario.name);
    assert.equal(digest(context.renderNotificationInbox()), scenario.htmlSha256, scenario.name);
    assert.equal(JSON.stringify(input), before, "the adapter leaves fetched notifications unchanged");
  }
});

test("user notification text is escaped while application actions and trusted fragments remain intact", () => {
  const scenario = fixture.cases.find(item => item.name === "expense-created/unexpected/unread");
  const html = renderNotificationInboxView(scenario.model);
  assert.doesNotMatch(html, /<script>|<img src=x|data-notification-id="n"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-notification-id="n&quot;&lt;1&gt;&amp;"/);
  assert.match(html, /data-notification-view="event"/);
  assert.match(html, /data-action="open-notification"/);
  assert.match(html, /aria-label="לא נקרא"/);
  assert.equal((html.match(/data-action="mark-all-notifications-read"/g) ?? []).length, 1);
  assert.match(html, /data-action="back"/);
  const read = renderNotificationInboxView(fixture.cases.find(item => item.name === "expense-created/summary/read").model);
  assert.match(read, /data-notification-view="summary"/);
  assert.doesNotMatch(read, /notification-unread-dot|mark-all-notifications-read/);
});

test("time formatting remains in the adapter and preserves minute, hour and calendar boundaries", () => {
  const formatter = app.slice(app.indexOf("function formatNotificationTime("), app.indexOf("function renderProfileAvatarPicker("));
  const now = Date.parse("2026-10-13T12:00:00Z");
  class FixedDate extends Date { static now() { return now; } }
  const context = vm.createContext({ Date: FixedDate, formatRelativeCalendarDate: value => value.startsWith("2026-10-13") ? "היום" : "אתמול" });
  vm.runInContext(formatter, context);
  for (const [value, expected] of [
    ["invalid", ""], ["2026-10-13T12:00:01Z", "עכשיו"],
    ["2026-10-13T11:59:00Z", "לפני 1 דק׳"], ["2026-10-13T11:01:00Z", "לפני 59 דק׳"],
    ["2026-10-13T11:00:00Z", "לפני 1 שע׳"], ["2026-10-12T23:59:00Z", "אתמול"]
  ]) assert.equal(context.formatNotificationTime(value), expected);
});

test("the notification UI dependency is available in both service worker cache inventories", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.equal((sw.match(/"\/src\/ui\/notificationInbox\.mjs"/g) ?? []).length, 2);
});
