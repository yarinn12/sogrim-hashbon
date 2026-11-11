import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {geometry,hit,stable,readable} from "./helpers/installGuidePresentation.mjs";
import {installSyntheticSystemText} from "./helpers/accessibilityPresentation.mjs";
const fixture=readFileSync(new URL("./fixtures/profileRewardBootstrap.js",import.meta.url),"utf8"),evidence=new WeakMap();
test.use({serviceWorkers:"block"});
test.beforeEach(async({page})=>{
  const e={errors:[],external:[]};evidence.set(page,e);page.on("pageerror",x=>e.errors.push(x.message));
  await page.route("**/*",r=>new URL(r.request().url()).hostname==="127.0.0.1"?r.continue():(e.external.push(r.request().url()),r.abort()));
  await page.addInitScript({content:fixture});
  for(const [env,file]of [["INSTALL_TEST_LAYER","publicInstallAppLayer.mjs"],["INSTALL_TEST_LEDGER","publicLedgerWorkspaceLayer.mjs"]])if(process.env[env])await page.route("**/src/"+file+"*",r=>r.fulfill({status:200,contentType:"text/javascript",body:readFileSync(process.env[env],"utf8")}));
});
test.afterEach(async({page})=>{expect(evidence.get(page).errors).toEqual([]);expect(evidence.get(page).external).toEqual([]);expect(await page.evaluate(()=>({profile:__friendInviteQa.profileWrites.length,friends:__friendInviteQa.writes.length,reward:__friendInviteQa.rewardWrites.length,deletion:__friendInviteQa.deletionRequests?.length??0}))).toEqual({profile:0,friends:0,reward:0,deletion:0});});
async function platform(page,ios){await page.addInitScript(ios=>Object.defineProperty(navigator,"userAgent",{configurable:true,get:()=>ios?"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1":"Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"}),ios);}
async function enter(page){
  if(!await page.locator(".profile-edit-screen").count())await page.locator('.product-app-nav [data-nav-destination="profile"]').click();
  await expect(page.locator('[data-profile-identity="username"] strong')).toHaveText("noam_levi");
  await expect(page.locator('[data-referral-context="profile"] .referral-reward-detail')).toContainText("מזמינים חבר חדש.");
  const details=page.locator(".account-profile-controls");if(!await details.evaluate(e=>e.open))await details.locator("summary").click();
  const entry=page.locator(".account-profile-actions [data-public-install-app]");await entry.evaluate(e=>e.scrollIntoView({block:"center",behavior:"instant"}));if(await page.evaluate(()=>innerHeight<420||parseFloat(getComputedStyle(document.documentElement).fontSize)>24))await entry.press("Enter");else await entry.click();await expect(page.locator(".install-app-dialog")).toBeFocused();await stable(page);
}
async function open(page,ios=false,root=16){await platform(page,ios);await page.goto("/?requests=empty&reward=inactive"+(root>16?"&dynamic-type-preview="+root:""));await enter(page);}
async function returned(page){await expect(page.locator(".install-app-dialog")).toHaveCount(0);await expect(page.locator(".account-profile-actions [data-public-install-app]")).toBeFocused();await expect(page.locator("#app")).not.toHaveAttribute("inert","");}
for(const [name,ios,root,width,height]of [["android",false,16,393,852],["iphone",true,16,393,852],["iphone32",true,32,320,852],["android32",false,32,320,852],["short32",true,32,320,390],["landscape32",false,32,852,393]])test("installation presentation "+name,async({page},info)=>{
  await page.setViewportSize({width,height});await open(page,ios,root);const d=page.locator(".install-app-dialog");
  await geometry(page,root);await expect(d.locator("li")).toHaveCount(ios?4:2);await expect(d).toHaveAttribute("aria-describedby","install-app-description");
  await d.evaluate(e=>e.scrollTop=0);await page.screenshot({path:info.outputPath(name+"-top.png"),animations:"disabled"});await d.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:info.outputPath(name+"-bottom.png"),animations:"disabled"});
  await hit(d.locator(".install-app-done"));await returned(page);
});
test('installation geometry waits for dialog motion in short landscape',async({page})=>{
  await page.setViewportSize({width:852,height:393});await open(page,true,32);const d=page.locator('.install-app-dialog');
  // Model finite browser motion, which the existing animation barrier observes.
  // An inline transform plus a JS timer can escape that barrier during throttling.
  await d.evaluate(e=>{window.__installGeometryMotion=e.animate([{transform:'translateY(12px) scale(.99)'},{transform:'none'}],{duration:500,fill:'none'});});
  await stable(page);expect(await page.evaluate(()=>window.__installGeometryMotion.playState)).toBe('finished');
  await expect(d).toHaveCSS('transform','none',{timeout:100});await geometry(page,32);
  await hit(d.locator('.install-app-done'));await returned(page);
});

test('installation geometry rejects an unfinished dialog transform',async({page})=>{
  await page.setViewportSize({width:852,height:393});await open(page,true,32);const d=page.locator('.install-app-dialog');
  const offset=await d.evaluate(e=>{
    const animation=e.animate([{transform:'translateY(12px) scale(.99)'},{transform:'none'}],{duration:500,fill:'both'});
    animation.pause();animation.currentTime=0;window.__installGeometryMotion=animation;
    return new DOMMatrixReadOnly(getComputedStyle(e).transform).m42;
  });
  expect(offset).toBeGreaterThan(11);
  await expect(stable(page)).rejects.toThrow();
  expect(await page.evaluate(()=>window.__installGeometryMotion.playState)).toBe('paused');
  await page.evaluate(()=>window.__installGeometryMotion.cancel());
  await stable(page);await hit(d.locator('.install-app-done'));await returned(page);
});
for(const ios of [false,true])test("installation keyboard, Back and simulated browser offer "+(ios?"iphone":"android"),async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("settle-friends-accessibility-preferences-v1",JSON.stringify({textSize:"system",highContrast:true,reduceMotion:true})));
  await open(page,ios);const d=page.locator(".install-app-dialog"),button=page.locator(".account-profile-actions [data-public-install-app]");
  await expect(page.locator("#app")).toHaveAttribute("inert","");await d.focus();await page.keyboard.press("Tab");await expect(d.getByRole("button",{name:"חזרה לאפליקציה"})).toBeFocused();await page.keyboard.press("Shift+Tab");await expect(d.getByRole("button",{name:"הבנתי"})).toBeFocused();await page.keyboard.press("Tab");await expect(d.getByRole("button",{name:"חזרה לאפליקציה"})).toBeFocused();
  await page.keyboard.press("Escape");await returned(page);await button.click();await page.goBack();await returned(page);await button.click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent("settle-friends:native-back",{cancelable:true})));await returned(page);await button.click();await hit(d.getByRole("button",{name:"חזרה לאפליקציה"}));await returned(page);
  for(const outcome of ["dismissed","accepted"]){await page.evaluate(outcome=>{window.__installCalls=0;const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=async()=>window.__installCalls++;e.userChoice=Promise.resolve({outcome});window.dispatchEvent(e)},outcome);await button.click();await expect.poll(()=>page.evaluate(()=>window.__installCalls)).toBe(1);await expect(d).toHaveCount(0);}
  await button.click();await expect(d).toBeVisible();await page.evaluate(()=>{Object.defineProperty(navigator,"standalone",{configurable:true,value:true});window.dispatchEvent(new Event("appinstalled"))});await expect(d).toHaveCount(0);await expect(page.locator("[data-public-install-app]")).toHaveCount(0);await expect(page.locator("#app")).not.toHaveAttribute("inert","");
});
test("installation recovers focus after background profile control replacement",async({page})=>{
  await open(page);await page.evaluate(()=>{const old=document.querySelector(".account-profile-actions [data-public-install-app]");old.replaceWith(old.cloneNode(true));document.querySelector(".account-profile-controls").open=false});
  await page.keyboard.press("Escape");await returned(page);await expect(page.locator(".account-profile-controls")).toHaveAttribute("open","");
});
test("installation respects enlarged system text and restores it after a manual preference",async({page})=>{
  await page.setViewportSize({width:320,height:390});await page.addInitScript(installSyntheticSystemText);await open(page,true);await geometry(page,32);await hit(page.locator(".install-app-done"));await returned(page);
  const accessibility=page.locator('.product-route-controls [data-open-accessibility]');await accessibility.click();await page.locator('.accessibility-segmented-control label:has(input[value="extra-large"])').click();await page.keyboard.press("Escape");await expect(page.locator(".accessibility-center")).toHaveCount(0);await expect(accessibility).toBeFocused();await expect(page.locator("#app")).not.toHaveAttribute("inert","");await enter(page);await geometry(page,20);await hit(page.locator(".install-app-done"));await returned(page);
  await accessibility.click();await page.locator('.accessibility-segmented-control label:has(input[value="system"])').click();await page.keyboard.press("Escape");await expect(page.locator(".accessibility-center")).toHaveCount(0);await expect(accessibility).toBeFocused();await expect(page.locator("#app")).not.toHaveAttribute("inert","");await enter(page);await geometry(page,32);await hit(page.locator(".install-app-done"));await returned(page);
});

test("installation entry remains pointer reachable between the fixed header and navigation",async({page})=>{
  await page.setViewportSize({width:320,height:390});await page.goto("/?requests=empty&reward=inactive&dynamic-type-preview=32");
  await page.locator('.product-app-nav [data-nav-destination="profile"]').click();await expect(page.locator('[data-referral-context="profile"] .referral-reward-detail')).toContainText("מזמינים חבר חדש.");await page.locator('.account-profile-controls summary').click();
  const entry=page.locator('.account-profile-actions [data-public-install-app]');await entry.evaluate(e=>e.scrollIntoView({block:"center",behavior:"instant"}));
  const geometry=await entry.evaluate(e=>{const b=e.getBoundingClientRect(),header=document.querySelector('.product-app-identity').getBoundingClientRect(),nav=document.querySelector('.product-app-nav').getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{top:b.top,bottom:b.bottom,headerBottom:header.bottom,navTop:nav.top,reachable:!!hit&&(e===hit||e.contains(hit))}});
  expect(geometry.reachable).toBe(true);expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom-1);expect(geometry.bottom).toBeLessThanOrEqual(geometry.navTop+1);
  await entry.click();await expect(page.locator('.install-app-dialog')).toBeVisible();await page.keyboard.press('Escape');await returned(page);
});

test("installation description remains readable when dialog motion ends during row inspection",async({page})=>{
  await page.setViewportSize({width:393,height:852});await open(page,true,16);
  const description=page.locator(".install-app-description");
  const initial=await description.evaluate(e=>{
    const dialog=e.closest(".install-app-dialog");
    // The production entrance starts at 12px; 24px makes the stale glyph point reliably miss in Windows WebKit.
    const animation=dialog.animate([{transform:"translateY(24px) scale(.99)"},{transform:"none"}],{duration:1000,fill:"both"});
    animation.pause();animation.currentTime=0;
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"scrollTop");
    Object.defineProperty(dialog,"scrollTop",{configurable:true,get(){return descriptor.get.call(this)},set(value){
      descriptor.set.call(this,value);window.__installMotionScrolled=true;animation.finish();
    }});
    window.__installMotionAnimation=animation;
    return new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m42;
  });
  expect(initial).toBeGreaterThan(20);
  await readable(description);
  expect(await description.evaluate(e=>{
    const range=document.createRange();range.selectNodeContents(e);
    const rect=range.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return window.__installMotionScrolled && window.__installMotionAnimation.playState==="finished" && (hit===e||e.contains(hit));
  })).toBe(true);
});

for(const moving of [false,true])test("installation description rejects text covered by a persistent overlay"+(moving?" during dialog motion":""),async({page})=>{
  await page.setViewportSize({width:393,height:852});await open(page,true,16);
  const description=page.locator(".install-app-description");
  await description.evaluate((e,moving)=>{
    if(moving){
      const dialog=e.closest('.install-app-dialog'),distance=e.getBoundingClientRect().height+24;
      const animation=dialog.animate([{transform:`translateY(${distance}px)`},{transform:'none'}],{duration:1000,fill:'both'});
      animation.pause();animation.currentTime=0;
      const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
      Object.defineProperty(dialog,'scrollTop',{configurable:true,get(){return descriptor.get.call(this)},set(value){descriptor.set.call(this,value);animation.finish();}});
      window.__installBlockerMotion=animation;
    }
    const blocker=document.createElement("div");
    // A persistent occluder must still cover the text after row inspection
    // scrolls or moves its dialog. A saved text rectangle cannot ensure that.
    blocker.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:auto';
    blocker.dataset.installReadabilityBlocker="";document.body.append(blocker);
  },moving);
  expect(await description.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.hasAttribute('data-install-readability-blocker')})).toBe(true);
  await expect(readable(description)).rejects.toThrow();
  if(moving)expect(await page.evaluate(()=>window.__installBlockerMotion.playState)).toBe('finished');
  expect(await description.evaluate(e=>{
    const rect=e.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return hit?.hasAttribute("data-install-readability-blocker");
  })).toBe(true);
});

test("installation description rejects a new covered line after the initial row count",async({page})=>{
  await page.setViewportSize({width:393,height:852});await open(page,true,16);
  const description=page.locator(".install-app-description");
  await description.evaluate(e=>{
    const dialog=e.closest(".install-app-dialog"),descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"scrollTop");
    Object.defineProperty(dialog,"scrollTop",{configurable:true,get(){return descriptor.get.call(this)},set(value){
      descriptor.set.call(this,value);
      if(window.__installAddedRow)return;
      window.__installAddedRow=true;
      e.append(document.createElement("br"),"שורה חדשה שאסור להחמיץ");
      const text=e.lastChild,range=document.createRange();range.selectNodeContents(text);
      const rect=range.getBoundingClientRect(),blocker=document.createElement("div");
      blocker.dataset.installNewRowBlocker="";
      blocker.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:2147483647;pointer-events:auto`;
      document.body.append(blocker);
    }});
  });
  await expect(readable(description)).rejects.toThrow();
  expect(await description.evaluate(e=>{
    if(!window.__installAddedRow)return false;
    const text=e.lastChild,range=document.createRange();range.selectNodeContents(text);
    const rect=range.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return hit?.hasAttribute("data-install-new-row-blocker");
  })).toBe(true);
});
