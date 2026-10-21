import {expect,test} from "@playwright/test";import {personalPinsCloud} from "./helpers/personalPinsCloud.mjs";
test.use({serviceWorkers:"block"});
const eventId="interim-event",owner="interim-owner",a="interim-a",b="interim-b";
function seed({single=false,empty=false,closed=false}={}){
 const ids=single?[owner,a]:[owner,a,b];
 return {currentParticipantId:owner,participants:ids.map(id=>({id,displayName:id===owner?"ירין ישראלי":id===a?"דנה לוי":"איתי כהן",kind:id===owner?"user":"guest"})),friendContacts:[],groups:[],deletedEvents:[],deletedParticipants:[],events:[{id:eventId,name:"סוף שבוע בצפון",eventType:"standard",currency:"ILS",participantIds:ids,adminIds:[owner],createdByParticipantId:owner,createdAt:"2026-10-10T10:00:00.000Z",updatedAt:"2026-10-10T10:00:00.000Z",locked:closed,expenses:empty?[]:[{id:"dinner",name:"ארוחת ערב",total:12000,payers:[{participantId:owner,amount:7000},{participantId:a,amount:5000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"},{id:"shopping",name:"קניות",total:12000,payers:[{participantId:owner,amount:12000}],sharedByParticipantIds:ids,createdByParticipantId:owner,occurredOn:"2026-10-20",updatedAt:"2026-10-10T10:00:00.000Z"}],transfers:[],activityLog:[]}]};
}
async function setup(page,baseURL,{root=16,height=852,...options}={}){
 await page.setViewportSize({width:root===32?320:393,height});
 const cloud=await personalPinsCloud(page,baseURL,seed(options),{accountId:"interim-summary-owner"});
 await page.evaluate(root=>{const url=new URL(location.href);if(root>16)url.searchParams.set("dynamic-type-preview",String(root));history.replaceState(history.state,"",url);document.documentElement.classList.toggle("dynamic-type-preview",root>16);document.documentElement.style.setProperty("font-size",root+"px","important");},root);
 await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();
 await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
 const screen=page.locator(".settlement-screen");await expect(screen).toBeVisible();return {cloud,screen};
}
const amounts=cloud=>cloud.state().events[0].expenses.map(e=>({id:e.id,total:e.total,payers:e.payers,sharedByParticipantIds:e.sharedByParticipantIds}));
async function controls(screen){
 const last=screen.locator('.settlement-list-actions [data-action="copy-event-report"]');
 await screen.locator(".settlement-list-actions > summary").click();await last.scrollIntoViewIfNeeded();
 const g=await last.evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
 expect(g.w).toBeGreaterThanOrEqual(44);expect(g.h).toBeGreaterThanOrEqual(44);expect(g.hit).toBe(true);
 await screen.locator(".settlement-list-actions > summary").click();
}
for(const root of [16,20,32]){
 test("open interim copy and cancellation preserve the exact expenses at root "+root,async({page,baseURL})=>{
  const {cloud,screen}=await setup(page,baseURL,{root});const before=amounts(cloud);
  await expect(screen.locator(".settlement-hero")).toHaveAttribute("data-settlement-phase","interim");
  await expect(screen.locator(".settlement-hero")).toContainText("סיכום ביניים");
  await expect(screen.locator(".transfer-status")).toHaveText(["יתרה זמנית","יתרה זמנית"]);
  await expect(screen.locator('[data-action="mark-paid"]')).toHaveCount(0);
  const style=await screen.evaluate(e=>({copy:parseFloat(getComputedStyle(e.querySelector(".settlement-hero-title-row p")).fontSize),title:parseFloat(getComputedStyle(e.querySelector(".settlement-hero-title-row h2")).fontSize),background:getComputedStyle(e.querySelector(".settlement-hero-actions")).backgroundColor,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
  expect(style.copy).toBe(root*.875);expect(style.title).toBe(root*1.25);expect(style.background).toBe("rgba(0, 0, 0, 0)");expect(style.overflow).toBe(false);
  await controls(screen);await screen.locator(".settlement-close-primary").click();
  const dialog=page.locator(".settlement-close-confirmation");await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"ביטול",exact:true}).click();await expect(dialog).toBeHidden();
  expect(amounts(cloud)).toEqual(before);expect(!!cloud.state().events[0].locked).toBe(false);expect(cloud.errors).toEqual([]);
 });
 test("closing enables real payment completion and preserves its final cloud ACK at root "+root,async({page,baseURL})=>{
  const {cloud,screen}=await setup(page,baseURL,{root}),before=amounts(cloud);
  await screen.locator(".settlement-close-primary").click();await page.locator('[data-action="confirm-close-event"]').click();
  await expect.poll(()=>cloud.state().events[0].locked).toBe(true);await expect(screen.locator(".settlement-hero")).toHaveAttribute("data-settlement-phase","existing");
  await expect(screen.locator(".transfer-status")).toHaveText(["מחכה שיגיע","מחכה שיגיע"]);
  const row=screen.locator(".transfer-row").first(),id=await row.getAttribute("data-transfer-id");
  await row.locator('[data-action="mark-paid"]').click();
  await expect.poll(()=>cloud.state().events[0].transfers.find(t=>t.id===id)?.status).toBe("paid");
  expect(amounts(cloud)).toEqual(before);
  expect(cloud.writes.at(-1).state.events[0].transfers.find(t=>t.id===id)?.status).toBe("paid");
  await cloud.reload();await page.locator('[data-action="open-event"][data-event-id="'+eventId+'"]').click();await page.getByRole("button",{name:"פתיחת הסיכום: מי מעביר למי",exact:true}).click();
  await expect(screen.locator('.transfer-row[data-transfer-id="'+id+'"]')).toHaveAttribute("data-transfer-status","paid");expect(amounts(cloud)).toEqual(before);expect(cloud.errors).toEqual([]);
 });
}
test("large type gives the transfer heading full width and keeps the shortcut compact",async({page,baseURL})=>{
 const {screen}=await setup(page,baseURL,{root:32});
 const g=await screen.locator(".settlement-stage-heading").evaluate(e=>{const p=e.getBoundingClientRect(),copy=e.querySelector(":scope > div").getBoundingClientRect(),button=e.querySelector("button").getBoundingClientRect();return {parent:p.width,copy:copy.width,below:button.top>=copy.bottom,buttonH:button.height};});
 expect(g.copy).toBeGreaterThanOrEqual(g.parent-1);expect(g.below).toBe(true);expect(g.buttonH).toBeLessThan(110);
 await controls(screen);
});
test("single transfer uses interim language and only gets payment controls after closure",async({page,baseURL})=>{
 const {screen,cloud}=await setup(page,baseURL,{single:true});
 await expect(screen.locator(".settlement-hero.is-explained")).toHaveAttribute("data-settlement-phase","interim");
 await expect(screen.locator(".settlement-featured-action")).toContainText("סיכום ביניים");
 await expect(screen.locator(".settlement-featured-amount")).toHaveText("₪70.00");
 await expect(screen.locator('[data-action="mark-paid"]')).toHaveCount(0);
 await screen.locator(".settlement-close-primary").click();await page.locator('[data-action="confirm-close-event"]').click();
 await expect(screen.locator(".settlement-featured-complete")).toBeVisible();expect(cloud.errors).toEqual([]);
});
test("short viewport preserves the bottom sharing action and closure cancellation",async({page,baseURL})=>{
 const {screen,cloud}=await setup(page,baseURL,{root:20,height:390});await controls(screen);
 await screen.locator(".settlement-close-primary").click();await page.locator(".settlement-close-confirmation").getByRole("button",{name:"ביטול",exact:true}).click();
 await expect(screen).toBeVisible();expect(!!cloud.state().events[0].locked).toBe(false);expect(cloud.errors).toEqual([]);
});
test("empty summary keeps the existing add-expense action without an interim payment panel",async({page,baseURL})=>{
 const {screen}=await setup(page,baseURL,{empty:true});
 await expect(screen).toContainText("אין עדיין סיכום");await expect(screen.locator('[data-action="show-expense-form"]')).toBeVisible();
 await expect(screen.locator(".transfer-row")).toHaveCount(0);await expect(screen.locator('[data-settlement-phase="interim"]')).toHaveCount(0);
});
