import test from "node:test";
import assert from "node:assert/strict";
import { renderEventActionDockView, renderEventPersonalBalanceView } from "../src/ui/eventFinancialCards.mjs";

test("credit copy explains the current result and summary precedes the unchanged amount", () => {
 const model=Object.freeze({ eventId:"e-1", direction:"credit", amountText:"₪110.00", counterpartLabel:"מול 2 משתתפים" });
 const html=renderEventPersonalBalanceView(model);
 assert.match(html,/צריכים להחזיר לך/); assert.match(html,/לפי ההוצאות עד עכשיו/);
 assert.doesNotMatch(html,/מול 2 משתתפים/);
 assert.match(html,/aria-label="צריכים להחזיר לך: ₪110.00. לפי ההוצאות עד עכשיו. פתיחת הסיכום"/);
 assert.ok(html.indexOf('event-personal-balance-summary')<html.indexOf('class="amount"'));
 assert.match(html,/data-action="settle" data-event-id="e-1"/);
 assert.equal(model.counterpartLabel,"מול 2 משתתפים");
});

test("debt and balanced directions keep their existing meaning and counterpart detail", () => {
 for(const [direction,label] of [["debt","עליך להעביר"],["balanced","אתה מאוזן"]]) {
  const html=renderEventPersonalBalanceView({eventId:"e",direction,amountText:"₪12.00",counterpartLabel:"מול דנה"});
  assert.ok(html.includes(label));assert.match(html,/מול דנה/);assert.doesNotMatch(html,/צריכים להחזיר לך/);
 }
});

test("total explanation retains pending synchronization and edit permission controls", () => {
 const editable=renderEventActionDockView({eventId:"e",totalText:"₪240.00",canEdit:true});
 assert.match(editable,/סה״כ הוצאות/);assert.match(editable,/data-action="show-expense-form"/);
 assert.match(editable,/data-inline-sync-status data-sync-event-id="e" hidden/);
 assert.match(editable,/data-inline-sync-retry data-sync-retry hidden/);
 assert.doesNotMatch(editable,/disabled/);
 const closed=renderEventActionDockView({eventId:"e",totalText:"₪240.00",canEdit:false,isClosed:true});
 assert.match(closed,/data-event-id="e" disabled/);assert.match(closed,/האירוע סגור/);
});

test("financial display models escape text and identifiers without interpreting markup", () => {
 const html=renderEventPersonalBalanceView({eventId:'e" onclick="bad',direction:"debt",amountText:"<b>10</b>",counterpartLabel:"<script>bad</script>"});
 assert.doesNotMatch(html,/<b>|<script>|data-event-id="e" onclick/);assert.match(html,/&lt;b&gt;10&lt;\/b&gt;/);
 const dock=renderEventActionDockView({eventId:'e" onfocus="bad',totalText:"<i>20</i>",canEdit:true});
 assert.doesNotMatch(dock,/<i>|data-event-id="e" onfocus/);
});


test("an open event restricted by permissions is read-only rather than falsely closed",()=>{
 const html=renderEventActionDockView({eventId:'open-restricted',totalText:'₪240.00',canEdit:false,isClosed:false});
 assert.match(html,/data-event-id="open-restricted" disabled/);
 assert.match(html,/קריאה בלבד/);
 assert.doesNotMatch(html,/האירוע סגור/);
});
