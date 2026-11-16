import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {iconSvg} from "../src/uiIcons.mjs";
const source=readFileSync(process.env.INSTALL_TEST_LAYER || "src/publicInstallAppLayer.mjs","utf8");
const uiPath=new URL("../src/ui/installGuidePresentation.mjs",import.meta.url);
const view=existsSync(uiPath) ? await import(uiPath) : null;
function fn(name) {
  const match=new RegExp("(?:async )?function "+name+"\\(").exec(source);
  assert.ok(match,"Missing actual adapter function: "+name);
  const start=match.index,next=source.slice(start+1).search(/\r?\n(?:async )?function /);
  return source.slice(start,next<0?source.length:start+1+next);
}
function harness({ios=false,detached=false,context="profile"}={}) {
  const calls=[],html=[];
  const element=name=>({name,isConnected:true,focus(options){calls.push({focus:name,connected:this.isConnected,options})},setAttribute(...args){calls.push({set:name,args})},removeAttribute(...args){calls.push({remove:name,args})}});
  const details={open:false},old=element("old"),profile=element("profile"),auth=element("auth"),summary=element("summary"),dialog=element("dialog");
  old.isConnected=!detached;
  profile.closest=()=>details;
  old.closest=()=>context==="profile"?details:null;
  const backdrop={remove(){calls.push("backdrop-removed")}};
  const app=element("app"),gate=element("gate");
  const document={body:{insertAdjacentHTML(position,value){assert.equal(position,"beforeend");html.push(value)}},documentElement:{classList:{add:value=>calls.push({addClass:value}),remove:value=>calls.push({removeClass:value})}},querySelector(selector){
    if(selector===".install-app-backdrop")return backdrop;
    if(selector===".install-app-dialog")return dialog;
    if(selector==="#app")return app;
    if(selector==="#public-account-auth-gate")return gate;
    if(selector.includes("data-public-install-app"))return selector.startsWith("#public-account-auth-gate")?auth:profile;
    if(selector===".account-profile-controls-summary")return summary;
    return null;
  }};
  const ctx={document,window:{history:{}},iconSvg,renderInstallGuideView:view?.renderInstallGuideView,isIosDevice:()=>ios,pushInstallHistoryState:()=>calls.push("history"),installDialogReturnFocus:old,installDialogReturnContext:context,installHistoryActive:false,installHistoryClosing:false,INSTALL_BUTTON_SELECTOR:"[data-public-install-app]"};
  const helpers=source.includes("function restoreInstallDialogFocus(")?fn("restoreInstallDialogFocus"):"";
  return {calls,html,details,run(name,args=""){runInNewContext(helpers+"\n"+fn(name)+";"+name+"("+args+")",ctx)}};
}
test("installation opens the approved Android guide with one title and shared Back",()=>{
  const h=harness();h.run("openInstallDialog");const html=h.html[0];
  assert.match(html,/aria-label="חזרה לאפליקציה"/);assert.ok(html.includes(iconSvg("chevron-left")));
  assert.match(html,/פותחים את האפליקציה ישירות ממסך הבית/);assert.match(html,/בוחרים התקנה ומאשרים/);
  assert.equal([...html.matchAll(/<li[ >]/g)].length,2);assert.doesNotMatch(html,/<img|חובה להפעיל/);
});
test("installation iPhone guide retains four ordered steps and conditional web-app instruction",()=>{
  const h=harness({ios:true});h.run("openInstallDialog");const html=h.html[0];
  assert.match(html,/>הוספה למסך הבית<\/h2>/);assert.equal([...html.matchAll(/<li[ >]/g)].length,4);
  assert.match(html,/תפריט העמוד או כפתור השיתוף/);assert.match(html,/אם מופיע <bdi dir="ltr">Open as Web App<\/bdi>/);
  assert.doesNotMatch(html,/חובה להפעיל|קיצור דרך שמרגיש/);
});
test("installation opening retains inertness, history and initial dialog focus",()=>{
  const h=harness();h.run("openInstallDialog");
  assert.ok(h.calls.includes("history"));assert.ok(h.calls.some(x=>x.set==="app"&&x.args[0]==="inert"));assert.ok(h.calls.some(x=>x.set==="gate"&&x.args[0]==="inert"));
  assert.equal(h.calls.find(x=>x.focus)?.focus,"dialog");assert.match(h.html[0],/aria-describedby="install-app-description"/);
});
test("closing installation still returns to the connected clicked opener",()=>{
  const h=harness();h.run("closeInstallDialog","{fromHistory:true}");
  assert.equal(h.calls.find(x=>x.focus)?.focus,"old");assert.ok(h.calls.some(x=>x.remove==="app"));assert.ok(h.calls.some(x=>x.remove==="gate"));
});
test("closing installation recovers the current profile opener after background replacement",()=>{
  const h=harness({detached:true});h.run("closeInstallDialog","{fromHistory:true}");
  assert.equal(h.calls.find(x=>x.focus&&x.connected)?.focus,"profile");assert.equal(h.details.open,true);
});
test("closing installation recovers the auth opener rather than a hidden profile control",()=>{
  const h=harness({detached:true,context:"auth"});h.run("closeInstallDialog","{fromHistory:true}");
  assert.equal(h.calls.find(x=>x.focus&&x.connected)?.focus,"auth");
});
test("pure installation guide ships in both offline inventories without data access",()=>{
  assert.ok(view?.renderInstallGuideView,"Missing pure shared guide");
  assert.equal(readFileSync("sw.js","utf8").split('"/src/ui/installGuidePresentation.mjs"').length-1,2);
  assert.doesNotMatch(readFileSync(uiPath,"utf8"),/localStorage|sessionStorage|fetch\(|Capacitor|history\./);
});
test("actual enhancement removes installation controls in native or installed modes",()=>{
  for(const mode of ["native","installed"]){const removed=[];runInNewContext(fn("enhanceInstallSurface")+";enhanceInstallSurface()",{isInstalledApp:()=>mode==="installed",isNativeApp:()=>mode==="native",INSTALL_BUTTON_SELECTOR:"[data-public-install-app]",document:{querySelectorAll:()=>[1,2].map(id=>({remove:()=>removed.push(id)}))}});assert.deepEqual(removed,[1,2]);}
});
