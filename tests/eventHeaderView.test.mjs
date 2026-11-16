import test from "node:test";
import assert from "node:assert/strict";
import { renderEventHeaderView, renderEventHeaderActionsView } from "../src/ui/eventHeader.mjs";

const model = Object.freeze({ eventId: "event-1", name: "אירוע משפחתי", participantCount: 1,
  currencyLabel: "שקל ישראלי · ₪", participantsLabel: "משתתף 1", backButtonHtml: '<button data-action="back">חזרה</button>' });

test("shared presentation keeps complete utilities, metadata and invitation in the same event card", () => {
  const html = renderEventHeaderView(model);
  assert.equal((html.match(/event-header-actions/g) ?? []).length, 1);
  for (const action of ["open-event-participants", "open-event-participant-add", "open-event-settings"]) assert.equal((html.match(new RegExp(`data-action="${action}"`, "g")) ?? []).length, 1);
  assert.ok(html.indexOf('event-header-actions') < html.indexOf('</header>'));
  assert.match(html, /הזמנת חברים לאירוע/);
  assert.match(html, />משתתף 1 · ₪<\/p>/);
  assert.match(html, /aria-label="שקל ישראלי · ₪ · משתתף 1"/);
  assert.match(html, /<h1>אירוע משפחתי<\/h1>/);
  assert.equal(renderEventHeaderView(model), html);
});

test("presentation treats model text as text and retains action identities", () => {
  const html = renderEventHeaderView({ ...model, eventId: 'e" onfocus="bad', name: '<script>&"', currencyLabel: '<b>USD</b>' });
  assert.doesNotMatch(html, /<script>|<b>USD<\/b>|data-event-id="e" onfocus/);
  assert.match(html, /&lt;script&gt;&amp;&quot;/);
  assert.match(html, /data-event-id="e&quot; onfocus=&quot;bad"/);
  assert.match(renderEventHeaderActionsView({ ...model, participantCount: 2 }), /שיתוף והצטרפות לאירוע/);
});

test("presentation options hide only the requested section without changing the model", () => {
  const html = renderEventHeaderView(model, { showActions: false, showMeta: false });
  assert.doesNotMatch(html, /event-header-actions|event-header-meta/);
  assert.match(html, /data-action="back"/);
  assert.equal(model.participantCount, 1);
});
