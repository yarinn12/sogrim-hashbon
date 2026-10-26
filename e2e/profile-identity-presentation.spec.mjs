import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {profileIdentityReady,profileIdentityReach,clickProfileIdentity,profileIdentityGeometry} from "./helpers/profileIdentityPresentation.mjs";
const bootstrap=readFileSync(new URL('./fixtures/profileIdentityBootstrap.js',import.meta.url),'utf8');
test.use({serviceWorkers:'block'});
const observed=new WeakMap();
test.beforeEach(async({page})=>{
 const evidence={errors:[],external:[],overrides:[]};observed.set(page,evidence);page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(evidence.external.push(r.request().url()),r.abort()));
 for(const[env,module]of [['PROFILE_IDENTITY_TEST_APP','app.mjs'],['PROFILE_IDENTITY_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env]){const body=readFileSync(process.env[env],'utf8');await page.route('**/src/'+module+'*',async route=>{evidence.overrides.push(module);await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body})})}
 await page.addInitScript({content:bootstrap});
});
test.afterEach(async({page})=>{const evidence=observed.get(page);expect(evidence.errors).toEqual([]);expect(evidence.external).toEqual([]);for(const[env,module]of [['PROFILE_IDENTITY_TEST_APP','app.mjs'],['PROFILE_IDENTITY_TEST_LEDGER','publicLedgerWorkspaceLayer.mjs']])if(process.env[env])expect(evidence.overrides).toContain(module)});
const state=page=>page.evaluate(()=>({events:JSON.parse(localStorage.getItem('qa-invite-server-row')).state.events,writes:__friendInviteQa.writes,profileWrites:__friendInviteQa.profileWrites}));
async function open(page,root,long){await page.goto('/?requests=empty'+(root>16?'&dynamic-type-preview='+root:'')+(long?'&long-profile=1':''));await expect(page.locator('.product-app-nav [data-nav-destination="profile"]')).toBeVisible();await page.locator('.product-app-nav [data-nav-destination="profile"]').click();await profileIdentityReady(page,long)}
for(const[id,root,w,h,long]of [['normal',16,393,852,false],['text20',20,411,852,false],['text32',32,320,852,false],['short',32,320,390,false],['long',32,320,852,true]])test(`profile identity ${id} scales glyphs and cancels edits without saving`,async({page},testInfo)=>{
 await page.setViewportSize({width:w,height:h});await open(page,root,long);const before=await state(page);
 // Real glyph geometry is first so frozen-source regression proves actual typography failure.
 await profileIdentityGeometry(page,root);
 await expect(page.locator('.profile-edit-screen>.top .muted')).toHaveCount(0);
 await expect(page.locator('.profile-identity-entry .profile-shortcut-chevron')).toHaveCount(2);
 await expect(page.locator('[data-profile-identity="display-name"] .profile-identity-copy>span')).toHaveText('שם מלא');
 await page.screenshot({path:testInfo.outputPath(id+'-top.png'),animations:'disabled'});
 for(const selector of ['[data-profile-identity="display-name"]','[data-profile-identity="username"]','.profile-friends-entry','.profile-accessibility-entry','.profile-avatar-picker-summary','[data-account-controls]>summary'])await profileIdentityReach(page.locator(selector));
 await page.screenshot({path:testInfo.outputPath(id+'-bottom.png'),animations:'disabled'});
const editName=page.locator('[data-action="edit-profile-name"]');await profileIdentityReach(editName);await clickProfileIdentity(editName);const nameInput=page.locator('[data-action="profile-name"]');await expect(nameInput).toBeVisible();await expect(nameInput).toBeFocused();await profileIdentityReach(nameInput);expect(await nameInput.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(root);await nameInput.fill('נועם טיוטת בדיקה');const cancelName=page.locator('[data-action="cancel-profile-name-edit"]');await profileIdentityReach(cancelName);await clickProfileIdentity(cancelName);await expect(page.locator('[data-action="edit-profile-name"]')).toBeFocused();await expect(page.locator('[data-profile-identity="display-name"] strong')).toHaveText(long?'נועם אלכסנדר לוי כהן עם שם משפחה ארוך ABCDEFGHIJKLMNOPQRSTUVWXYZ':'נועם לוי');
const editUser=page.locator('[data-action="edit-profile-username"]');await profileIdentityReach(editUser);await clickProfileIdentity(editUser);const userInput=page.locator('[data-action="profile-username"]');await expect(userInput).toBeVisible();await expect(userInput).toBeFocused();await profileIdentityReach(userInput);expect(await userInput.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(root);await userInput.fill('qa_draft_name');const cancelUser=page.locator('[data-action="cancel-profile-username-edit"]');await profileIdentityReach(cancelUser);await clickProfileIdentity(cancelUser);await expect(page.locator('[data-action="edit-profile-username"]')).toBeFocused();await expect(page.locator('[data-profile-identity="username"] strong')).toHaveText(long?'noam_alexander_levi_1234':'noam_levi');
const avatar=page.locator('.profile-avatar-picker-summary');await profileIdentityReach(avatar);await clickProfileIdentity(avatar);await expect(page.locator('.profile-avatar-picker-shell')).toHaveAttribute('open','');await expect(page.locator('[data-image-source="camera"][data-action="choose-profile-avatar-image"]')).toBeVisible();await expect(page.locator('[data-image-source="gallery"][data-action="choose-profile-avatar-image"]')).toBeVisible();await profileIdentityReach(avatar);await clickProfileIdentity(avatar);await expect(page.locator('.profile-avatar-picker-shell')).not.toHaveAttribute('open','');

 const after=await state(page);expect(after.events).toEqual(before.events);expect(after.writes).toEqual([]);expect(after.profileWrites).toEqual(before.profileWrites);
});

test('profile identity survives reload rotation and text reset',async({page})=>{await page.setViewportSize({width:320,height:390});await open(page,32,true);await profileIdentityGeometry(page,32);await page.reload();await page.locator('.product-app-nav [data-nav-destination="profile"]').click();await profileIdentityReady(page,true);await profileIdentityGeometry(page,32);for(const size of [{width:852,height:393},{width:661,height:852}]){await page.setViewportSize(size);await profileIdentityGeometry(page,32)}await page.setViewportSize({width:393,height:852});await open(page,16,false);await profileIdentityGeometry(page,16)});

test('profile identity respects system enlargement already active before opening',async({page})=>{
 await page.setViewportSize({width:320,height:390});await page.addInitScript(()=>{const supports=CSS.supports.bind(CSS);CSS.supports=(...a)=>a[0]==='font'&&a[1]==='-apple-system-body'?true:supports(...a);const media=matchMedia.bind(window);window.matchMedia=q=>{const m=media(q);return q.replaceAll(' ','')==='(any-pointer:coarse)'?{matches:true,media:q,addEventListener:m.addEventListener.bind(m),removeEventListener:m.removeEventListener.bind(m),addListener:m.addListener.bind(m),removeListener:m.removeListener.bind(m)}:m};const insert=()=>{const s=document.createElement('style');s.textContent='#apple-system-body-size-probe{font-size:34px!important}';document.head.append(s)};if(document.head)insert();else document.addEventListener('DOMContentLoaded',insert,{once:true})});
 await open(page,16,true);await profileIdentityGeometry(page,32);for(const selector of ['[data-profile-identity="display-name"]','[data-profile-identity="username"]','.profile-friends-entry','.profile-accessibility-entry'])await profileIdentityReach(page.locator(selector));
});
