import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {geometry,hit,stable} from "./helpers/installGuidePresentation.mjs";
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
async function platform(page,ios){if(ios)await page.addInitScript(()=>Object.defineProperty(navigator,"userAgent",{configurable:true,get:()=>"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"}));}
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
