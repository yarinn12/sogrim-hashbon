import {expect,test} from "@playwright/test";
import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
test.use({serviceWorkers:"block"});
const original={id:"delete-target",name:"ארוחת ערב",total:12000,payers:[{participantId:"delete-owner",amount:12000}],sharedByParticipantIds:["delete-owner"],createdByParticipantId:"delete-owner",occurredOn:"2026-10-20",updatedAt:"2026-10-10T12:00:00.000Z"};
const initial={currentParticipantId:"delete-owner",participants:[{id:"delete-owner",displayName:"בודק מחיקה",kind:"user"}],friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:"delete-event",name:"ערב חברים",eventType:"standard",currency:"ILS",participantIds:["delete-owner"],adminIds:["delete-owner"],createdByParticipantId:"delete-owner",createdAt:"2026-10-10T12:00:00.000Z",updatedAt:"2026-10-10T12:00:00.000Z",expenses:[original,{...original,id:"keep-expense",name:"קניות"}],transfers:[],activityLog:[]}]};
async function setup(page,baseURL,{root=16,long=false,height=852}={}){
 await page.setViewportSize({width:root===32?320:393,height});
 const seed=structuredClone(initial);if(long)seed.events[0].expenses[0].name="כרטיסי רכבת וארוחת ערב לכל המשפחה והחברים בסוף השבוע בירושלים ובתל אביב ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
 const cloud=await personalPinsCloud(page,baseURL,seed,{accountId:"expense-delete-owner"});
 await page.evaluate(root=>{
  const url=new URL(location.href);if(root>16)url.searchParams.set("dynamic-type-preview",String(root));
  history.replaceState(history.state,"",url);document.documentElement.classList.toggle("dynamic-type-preview",root>16);document.documentElement.style.setProperty("font-size",root+"px","important");
 },root);
 await page.locator('[data-action="open-event"][data-event-id="delete-event"]').click();
 const row=page.locator('.expense-row[data-expense-id="delete-target"]');
 const prompt=page.locator('[data-important-action-kind="delete-expense"]');
 const open=async()=>{await row.locator(".expense-row-actions-menu > summary").click();await row.locator('[data-action="delete-expense"]').click();await expect(prompt).toBeVisible();};
 return {cloud,row,prompt,open,cancel:prompt.getByRole("button",{name:"ביטול",exact:true}),confirm:prompt.getByRole("button",{name:"מחק הוצאה",exact:true})};
}
async function geometry(prompt,root){
 const g=await prompt.evaluate(e=>{
  const r=e.getBoundingClientRect(),h=e.querySelector("h2"),p=e.querySelector("p"),context=e.querySelector(".expense-delete-context");
  return {x:r.x,y:r.y,w:r.width,h:r.height,height:innerHeight,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
   heading:parseFloat(getComputedStyle(h).fontSize),copy:parseFloat(getComputedStyle(p).fontSize),name:parseFloat(getComputedStyle(context.querySelector("strong")).fontSize)};
 });
 expect(g.overflow).toBe(false);expect(g.x).toBeGreaterThanOrEqual(0);expect(g.y).toBeGreaterThanOrEqual(0);expect(g.y+g.h).toBeLessThanOrEqual(g.height+1);
 expect(g.heading).toBe(root*1.25);expect(g.copy).toBe(root*.9375);expect(g.name).toBe(root);
 for(const button of await prompt.getByRole("button").all()){
  await button.scrollIntoViewIfNeeded();const b=await button.evaluate(e=>{const r=e.getBoundingClientRect(),text=document.createRange();text.selectNodeContents(e);
   return {w:r.width,h:r.height,visible:r.top>=0&&r.bottom<=innerHeight+1,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),fit:[...text.getClientRects()].every(t=>t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1)};});
  expect(b.w).toBeGreaterThanOrEqual(44);expect(b.h).toBeGreaterThanOrEqual(44);expect(b.visible&&b.hit&&b.fit).toBe(true);
 }
}
for(const root of [16,20,32]){
 test("deletion confirmation is accessible and cancellation preserves the exact expense at root "+root,async({page,baseURL})=>{
  const s=await setup(page,baseURL,{root}),before=s.cloud.state(),writes=s.cloud.writes.length;
  await s.open();await expect(s.cancel).toBeFocused();await expect(s.prompt).toHaveAccessibleName("למחוק את ההוצאה?");
  await expect(s.prompt).toHaveAccessibleDescription(/ארוחת ערב.*120\.00/);
  await expect(s.prompt.locator(".important-action-label")).toHaveCount(0);
  await expect(s.prompt.locator(".expense-delete-context strong")).toHaveText("ארוחת ערב");
  await geometry(s.prompt,root);await s.cancel.click();await expect(s.prompt).toBeHidden();await expect(s.row).toBeVisible();
  expect(s.cloud.state()).toEqual(before);expect(s.cloud.writes.length).toBe(writes);expect(s.cloud.errors).toEqual([]);
 });
 test("confirmed deletion reaches the final cloud acknowledgement and survives reload at root "+root,async({page,baseURL})=>{
  const s=await setup(page,baseURL,{root}),other=s.cloud.state().events[0].expenses.find(e=>e.id==="keep-expense");
  await s.open();await s.confirm.click();await expect(s.prompt).toBeHidden();await expect(s.row).toHaveCount(0);
  await expect.poll(()=>s.cloud.state().events[0].expenses.map(e=>e.id)).toEqual(["keep-expense"]);
  expect(s.cloud.state().events[0].expenses[0]).toEqual(other);
  expect(s.cloud.writes.at(-1).state.events[0].expenses).toEqual([other]);
  await s.cloud.reload();await page.locator('[data-action="open-event"][data-event-id="delete-event"]').click();
  await expect(s.row).toHaveCount(0);await expect(page.locator('.expense-row[data-expense-id="keep-expense"]')).toBeVisible();expect(s.cloud.errors).toEqual([]);
 });
}
test("Escape, native Back and browser Back cancel deletion without a write",async({page,baseURL})=>{
 const s=await setup(page,baseURL),before=s.cloud.state(),writes=s.cloud.writes.length;
 for(const exit of [()=>page.keyboard.press("Escape"),()=>page.evaluate(()=>window.dispatchEvent(new Event("settle-friends:native-back",{cancelable:true}))),()=>page.goBack()]){
  await s.open();await exit();await expect(s.prompt).toBeHidden();await expect(s.row).toBeVisible();
  expect(s.cloud.state()).toEqual(before);expect(s.cloud.writes.length).toBe(writes);
 }
 expect(s.cloud.errors).toEqual([]);
});
test("long expense name and very large text retain full context and reachable actions",async({page,baseURL})=>{
 const s=await setup(page,baseURL,{root:32,long:true});await s.open();await geometry(s.prompt,32);
 await expect(s.prompt.locator(".expense-delete-context strong")).toHaveText(/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$/);
 await s.cancel.click();await expect(s.row).toBeVisible();expect(s.cloud.errors).toEqual([]);
});
test("short viewport keeps cancellation reachable and keyboard focus inside the dialog",async({page,baseURL})=>{
 const s=await setup(page,baseURL,{root:20,height:390});await s.open();await expect(s.cancel).toBeFocused();
 await page.keyboard.press("Shift+Tab");await expect(s.confirm).toBeFocused();await page.keyboard.press("Tab");await expect(s.cancel).toBeFocused();
 await geometry(s.prompt,20);await s.cancel.click();await expect(s.row).toBeVisible();expect(s.cloud.errors).toEqual([]);
});
