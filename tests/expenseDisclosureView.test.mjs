import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderExpenseTitleView, renderExpenseParticipantsHeadingView } from "../src/ui/expenseDisclosure.mjs";

test("expense title retains its full name and a decorative state cue, without a second command",()=>{
 const name="כרטיסי רכבת לכל המשפחה בירושלים ובתל אביב ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
 const model=Object.freeze({name});
 const html=renderExpenseTitleView(model);
 assert.ok(html.includes(`<span class="expense-row-title-text">${name}</span>`));
 assert.match(html,/class="expense-row-expand-icon" aria-hidden="true"><svg/);
 assert.doesNotMatch(html,/<button|data-action=|tabindex=/);
 assert.equal(model.name,name);
});

test("shared-expense heading names its role and preserves the accessible list identity",()=>{
 const html=renderExpenseParticipantsHeadingView({expenseId:"expense-12"});
 assert.equal(html,'<p class="expense-participants-list-title" id="expense-participants-title-expense-12">מתחלקים בהוצאה</p>');
});

test("expense disclosure escapes names and list identifiers as plain text",()=>{
 const title=renderExpenseTitleView({name:'<img src=x onerror="bad"> & \'שם\''});
 assert.doesNotMatch(title,/<img|onerror="bad"/);
 assert.match(title,/&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; &#039;שם&#039;/);
 const heading=renderExpenseParticipantsHeadingView({expenseId:'x" onfocus="bad'});
 assert.match(heading,/expense-participants-title-x&quot; onfocus=&quot;bad/);
 assert.doesNotMatch(heading,/id="[^"]*" onfocus=/);
});

test("shared source delegates only presentation and precaches it in both inventories",async()=>{
 const app=await readFile('src/app.mjs','utf8'),sw=await readFile('sw.js','utf8');
 assert.match(app,/renderExpenseTitleView\(\{ name: expense.name \}\)/);
 assert.match(app,/renderExpenseParticipantsHeadingView\(\{ expenseId: expense.id \}\)/);
 assert.equal(sw.split('"/src/ui/expenseDisclosure.mjs"').length-1,2);
 const toggle=app.slice(app.indexOf('  if (action === "toggle-expense-participants")'),app.indexOf('  if (action === "toggle-expense-participants")')+900);
 assert.match(toggle,/hydrateExpenseParticipants\(details, event, expense\)/);
 assert.match(toggle,/details.open = !details.open;/);
 assert.match(toggle,/target.setAttribute\("aria-expanded", String\(details.open\)\)/);
});
