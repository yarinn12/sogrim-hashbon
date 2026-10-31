import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderEventManagementView} from "../src/ui/eventManagementPresentation.mjs";
function render(overrides={}){return renderEventManagementView({eventId:"id",eventName:"אירוע",adminNames:"נועם",adminCount:1,selectedMode:"collaborative",modeIds:{centralized:"centralized",collaborative:"collaborative"},disabled:false,canManage:true,locked:false,...overrides},{renderEventDialogShell:m=>m})}
test("management view escapes identifier, mode IDs and manager names without changing supplied model",()=>{
 const model={eventId:'id"><img>',adminNames:'<script>bad</script>',modeIds:{centralized:'c" onclick="bad',collaborative:'collaborative'}},before=structuredClone(model);const html=render(model).body;assert(html.includes('data-event-id="id&quot;&gt;&lt;img&gt;"'));assert(html.includes('data-management-mode="c&quot; onclick=&quot;bad"'));assert(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert(!html.includes('<img>'));assert(!html.includes('<script>'));assert.deepEqual(model,before);
});
test("management radio group keeps original labels and one roving Tab target including original empty-mode fallback",()=>{
 for(const selectedMode of ["centralized","collaborative",""]){const html=render({selectedMode}).body;assert(html.includes('<legend>מי יעדכן את ההוצאות?</legend>'));assert(html.includes('role="radiogroup" aria-label="מי יעדכן את ההוצאות"'));assert.equal((html.match(/tabindex="0"/g)||[]).length,1);assert.equal((html.match(/aria-checked="true"/g)||[]).length,selectedMode?1:0);assert(html.includes('app-selection-check'));}
});
test("management view honors supplied disabled state and locked explanation precedence",()=>{
 const html=render({disabled:true,canManage:false,locked:true}).body;assert.equal((html.match(/\sdisabled/g)||[]).length,2);assert(html.includes('האירוע נעול.'));assert(!html.includes('רק מנהלי האירוע יכולים לשנות את אופן הניהול.'));assert(!html.includes('data-action="create-event"'));
});
test("management presentation has no persistence/domain dependency and is cached in both offline inventories",()=>{
 const source=readFileSync('src/ui/eventManagementPresentation.mjs','utf8');assert.doesNotMatch(source,/from ["'][^"']*(?:data|domain|server)\//);assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage/);assert.equal(readFileSync('sw.js','utf8').split('"/src/ui/eventManagementPresentation.mjs"').length-1,2);
});
