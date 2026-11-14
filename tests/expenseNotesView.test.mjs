import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import * as presentation from "../src/ui/expenseFormPresentation.mjs";
const source=await readFile("src/app.mjs","utf8");
const start=source.indexOf("function renderExpenseNotesDialog("),end=source.indexOf("\nfunction ",start+1);
const renderer=source.slice(start,end);
const escape=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function render(overrides={},canEdit=true){
 const draft={name:'ארוחת ערב',notes:'הערה קיימת',attachmentImage:'',error:'',total:'240',payers:[{participantId:'owner',amount:'240'}],...overrides};const before=structuredClone(draft);
 const html=runInNewContext(renderer+'\nrenderExpenseNotesDialog({id:"event"},canEdit);',{expenseDraft:draft,canEdit,escapeHtml:escape,escapeAttribute:escape,iconSvg:()=>'<svg></svg>',renderEventRoutePrimaryNav:()=>'<nav aria-label="ניווט ראשי"></nav>',...presentation});
 assert.deepEqual(draft,before,'rendering never changes the expense draft or money');return html;
}
test('notes editor renders existing operation failures as an accessible escaped alert',()=>{
 const message='ההוצאה לא נשמרה. <בדיקה> "נסה שוב"';const html=render({error:message});
 assert.match(html,/<p class="error" id="expense-form-error" role="alert" tabindex="-1">/);
 assert(html.includes(escape(message)));assert(!html.includes('<בדיקה>'));assert(html.includes('הערה קיימת'));
 assert(!render().includes('id="expense-form-error"'),'no empty alert is shown in a successful state');
});
test('notes presentation escapes editable text and preserves distinct image sources and read-only controls',()=>{
 const html=render({name:'שם "<לא HTML>',notes:'<textarea>דוגמה</textarea>',attachmentImage:'data:image/jpeg;base64,a"<b'},false);
 assert(!html.includes('<לא HTML>'));assert(html.includes('&lt;textarea&gt;דוגמה&lt;/textarea&gt;'));
 assert.match(html,/<fieldset[^>]*disabled/);assert.match(html,/<button[^>]*data-action="save-expense"[^>]*disabled/);
 assert.match(html,/<input data-action="expense-attachment-image" type="file" accept="image\/\*" hidden/);
 assert.match(html,/data-image-source="camera-fallback"[^>]*capture="environment"/);
 for(const action of ['select-expense-attachment','capture-expense-attachment','remove-expense-attachment','save-expense'])assert(html.includes('data-action="'+action+'"'));
});
test('notes-only screen uses the approved single-screen structure and explicit save label',()=>{
 const html=render();assert.match(html,/expense-step-modal expense-notes-modal" data-expense-step="notes"/);
 assert.match(html,/class="expense-flow-body expense-notes-body"/);assert.match(html,/class="actions expense-modal-actions is-next expense-notes-actions"/);
 assert.match(html,/title="ארוחת ערב"/);assert.match(html,/>שמור שינויים<\/button>/);assert(!html.includes('expense-flow-progress'));
 assert.match(html,/aria-label="חזרה לאירוע"/);assert(html.includes('ניווט ראשי'));
});
