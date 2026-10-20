import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=await readFile('src/app.mjs','utf8');
const viewUrl=new URL('../src/ui/expenseFormPresentation.mjs',import.meta.url);
const views=existsSync(viewUrl)?await import(viewUrl.href):{};
const extract=name=>{const start=source.indexOf('function '+name+'(');assert(start>=0,name);const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end<0?source.length:end);};
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function render(step='review',depth=3,editing=true){
 const draft={id:editing?'existing':null,eventId:'event',flowStep:step,historyBaseDepth:2,name:'ארוחת ערב',total:'240.00',occurredOn:'2026-10-20',payers:[],sharedByParticipantIds:[]};
 const code=extract('renderExpenseForm');
 const ctx={expenseDraft:draft,appHistoryDepth:depth,expenseParticipantsForCurrentDraft:()=>[],canCurrentParticipantEdit:()=>true,eventTypeConfig:()=>({id:'outing'}),EVENT_TYPE_RESTAURANT:'restaurant',EVENT_TYPE_TRIP:'trip',normalizeExpenseFlowStep:s=>s,expenseFlowMeta:s=>({title:s==='review'?'הכול מוכן?':'על מה הייתה ההוצאה?',number:s==='review'?5:2,total:5,description:''}),escapeHtml:escape,escapeAttribute:escape,expenseUsesForeignCurrency:()=>false,currencyCompactLabel:()=> '₪',eventCurrency:()=> 'ILS',expenseFlowFieldErrorAttributes:()=>'',expenseFlowReady:()=>true,expenseFlowNextLabel:()=> 'המשך',EXPENSE_TEMPLATES:[],ADD_PAYER_PARTICIPANT_VALUE:'add',iconSvg:()=>'<svg></svg>',...views};
 for(const name of new Set(code.match(/render[A-Z]\w+/g)))if(name!=='renderExpenseForm'&&!ctx[name])ctx[name]=()=>'';
 return runInNewContext(code+'\nrenderExpenseForm({id:"event",eventType:"outing"});',ctx);
}
test('shared date caption is readable and independent of browser-native formatting',()=>{
 const html=runInNewContext(extract('renderExpenseDateField')+'\nrenderExpenseDateField("expense-review-date");',{expenseDraft:{occurredOn:'2026-10-20'},escapeHtml:escape,escapeAttribute:escape,iconSvg:()=>'<svg></svg>',...views});
 assert.match(html,/data-expense-date-caption[^>]*>20\.10\.2026<\/bdi>/);
 assert.match(html,/type="date"/);assert.match(html,/value="2026-10-20"/);assert.match(html,/aria-label="תאריך ההוצאה: 20\.10\.2026"/);
});
test('Back destination is the event on entry and the prior edit page after inner navigation',()=>{
 assert.match(render('review',3),/data-action="expense-step-back" aria-label="חזרה לאירוע"/);
 assert.match(render('name',4),/data-action="expense-step-back" aria-label="חזרה לשלב הקודם"/);
});
test('edit overview heading is specific while creation and individual questions remain',()=>{
 assert.match(render(),/<h2 id="expense-modal-title">עריכת הוצאה<\/h2>/);
 assert.match(render('review',7,false),/<h2 id="expense-modal-title">הכול מוכן\?<\/h2>/);
 assert.match(render('name',4),/<h2 id="expense-modal-title">על מה הייתה ההוצאה\?<\/h2>/);
});
test('Escape belongs to the native date field and does not exit expense editing',()=>{
 let back=0;const ctx={...views,handleRadioGroupKeyboardNavigation:()=>false,handleFriendsHubTabKeyboardNavigation:()=>false,handleInputKeyboardShortcut:()=>false,closeOpenTransientMenus:()=>false,settlementCloseConfirmation:null,app:{querySelector:()=>({})},goBackInApp:()=>back++};
 const handler=runInNewContext(extract('handleDialogKeydown')+'\nhandleDialogKeydown;',ctx);
 handler({key:'Escape',target:{matches:s=>s==='.expense-date-picker-input',closest:()=>null},preventDefault(){}});
 assert.equal(back,0,'closing a date picker must leave the expense editor open');
 handler({key:'Escape',target:{matches:()=>false,closest:()=>null},preventDefault(){}});
 assert.equal(back,1,'ordinary dialog Escape still navigates back');
});
