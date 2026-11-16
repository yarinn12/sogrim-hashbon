import test from "node:test";
import assert from "node:assert/strict";
import { renderExpenseParticipantToolbarView, expenseFriendChoiceDescription } from "../src/ui/expenseParticipantSelection.mjs";
import { renderExpenseFlowProgressView } from "../src/ui/expenseFlowProgress.mjs";

for(const [selected,want] of [[[],"false"],[["a"],"mixed"],[["a","b"],"true"],[["a","a","b","stale"],"true"]]){
 test(`bulk toolbar stays visible with selection state ${want} (${selected.length} IDs)`,()=>{
  const html=renderExpenseParticipantToolbarView({availableIds:['a','b'],selectedIds:selected,checkIcon:'<svg data-existing-icon></svg>'});
  assert.match(html,new RegExp(`aria-pressed="${want}"`));assert.doesNotMatch(html,/\shidden(?:[\s>]|=)/);
  assert.match(html,/data-action="expense-select-all"/);assert.match(html,/סמן את כולם/);
 });
}
test('no eligible rows never announce all selected',()=>assert.match(renderExpenseParticipantToolbarView({availableIds:[],selectedIds:['stale'],checkIcon:''}),/aria-pressed="false"/));
for(const [status,connected,available,want] of [
 ['ready',false,false,'עדיין אין לך חברים באפליקציה'],['ready',true,false,'כל החברים שלך כבר באירוע'],
 ['ready',true,true,'בחר משתמש שכבר מחובר אליך'],['loading',false,false,'טוענים את רשימת החברים…'],
 ['error',false,false,'רשימת החברים אינה זמינה כרגע'],['unavailable',true,false,'רשימת החברים אינה זמינה כרגע'],
 ['loading',true,true,'בחר משתמש שכבר מחובר אליך']
])test(`friend menu copy reflects ${status}/${connected}/${available}`,()=>assert.equal(expenseFriendChoiceDescription({networkStatus:status,hasConnectedFriends:connected,hasAvailableFriends:available}),want));
test('expense progress buttons announce stage and current position without unsafe markup',()=>{
 const html=renderExpenseFlowProgressView({steps:[{key:'amount',title:'סכום'},{key:'name',title:'שם <img>'},{key:'payer',title:'מי שילם?'}],currentStep:'name'});
 assert.equal((html.match(/<button/g)||[]).length,3);assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
 assert.match(html,/data-step="name"[^>]*aria-current="step"/);assert.match(html,/שלב 2 מתוך 3: שם &lt;img&gt;/);assert.doesNotMatch(html,/<img>/);
});
