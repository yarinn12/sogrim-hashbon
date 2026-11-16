import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderEventSettingsOverviewView,handleEventSettingsPhotoKeydown} from "../src/ui/eventSettingsOverviewPresentation.mjs";
function harness(key="Enter",disabled=false){let clicks=0,prevented=0;const input={disabled,click(){clicks++}},label={querySelector:()=>input};const event={key,target:{closest:()=>label},preventDefault(){prevented++}};return{event,input,label,counts:()=>({clicks,prevented})}}
test("photo keyboard activation retains native-routed original input and prevents duplicate default activation",()=>{
 for(const key of ["Enter"," "]){const h=harness(key);assert.equal(handleEventSettingsPhotoKeydown(h.event),true);assert.deepEqual(h.counts(),{clicks:1,prevented:1})}
});
test("photo keyboard activation never clicks a disabled source input",()=>{const h=harness("Enter",true);assert.equal(handleEventSettingsPhotoKeydown(h.event),true);assert.deepEqual(h.counts(),{clicks:0,prevented:1})});
test("other keys, prevented events and unrelated controls retain their existing key handlers",()=>{
 const h=harness("Escape");assert.equal(handleEventSettingsPhotoKeydown(h.event),false);h.event.key="Enter";h.event.defaultPrevented=true;assert.equal(handleEventSettingsPhotoKeydown(h.event),false);h.event.defaultPrevented=false;h.event.target.closest=()=>null;assert.equal(handleEventSettingsPhotoKeydown(h.event),false);assert.deepEqual(h.counts(),{clicks:0,prevented:0});
});
test("untrusted cover URL and identifier are escaped without changing supplied model",()=>{
 const model={eventId:'x"><img>',eventName:'אירוע',coverImage:'x" onerror="bad',canManage:true},before=structuredClone(model);
 const result=renderEventSettingsOverviewView(model,{renderEventDialogShell:x=>x,renderEventSettingsMenuItem:()=>""});assert(result.body.includes('src="x&quot; onerror=&quot;bad"'));assert(result.body.includes('data-event-id="x&quot;&gt;&lt;img&gt;"'));assert(!result.body.includes('src="x" onerror='));assert.deepEqual(model,before);
});
test("settings UI module remains presentation-only and available in both offline inventories",()=>{
 const source=readFileSync('src/ui/eventSettingsOverviewPresentation.mjs','utf8');assert.doesNotMatch(source,/from ["'][^"']*(?:data|domain|server)\//);assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage/);assert.equal(readFileSync('sw.js','utf8').split('"/src/ui/eventSettingsOverviewPresentation.mjs"').length-1,2);
});
